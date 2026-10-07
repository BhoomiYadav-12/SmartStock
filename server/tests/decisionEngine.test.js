const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const User = require("../models/User");
const InventoryTransaction = require("../models/InventoryTransaction");
const decisionEngineRoutes = require("../routes/decisionEngineRoutes");
const {
  buildProductScope,
  buildOutTransactionScope,
  createDecision,
  summarizeDecisions
} = require("../services/decisionEngine");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 31);
const productId = "64b000000000000000000001";
const workspaceId = "64b000000000000000000002";
const staffId = "64b000000000000000000003";

const makeProduct = (overrides = {}) => ({
  _id: productId,
  name: "Test product",
  quantity: 8,
  lowStockThreshold: 4,
  supplierLeadTimeDays: 2,
  ...overrides
});

const makeHistory = (quantities = [3, 3, 3], dates = [2, 1, 0]) => quantities.map((quantity, index) => ({
  quantity,
  createdAt: new Date(now - dates[index] * DAY)
}));

test("sufficient OUT history calculates demand, lead-time demand, reorder point and explanation", () => {
  const decision = createDecision(makeProduct(), makeHistory(), now);
  assert.equal(decision.totalUnitsConsumed, 9);
  assert.equal(decision.outTransactionCount, 3);
  assert.equal(decision.averageDailyDemand, 4.5);
  assert.equal(decision.expectedLeadTimeDemand, 9);
  assert.equal(decision.reorderPoint, 13);
  assert.equal(decision.action, "REORDER_NOW");
  assert.match(decision.explanation, /Current stock is 8 units/);
  assert.match(decision.explanation, /reorder point of 13 units/);
});

test("stock below reorder point recommends reorder now", () => {
  const decision = createDecision(makeProduct({ quantity: 10 }), makeHistory(), now);
  assert.equal(decision.action, "REORDER_NOW");
  assert.ok(decision.recommendedOrderQuantity > 0);
});

test("stock just above reorder point is classified as reorder soon", () => {
  const decision = createDecision(makeProduct({ quantity: 20 }), makeHistory(), now);
  assert.equal(decision.reorderPoint, 13);
  assert.equal(decision.action, "REORDER_SOON");
});

test("stock above the near-term reorder band but below target is monitored", () => {
  const decision = createDecision(makeProduct({ quantity: 50 }), makeHistory(), now);
  assert.equal(decision.action, "MONITOR");
});

test("stock above target is healthy and never recommends a negative quantity", () => {
  const decision = createDecision(makeProduct({ quantity: 200 }), makeHistory(), now);
  assert.equal(decision.action, "HEALTHY");
  assert.equal(decision.recommendedOrderQuantity, 0);
});

test("zero demand history is marked insufficient with unknown risk", () => {
  const decision = createDecision(makeProduct(), [], now);
  assert.equal(decision.action, "INSUFFICIENT_DATA");
  assert.equal(decision.averageDailyDemand, null);
  assert.equal(decision.risk, "UNKNOWN");
  assert.equal(decision.recommendedOrderQuantity, null);
});

test("fewer than three transactions is insufficient", () => {
  const decision = createDecision(makeProduct(), makeHistory([2, 1], [2, 0]), now);
  assert.equal(decision.action, "INSUFFICIENT_DATA");
  assert.equal(decision.demandTransactionsUsed, 2);
});

test("zero stock is urgent even when there is not enough history to size an order", () => {
  const decision = createDecision(makeProduct({ quantity: 0 }), [], now);
  assert.equal(decision.action, "REORDER_NOW");
  assert.equal(decision.risk, "HIGH");
  assert.equal(decision.recommendedOrderQuantity, null);
  assert.match(decision.explanation, /no stock available/i);
});

test("high demand and long lead time produce high risk and a larger reorder point", () => {
  const history = makeHistory([15, 15, 10], [10, 5, 0]);
  const decision = createDecision(makeProduct({ quantity: 20, lowStockThreshold: 5, supplierLeadTimeDays: 20 }), history, now);
  assert.equal(decision.averageDailyDemand, 4);
  assert.equal(decision.expectedLeadTimeDemand, 80);
  assert.equal(decision.reorderPoint, 85);
  assert.equal(decision.risk, "HIGH");
  assert.ok(decision.recommendedOrderQuantity > 0);
});

test("multiple products receive independent decisions and aggregate counts", () => {
  const decisions = [
    createDecision(makeProduct({ quantity: 200 }), makeHistory(), now),
    createDecision(makeProduct({ _id: "other", quantity: 0 }), [], now),
    createDecision(makeProduct({ _id: "third", supplierLeadTimeDays: null }), makeHistory(), now)
  ];
  assert.deepEqual(summarizeDecisions(decisions), {
    totalProducts: 3,
    healthy: 1,
    monitor: 0,
    reorderSoon: 0,
    reorderNow: 1,
    insufficientData: 1
  });
});

test("staff product and demand queries are constrained to the authenticated workspace", () => {
  assert.deepEqual(buildProductScope({ organization: workspaceId, role: "staff", _id: staffId }), {
    organization: workspaceId,
    $or: [{ assignedTo: staffId }, { "distributions.user": staffId }]
  });
  assert.deepEqual(buildOutTransactionScope(workspaceId, [productId]), {
    organization: workspaceId,
    type: "OUT",
    product: { $in: [productId] }
  });
});

test("the decision endpoint rejects unauthenticated requests", async (t) => {
  const app = express();
  app.use("/api/decision-engine", decisionEngineRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/decision-engine`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test("authenticated endpoint returns workspace-scoped inventory decisions", async (t) => {
  const originalUserFindById = User.findById;
  const originalProductFind = Product.find;
  const originalTransactionFind = InventoryTransaction.find;
  const previousJwtSecret = process.env.JWT_SECRET;
  const secret = "decision-engine-test-secret";
  process.env.JWT_SECRET = secret;

  const scopedUser = {
    _id: staffId,
    organization: workspaceId,
    role: "staff",
    status: "active",
    name: "Test staff",
    password: "temporary"
  };
  const scopedProducts = [makeProduct({ _id: productId })];
  const scopedTransactions = makeHistory();
  let productFilter;
  let transactionFilter;

  User.findById = async () => ({ ...scopedUser });
  Product.find = (filter) => {
    productFilter = filter;
    return { sort: async () => scopedProducts };
  };
  InventoryTransaction.find = (filter) => {
    transactionFilter = filter;
    return { sort: async () => scopedTransactions.map((transaction) => ({ ...transaction, product: { toString: () => productId } })) };
  };
  t.after(() => {
    User.findById = originalUserFindById;
    Product.find = originalProductFind;
    InventoryTransaction.find = originalTransactionFind;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  const app = express();
  app.use("/api/decision-engine", decisionEngineRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const token = jwt.sign({ userId: staffId }, secret);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/decision-engine`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.totalProducts, 1);
  assert.equal(body.products[0].action, "REORDER_NOW");
  assert.equal(productFilter.organization, workspaceId);
  assert.deepEqual(productFilter.$or, [{ assignedTo: staffId }, { "distributions.user": staffId }]);
  assert.equal(transactionFilter.organization, workspaceId);
  assert.equal(transactionFilter.type, "OUT");
  assert.deepEqual(transactionFilter.product.$in, [productId]);
});

test("legacy product documents without lead time stay valid and recommendations remain insufficient", async () => {
  const legacyProduct = new Product({
    user: workspaceId,
    name: "Legacy product",
    category: "General",
    quantity: 5,
    price: 1
  });
  assert.equal(legacyProduct.supplierLeadTimeDays, null);
  await legacyProduct.validate();
  const decision = createDecision(legacyProduct, makeHistory(), now);
  assert.equal(decision.supplierLeadTimeDays, null);
  assert.equal(decision.action, "INSUFFICIENT_DATA");
});

test("supplier lead time must be a positive integer when provided", async () => {
  const product = new Product({
    user: workspaceId,
    name: "Invalid lead time",
    category: "General",
    quantity: 1,
    price: 1,
    supplierLeadTimeDays: 1.5
  });
  await assert.rejects(product.validate(), (error) => Boolean(error.errors.supplierLeadTimeDays));
});

test("recent history is preferred when it has enough transactions", () => {
  const history = [
    ...makeHistory([50, 50, 50], [150, 140, 130]),
    ...makeHistory([2, 2, 2], [2, 1, 0])
  ];
  const decision = createDecision(makeProduct(), history, now);
  assert.equal(decision.totalUnitsConsumed, 156);
  assert.equal(decision.demandTransactionsUsed, 3);
  assert.equal(decision.demandWindow, "RECENT_90_DAYS");
  assert.equal(decision.averageDailyDemand, 3);
});

test("all-history fallback uses actual dates and outputs finite values", () => {
  const history = makeHistory([4, 4, 4], [200, 190, 180]);
  const decision = createDecision(makeProduct(), history, now);
  assert.equal(decision.demandWindow, "ALL_AVAILABLE_HISTORY");
  assert.equal(decision.totalUnitsConsumed, 12);
  for (const value of Object.values(decision)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const User = require("../models/User");
const InventoryTransaction = require("../models/InventoryTransaction");
const assistantRoutes = require("../routes/assistantRoutes");
const { createDecision } = require("../services/decisionEngine");
const { detectIntent, findMentionedProduct, createAnswer } = require("../services/inventoryAssistant");

const organizationId = "64b000000000000000000301";
const userId = "64b000000000000000000302";
const staffId = "64b000000000000000000303";
const laptopId = "64b000000000000000000304";
const mouseId = "64b000000000000000000305";
const now = Date.UTC(2026, 9, 6, 12);

const makeProduct = (id, name, overrides = {}) => ({
  _id: id,
  organization: organizationId,
  name,
  category: "Electronics",
  image: "",
  quantity: 4,
  lowStockThreshold: 8,
  price: 100,
  supplierLeadTimeDays: 2,
  assignedTo: null,
  distributions: [],
  ...overrides
});

const laptop = makeProduct(laptopId, "Laptop", { quantity: 3 });
const mouse = makeProduct(mouseId, "Mouse", { quantity: 80, lowStockThreshold: 5, supplierLeadTimeDays: 2 });
const makeHistory = (productId = laptopId, quantities = [3, 4, 5]) => quantities.map((quantity, index) => ({
  _id: `tx-${productId}-${index}`,
  organization: organizationId,
  product: productId,
  productName: productId === laptopId ? "Laptop" : "Mouse",
  type: "OUT",
  quantity,
  previousQuantity: 20,
  newQuantity: 20 - quantity,
  performedByName: "Alex",
  createdAt: new Date(now - (quantities.length - index - 1) * 24 * 60 * 60 * 1000)
}));

const laptopDecision = createDecision(laptop, makeHistory(), now);
const mouseDecision = createDecision(mouse, makeHistory(mouseId, [2, 2, 2]), now);

test("empty and unsupported questions are safely classified", () => {
  assert.equal(detectIntent("   "), "empty");
  assert.equal(detectIntent("Can you write a poem?"), "unknown");
});

test("requested everyday question examples resolve to supported intents", () => {
  assert.equal(detectIntent("Which products should I reorder?"), "reorder");
  assert.equal(detectIntent("Which products are high risk?"), "high_risk");
  assert.equal(detectIntent("Show me unusual inventory activity."), "anomalies");
  assert.equal(detectIntent("Which products are low in stock?"), "low_stock");
  assert.equal(detectIntent("What is the demand for Laptop?"), "demand");
  assert.equal(detectIntent("Show me my assigned inventory."), "assigned_inventory");
  assert.equal(detectIntent("Show recent transactions for Laptop."), "transactions");
  assert.equal(detectIntent("Which products need attention?"), "attention");
});

test("reorder question uses supplied Decision Engine actions", () => {
  const response = createAnswer({ intent: "reorder", products: [laptop, mouse], decisions: [laptopDecision, mouseDecision] });
  assert.match(response.answer, /Laptop/);
  assert.ok(response.products.some((item) => item.name === "Laptop"));
  assert.ok(response.products.every((item) => item.action === "REORDER_NOW" || item.action === "REORDER_SOON"));
});

test("high-risk answer is based on the existing risk classification", () => {
  const zeroStock = makeProduct(mouseId, "Mouse", { quantity: 0 });
  const decision = createDecision(zeroStock, [], now);
  const response = createAnswer({ intent: "high_risk", products: [zeroStock], decisions: [decision] });
  assert.match(response.answer, /high risk/i);
  assert.equal(response.products[0].risk, "HIGH");
});

test("low-stock answer compares actual quantity with the saved threshold", () => {
  const response = createAnswer({ intent: "low_stock", products: [laptop, mouse], question: "Which products are low in stock?" });
  assert.match(response.answer, /Laptop/);
  assert.deepEqual(response.products.map((item) => item.name), ["Laptop"]);
});

test("demand question ranks products by Decision Engine average daily demand", () => {
  const response = createAnswer({ intent: "demand", products: [laptop, mouse], decisions: [laptopDecision, mouseDecision], question: "Which product has the highest demand?" });
  assert.equal(response.products[0].name, "Laptop");
  assert.match(response.answer, /units per day/);
});

test("anomaly responses reuse detector findings and explanations", () => {
  const anomaly = { product: { id: laptopId, name: "Laptop" }, anomalyType: "UNUSUAL_STOCK_OUT", severity: "HIGH", explanation: "OUT of 40 is above the prior median of 5.", deviation: { percent: 700, multiplier: 8 } };
  const response = createAnswer({ intent: "anomalies", products: [laptop], anomalies: [anomaly] });
  assert.match(response.answer, /unusual activity/i);
  assert.equal(response.products[0].severity, "HIGH");
  assert.match(response.products[0].explanation, /prior median/);
});

test("product-specific questions use the matching visible product and current decision", () => {
  const visible = [{ _id: laptopId, name: "Laptop" }, { _id: mouseId, name: "Mouse" }];
  const match = findMentionedProduct("Why is Laptop high risk?", visible);
  const response = createAnswer({ intent: "product_risk", product: laptop, products: [laptop], decisions: [laptopDecision] });
  assert.equal(match._id, laptopId);
  assert.match(response.answer, /Current stock is 3 units/);
  assert.match(response.answer, /reorder point/);
});

test("product matching prefers the longest exact visible product name", () => {
  const match = findMentionedProduct("What is demand for USB Mouse?", [
    { _id: "short", name: "Mouse" }, { _id: "long", name: "USB Mouse" }
  ]);
  assert.equal(match._id, "long");
  assert.equal(findMentionedProduct("Tell me about another product", [{ _id: laptopId, name: "Laptop" }]), null);
});

test("assigned-inventory answer only totals the staff member's own allocation", () => {
  const assigned = makeProduct(laptopId, "Laptop", { distributions: [
    { user: staffId, quantity: 4, name: "Staff member" }, { user: userId, quantity: 90, name: "Other member" }
  ] });
  const response = createAnswer({ intent: "assigned_inventory", product: assigned, products: [assigned], members: [{ _id: staffId, name: "Staff member" }], user: { _id: staffId, role: "staff" } });
  assert.match(response.answer, /4 units/);
  assert.doesNotMatch(response.answer, /90|Other member/);
});

test("transaction answer includes only the supplied recent authorized records", () => {
  const transactions = [{ productName: "Laptop", type: "TRANSFER", quantity: 4, performedByName: "Alex", createdAt: new Date(now), note: "Project" }];
  const response = createAnswer({ intent: "transactions", transactions });
  assert.match(response.answer, /Laptop: TRANSFER 4 units/);
  assert.match(response.answer, /by Alex/);
  assert.equal(response.insights[0].note, "Project");
});

test("unknown questions receive the supported-intents guide", () => {
  const response = createAnswer({ intent: "unknown" });
  assert.match(response.answer, /reorder decisions/);
  assert.equal(response.products.length, 0);
});

test("insufficient demand history is stated without inventing a demand value", () => {
  const noHistory = createDecision(laptop, [], now);
  const response = createAnswer({ intent: "demand", product: laptop, products: [laptop], decisions: [noHistory] });
  assert.match(response.answer, /don't have enough historical stock-out transactions/i);
  assert.equal(response.products.length, 0);
});

test("multiple-product response includes each product requiring reorder", () => {
  const second = makeProduct(mouseId, "Mouse", { quantity: 1 });
  const secondDecision = createDecision(second, makeHistory(mouseId), now);
  const response = createAnswer({ intent: "reorder", products: [laptop, second], decisions: [laptopDecision, secondDecision] });
  assert.deepEqual(response.products.map((item) => item.name), ["Laptop", "Mouse"]);
});

const startAssistantApi = async (t, { user, products = [], transactions = [], members = [] }) => {
  const originals = {
    userFindById: User.findById,
    userFind: User.find,
    productFind: Product.find,
    productFindOne: Product.findOne,
    transactionFind: InventoryTransaction.find
  };
  const oldSecret = process.env.JWT_SECRET;
  const secret = "assistant-endpoint-test-secret";
  process.env.JWT_SECRET = secret;
  const productScopes = [];
  const transactionScopes = [];
  User.findById = async () => ({ ...user, password: "hidden" });
  User.find = (filter) => {
    const query = { select: () => query, lean: async () => members };
    query.filter = filter;
    return query;
  };
  Product.find = (filter) => {
    productScopes.push(filter);
    const query = {
      sort: () => query,
      select: () => { query.namesOnly = true; return query; },
      lean: async () => query.namesOnly ? products.map(({ _id, name }) => ({ _id, name })) : products
    };
    return query;
  };
  Product.findOne = (filter) => ({ lean: async () => products.find((item) => String(item._id) === String(filter._id) && String(item.organization) === String(filter.organization)) || null });
  InventoryTransaction.find = (filter) => {
    transactionScopes.push(filter);
    const query = { sort: () => query, limit: () => query, populate: () => query, lean: async () => {
      if (filter.type === "OUT") return transactions.filter((item) => item.type === "OUT");
      if (Array.isArray(filter.type?.$in)) return transactions.filter((item) => filter.type.$in.includes(item.type));
      return transactions;
    } };
    return query;
  };

  const app = express();
  app.use(express.json());
  app.use("/api/assistant", assistantRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  t.after(() => {
    User.findById = originals.userFindById;
    User.find = originals.userFind;
    Product.find = originals.productFind;
    Product.findOne = originals.productFindOne;
    InventoryTransaction.find = originals.transactionFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/api/assistant`,
    token: jwt.sign({ userId: user._id }, secret),
    productScopes,
    transactionScopes
  };
};

test("assistant endpoint requires authentication", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/assistant", assistantRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assistant`, { method: "POST", body: JSON.stringify({ message: "Which products should I reorder?" }), headers: { "Content-Type": "application/json" } });
  assert.equal(response.status, 401);
});

test("empty assistant question returns a client error", async (t) => {
  const api = await startAssistantApi(t, { user: { _id: userId, organization: organizationId, role: "admin", status: "active", name: "Owner" } });
  const response = await fetch(api.url, { method: "POST", headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: "  " }) });
  assert.equal(response.status, 400);
});

test("assistant product and transaction reads stay inside the user's workspace and staff visibility", async (t) => {
  const staffProduct = makeProduct(laptopId, "Laptop", { assignedTo: staffId });
  const transactions = makeHistory(laptopId);
  const api = await startAssistantApi(t, {
    user: { _id: staffId, organization: organizationId, role: "staff", status: "active", name: "Staff" },
    products: [staffProduct],
    transactions
  });
  const response = await fetch(api.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Why is Laptop high risk?" })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.answer, /Laptop/);
  assert.ok(api.productScopes.every((scope) => scope.organization === organizationId));
  assert.deepEqual(api.productScopes[0].$or, [{ assignedTo: staffId }, { "distributions.user": staffId }]);
  assert.ok(api.transactionScopes.every((scope) => scope.organization === organizationId));
  assert.deepEqual(api.transactionScopes[0].product.$in, [laptopId]);
});

test("reorder endpoint response is generated from scoped products and real decision inputs", async (t) => {
  const api = await startAssistantApi(t, {
    user: { _id: userId, organization: organizationId, role: "admin", status: "active", name: "Owner" },
    products: [laptop],
    transactions: makeHistory(laptopId)
  });
  const response = await fetch(api.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Which products should I reorder?" })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.answer, /Laptop/);
  assert.equal(body.products[0].name, "Laptop");
  assert.equal(body.products[0].currentStock, laptop.quantity);
  assert.ok(body.products[0].recommendedOrderQuantity > 0);
  assert.ok(api.transactionScopes[0].organization === organizationId);
});

test("anomaly endpoint reuses the existing detector against workspace transactions", async (t) => {
  const largeOut = [20, 15, 10].map((days, index) => ({ ...makeHistory(laptopId, [5, 5, 5])[0], _id: `baseline-${index}`, quantity: 5, createdAt: new Date(now - days * 24 * 60 * 60 * 1000) }));
  largeOut.push({ ...makeHistory(laptopId, [60])[0], _id: "outlier", quantity: 60, createdAt: new Date(now - 24 * 60 * 60 * 1000) });
  const api = await startAssistantApi(t, {
    user: { _id: userId, organization: organizationId, role: "admin", status: "active", name: "Owner" },
    products: [laptop],
    transactions: largeOut
  });
  const response = await fetch(api.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${api.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Show me unusual inventory activity." })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.products[0].name, "Laptop");
  assert.equal(body.products[0].severity, "HIGH");
  assert.ok(body.products[0].explanation.includes("prior median"));
  assert.equal(api.transactionScopes[0].organization, organizationId);
});

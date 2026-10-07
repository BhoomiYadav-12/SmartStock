const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const User = require("../models/User");
const InventoryTransaction = require("../models/InventoryTransaction");
const simulatorRoutes = require("../routes/simulatorRoutes");
const { createDecision } = require("../services/decisionEngine");
const { simulateInventory } = require("../services/inventorySimulator");

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(Date.UTC(2026, 0, 31));
const productId = "64b000000000000000000101";
const organizationId = "64b000000000000000000102";
const userId = "64b000000000000000000103";

const makeProduct = (overrides = {}) => ({
  _id: productId,
  organization: organizationId,
  assignedTo: userId,
  distributions: [],
  name: "Simulator product",
  quantity: 40,
  lowStockThreshold: 4,
  supplierLeadTimeDays: 5,
  ...overrides
});

const makeTransactions = (quantities = [5, 5, 5], dayOffsets = [3, 1.5, 0]) => quantities.map((quantity, index) => ({
  product: productId,
  organization: organizationId,
  type: "OUT",
  quantity,
  createdAt: new Date(now.getTime() - dayOffsets[index] * DAY)
}));

const baselineFor = (product = makeProduct(), transactions = makeTransactions()) => createDecision(product, transactions, now.getTime());

test("normal scenario preserves current values and returns a readable comparison", () => {
  const baseline = baselineFor();
  const result = simulateInventory(baseline, {
    demandChangePercent: 0,
    leadTimeChangeDays: 0,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.current.currentStock, 40);
  assert.equal(result.current.averageDailyDemand, 5);
  assert.equal(result.simulated.averageDailyDemand, 5);
  assert.equal(result.simulated.supplierLeadTimeDays, 5);
  assert.equal(result.current.risk, result.simulated.risk);
  assert.equal(result.current.recommendedOrderQuantity, result.simulated.recommendedOrderQuantity);
  assert.match(result.explanation, /Demand is unchanged/);
});

test("positive demand change scales daily demand", () => {
  const result = simulateInventory(baselineFor(), {
    demandChangePercent: 30,
    leadTimeChangeDays: 0,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.averageDailyDemand, 6.5);
  assert.match(result.explanation, /increased by 30%/);
});

test("negative demand change lowers daily demand", () => {
  const result = simulateInventory(baselineFor(), {
    demandChangePercent: -20,
    leadTimeChangeDays: 0,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.averageDailyDemand, 4);
});

test("a complete demand reduction safely avoids division by zero", () => {
  const result = simulateInventory(baselineFor(), {
    demandChangePercent: -100,
    leadTimeChangeDays: 0,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.averageDailyDemand, 0);
  assert.equal(result.simulated.estimatedDaysUntilStockout, null);
  assert.equal(result.simulated.estimatedStockoutDate, null);
  assert.equal(result.simulated.risk, "LOW");
  assert.match(result.explanation, /not projected at zero demand/);
});

test("supplier delay adds to the existing lead time", () => {
  const result = simulateInventory(baselineFor(), {
    demandChangePercent: 0,
    leadTimeChangeDays: 7,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.supplierLeadTimeDays, 12);
  assert.match(result.explanation, /adds 7 days/);
});

test("combined demand increase and supplier delay update all scenario values consistently", () => {
  const result = simulateInventory(baselineFor(), {
    demandChangePercent: 30,
    leadTimeChangeDays: 7,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.averageDailyDemand, 6.5);
  assert.equal(result.simulated.supplierLeadTimeDays, 12);
  assert.equal(result.simulated.expectedLeadTimeDemand, 78);
  assert.equal(result.simulated.reorderPoint, 82);
  assert.equal(result.simulated.estimatedDaysUntilStockout, 6.15);
  assert.equal(result.simulated.risk, "HIGH");
  assert.equal(result.simulated.action, "REORDER_NOW");
  assert.ok(result.simulated.recommendedOrderQuantity > 0);
  assert.notEqual(result.current.risk, result.simulated.risk);
  assert.match(result.explanation, /Risk changes from MEDIUM to HIGH/);
});

test("zero stock remains urgent and never produces an invalid stockout date", () => {
  const result = simulateInventory(baselineFor(makeProduct({ quantity: 0 }), []), {
    demandChangePercent: 20,
    leadTimeChangeDays: 7,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.estimatedDaysUntilStockout, 0);
  assert.equal(result.simulated.risk, "HIGH");
  assert.equal(result.simulated.action, "REORDER_NOW");
  assert.equal(result.simulated.recommendedOrderQuantity, null);
  assert.equal(result.simulated.estimatedStockoutDate, now.toISOString());
});

test("insufficient demand history stays explicit and does not invent order quantities", () => {
  const baseline = baselineFor(makeProduct(), makeTransactions([5, 5], [1, 0]));
  const result = simulateInventory(baseline, {
    demandChangePercent: 30,
    leadTimeChangeDays: 7,
    simulationHorizonDays: 30
  }, now);
  assert.equal(result.simulated.action, "INSUFFICIENT_DATA");
  assert.equal(result.simulated.risk, "UNKNOWN");
  assert.equal(result.simulated.recommendedOrderQuantity, null);
});

const openSimulatorApi = async (t, { product = makeProduct(), transactions = makeTransactions() } = {}) => {
  const originals = {
    userFindById: User.findById,
    productFindOne: Product.findOne,
    transactionFind: InventoryTransaction.find,
    productUpdateOne: Product.updateOne,
    productFindOneAndUpdate: Product.findOneAndUpdate,
    transactionCreate: InventoryTransaction.create
  };
  const previousSecret = process.env.JWT_SECRET;
  const secret = "simulator-endpoint-test-secret";
  process.env.JWT_SECRET = secret;
  let productScope;
  let transactionScope;
  let writeAttempts = 0;

  User.findById = async () => ({
    _id: userId,
    organization: organizationId,
    role: "staff",
    status: "active",
    name: "Simulation tester",
    password: "temporary"
  });
  Product.findOne = async (filter) => {
    productScope = filter;
    return product;
  };
  InventoryTransaction.find = (filter) => {
    transactionScope = filter;
    return { sort: async () => transactions };
  };
  Product.updateOne = async () => { writeAttempts += 1; };
  Product.findOneAndUpdate = async () => { writeAttempts += 1; };
  InventoryTransaction.create = async () => { writeAttempts += 1; };

  const app = express();
  app.use(express.json());
  app.use("/api/simulator", simulatorRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  t.after(() => {
    User.findById = originals.userFindById;
    Product.findOne = originals.productFindOne;
    InventoryTransaction.find = originals.transactionFind;
    Product.updateOne = originals.productUpdateOne;
    Product.findOneAndUpdate = originals.productFindOneAndUpdate;
    InventoryTransaction.create = originals.transactionCreate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  return {
    url: `http://127.0.0.1:${server.address().port}/api/simulator`,
    token: jwt.sign({ userId }, secret),
    get productScope() { return productScope; },
    get transactionScope() { return transactionScope; },
    get writeAttempts() { return writeAttempts; }
  };
};

test("simulator endpoint rejects unauthenticated requests", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/simulator", simulatorRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId })
  });
  assert.equal(response.status, 401);
});

test("invalid product ids are rejected before any inventory lookup", async (t) => {
  const api = await openSimulatorApi(t);
  const response = await fetch(api.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.token}` },
    body: JSON.stringify({ productId: "invalid" })
  });
  assert.equal(response.status, 400);
});

test("cross-workspace product access returns not found with workspace and staff filters", async (t) => {
  const api = await openSimulatorApi(t, { product: null });
  const response = await fetch(api.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.token}` },
    body: JSON.stringify({ productId })
  });
  assert.equal(response.status, 404);
  assert.equal(api.productScope.organization, organizationId);
  assert.deepEqual(api.productScope.$or, [{ assignedTo: userId }, { "distributions.user": userId }]);
});

test("simulation endpoint is read-only and demand data is workspace-scoped", async (t) => {
  const product = makeProduct();
  const initialQuantity = product.quantity;
  const api = await openSimulatorApi(t, { product });
  const response = await fetch(api.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.token}` },
    body: JSON.stringify({ productId, demandChangePercent: 30, leadTimeChangeDays: 7 })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.simulated.averageDailyDemand, 6.5);
  assert.equal(body.simulated.supplierLeadTimeDays, 12);
  assert.equal(api.productScope.organization, organizationId);
  assert.equal(api.transactionScope.organization, organizationId);
  assert.equal(api.transactionScope.type, "OUT");
  assert.equal(api.writeAttempts, 0);
  assert.equal(product.quantity, initialQuantity);
});

test("simulator validates demand, delay, and horizon boundaries", async (t) => {
  const api = await openSimulatorApi(t);
  const invalidScenarios = [
    { demandChangePercent: 301 },
    { demandChangePercent: -101 },
    { leadTimeChangeDays: -1 },
    { leadTimeChangeDays: 1.5 },
    { simulationHorizonDays: 0 }
  ];
  for (const scenario of invalidScenarios) {
    const response = await fetch(api.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({ productId, ...scenario })
    });
    assert.equal(response.status, 400);
  }
});

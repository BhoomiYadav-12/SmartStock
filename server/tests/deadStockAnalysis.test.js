const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const User = require("../models/User");
const InventoryTransaction = require("../models/InventoryTransaction");
const deadStockRoutes = require("../routes/deadStockRoutes");
const { analyzeDeadStock } = require("../services/deadStockAnalysis");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 6, 12);
const orgId = "64b000000000000000000301";
const userId = "64b000000000000000000302";
const productId = "64b000000000000000000303";
const otherProductId = "64b000000000000000000304";
const product = (id = productId, overrides = {}) => ({ _id: id, organization: orgId, name: id === productId ? "Laptop" : "Monitor", quantity: 50, lowStockThreshold: 5, price: 10, ...overrides });
const movement = (type, quantity, daysAgo, id = `${type}-${daysAgo}`, productRef = productId) => ({ _id: id, organization: orgId, product: productRef, type, quantity, createdAt: new Date(now - daysAgo * DAY) });
const history = (values = [20, 10, 5]) => values.map((day, index) => movement("OUT", 10, day, `out-${index}`));

test("no history is marked insufficient with unknown severity", () => {
  const result = analyzeDeadStock([product()], [], now);
  assert.equal(result.items[0].status, "INSUFFICIENT_DATA");
  assert.equal(result.items[0].severity, "UNKNOWN");
  assert.equal(result.items[0].averageDailyOutDemand, null);
});

test("fewer than three recorded stock-outs stays insufficient", () => {
  const result = analyzeDeadStock([product()], [movement("OUT", 4, 10), movement("OUT", 3, 5)], now);
  assert.equal(result.items[0].status, "INSUFFICIENT_DATA");
});

test("no recent stock-out with established history is no movement and review", () => {
  const result = analyzeDeadStock([product()], history([150, 130, 110]), now);
  assert.equal(result.items[0].status, "NO_MOVEMENT");
  assert.equal(result.items[0].recommendedAction, "REVIEW");
  assert.equal(result.items[0].outQuantity90Days, 0);
});

test("low stock with no recent movement receives medium severity", () => {
  const result = analyzeDeadStock([product(productId, { quantity: 2, lowStockThreshold: 5 })], history([150, 130, 110]), now);
  assert.equal(result.items[0].status, "NO_MOVEMENT");
  assert.equal(result.items[0].severity, "MEDIUM");
});

test("no stock remains active and is not counted as tied-up inventory", () => {
  const result = analyzeDeadStock([product(productId, { quantity: 0 })], history(), now);
  assert.equal(result.items[0].status, "ACTIVE");
  assert.equal(result.items[0].estimatedTiedUpValue, 0);
});

test("very low demand and high coverage identifies excess stock", () => {
  const result = analyzeDeadStock([product()], [movement("OUT", 1, 60), movement("OUT", 1, 30), movement("OUT", 1, 1)], now);
  assert.equal(result.items[0].status, "EXCESS_STOCK");
  assert.equal(result.items[0].recommendedAction, "REDUCE_REORDERING");
  assert.ok(result.items[0].daysOfStockCoverage > 180);
});

test("365-plus days of demand coverage is high severity", () => {
  const result = analyzeDeadStock([product(productId, { quantity: 500 })], [movement("OUT", 1, 60), movement("OUT", 1, 30), movement("OUT", 1, 1)], now);
  assert.equal(result.items[0].severity, "HIGH");
});

test("moderate excess coverage is slow moving and recommends usage", () => {
  const result = analyzeDeadStock([product(productId, { quantity: 100 })], [movement("OUT", 30, 60), movement("OUT", 30, 30), movement("OUT", 30, 1)], now);
  assert.equal(result.items[0].status, "SLOW_MOVING");
  assert.equal(result.items[0].recommendedAction, "PROMOTE_USAGE");
});

test("regular demand is active", () => {
  const result = analyzeDeadStock([product(productId, { quantity: 10 })], [movement("OUT", 100, 60), movement("OUT", 100, 30), movement("OUT", 100, 1)], now);
  assert.equal(result.items[0].status, "ACTIVE");
  assert.equal(result.items[0].severity, "LOW");
});

test("IN and transfer records count as movements but not demand", () => {
  const result = analyzeDeadStock([product()], [movement("OUT", 2, 5), movement("OUT", 4, 95), movement("OUT", 3, 120), movement("IN", 8, 1), movement("TRANSFER", 3, 0)], now);
  assert.equal(result.items[0].daysSinceLastMovement, 0);
  assert.equal(result.items[0].outQuantity90Days, 2);
  assert.equal(result.items[0].averageDailyOutDemand, 0.02);
});

test("recorded price produces a clearly estimated tied-up value", () => {
  const result = analyzeDeadStock([product()], [], now);
  assert.equal(result.items[0].estimatedTiedUpValue, 500);
  assert.equal(result.summary.estimatedTiedUpValue, 500);
  assert.equal(result.items[0].financialValueAvailable, true);
});

test("missing price keeps financial estimate unavailable", () => {
  const result = analyzeDeadStock([product(productId, { price: undefined })], [], now);
  assert.equal(result.items[0].estimatedTiedUpValue, null);
  assert.equal(result.summary.estimatedTiedUpValue, null);
  assert.equal(result.summary.financialValueUnavailableCount, 1);
});

test("products are analyzed independently and summaries reconcile", () => {
  const result = analyzeDeadStock([product(), product(otherProductId)], history(), now);
  assert.equal(result.items.length, 2);
  assert.equal(result.summary.totalProducts, 2);
  assert.ok(result.items.every((item) => item.productId));
});

test("days since last movement uses the newest recorded transaction date", () => {
  const result = analyzeDeadStock([product()], [movement("OUT", 2, 25), movement("IN", 7, 4), movement("TRANSFER", 1, 8)], now);
  assert.equal(result.items[0].daysSinceLastMovement, 4);
  assert.equal(result.items[0].lastMovementAt, new Date(now - 4 * DAY).toISOString());
});

const startApi = async (t, products, transactions) => {
  const originals = { userFindById: User.findById, productFind: Product.find, transactionFind: InventoryTransaction.find };
  const oldSecret = process.env.JWT_SECRET;
  const secret = "dead-stock-api-test-secret";
  process.env.JWT_SECRET = secret;
  let productScope;
  let transactionScope;
  User.findById = async () => ({ _id: userId, organization: orgId, role: "admin", status: "active", name: "Owner" });
  Product.find = (filter) => { productScope = filter; return { sort() { return this; }, lean: async () => products }; };
  InventoryTransaction.find = (filter) => { transactionScope = filter; return { sort() { return this; }, lean: async () => transactions }; };
  const app = express();
  app.use("/api/dead-stock", deadStockRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  t.after(() => {
    User.findById = originals.userFindById;
    Product.find = originals.productFind;
    InventoryTransaction.find = originals.transactionFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  return { url: `http://127.0.0.1:${server.address().port}/api/dead-stock`, token: jwt.sign({ userId }, secret), get productScope() { return productScope; }, get transactionScope() { return transactionScope; } };
};

test("dead-stock endpoint requires authentication", async (t) => {
  const app = express(); app.use("/api/dead-stock", deadStockRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dead-stock`);
  assert.equal(response.status, 401);
});

test("dead-stock endpoint scopes product and transaction queries to workspace products", async (t) => {
  const api = await startApi(t, [product(), product(otherProductId)], [movement("OUT", 5, 3)]);
  const response = await fetch(api.url, { headers: { Authorization: `Bearer ${api.token}` } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(api.productScope.organization, orgId);
  assert.equal(api.transactionScope.organization, orgId);
  assert.deepEqual(api.transactionScope.product.$in, [productId, otherProductId]);
  assert.deepEqual(api.transactionScope.type.$in, ["IN", "OUT", "TRANSFER", "RETURN"]);
  assert.equal(body.summary.totalProducts, 2);
});

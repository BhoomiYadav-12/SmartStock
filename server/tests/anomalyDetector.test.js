const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const User = require("../models/User");
const InventoryTransaction = require("../models/InventoryTransaction");
const Organization = require("../models/Organization");
const anomalyRoutes = require("../routes/anomalyRoutes");
const { analyzeInventoryAnomalies } = require("../services/anomalyDetector");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 6, 12);
const organizationId = "64b000000000000000000201";
const otherOrganizationId = "64b000000000000000000202";
const userId = "64b000000000000000000203";
const staffId = "64b000000000000000000204";
const productId = "64b000000000000000000205";
const secondProductId = "64b000000000000000000206";

const makeProduct = (id = productId, overrides = {}) => ({
  _id: id,
  organization: organizationId,
  assignedTo: staffId,
  distributions: [],
  name: id === productId ? "Laptop" : "Monitor",
  category: "Electronics",
  quantity: 30,
  ...overrides
});

const makeTransaction = (type, quantity, daysAgo, id = `${type}-${quantity}-${daysAgo}`, product = productId) => ({
  _id: id,
  organization: organizationId,
  product,
  type,
  quantity,
  previousQuantity: 100,
  newQuantity: type === "OUT" ? 100 - quantity : 100 + quantity,
  note: "recorded movement",
  createdAt: new Date(now - daysAgo * DAY)
});

test("no transactions reports insufficient data and no anomalies", () => {
  const result = analyzeInventoryAnomalies([makeProduct()], [], now);
  assert.equal(result.summary.totalAnomalies, 0);
  assert.equal(result.summary.insufficientDataCount, 1);
  assert.match(result.insufficientProducts[0].message, /Insufficient data/);
});

test("fewer than three relevant movements do not produce a baseline", () => {
  const result = analyzeInventoryAnomalies([makeProduct()], [
    makeTransaction("OUT", 5, 2), makeTransaction("OUT", 6, 1)
  ], now);
  assert.equal(result.summary.insufficientDataCount, 1);
  assert.equal(result.anomalies.length, 0);
});

test("normal repeated movements with enough history do not produce anomalies", () => {
  const history = [25, 20, 15, 1].map((day, index) => makeTransaction("OUT", 10 + (index % 2), day, `normal-${index}`));
  const result = analyzeInventoryAnomalies([makeProduct()], history, now);
  assert.equal(result.summary.insufficientDataCount, 0);
  assert.equal(result.anomalies.length, 0);
});

test("an unusually large OUT movement is flagged and explained", () => {
  const history = [60, 50, 40].map((day, index) => makeTransaction("OUT", 8 + index, day, `out-base-${index}`));
  history.push(makeTransaction("OUT", 80, 1, "out-spike"));
  const result = analyzeInventoryAnomalies([makeProduct()], history, now);
  const anomaly = result.anomalies.find((item) => item.anomalyType === "UNUSUAL_STOCK_OUT");
  assert.ok(anomaly);
  assert.equal(anomaly.severity, "HIGH");
  assert.equal(anomaly.observedValue, 80);
  assert.equal(anomaly.baselineValue, 9);
  assert.match(anomaly.explanation, /prior median/);
  assert.equal(anomaly.relatedTransactions.at(-1).id, "out-spike");
});

test("an unusually large IN movement is flagged using the IN baseline", () => {
  const history = [10, 8, 6].map((day, index) => makeTransaction("IN", 5 + (index % 2), day, `in-base-${index}`));
  history.push(makeTransaction("IN", 40, 1, "in-spike"));
  const result = analyzeInventoryAnomalies([makeProduct()], history, now);
  const anomaly = result.anomalies.find((item) => item.anomalyType === "UNUSUAL_STOCK_IN");
  assert.ok(anomaly);
  assert.equal(anomaly.severity, "HIGH");
  assert.match(anomaly.explanation, /IN quantity of 40/);
});

test("demand spike compares recent daily demand with a prior baseline", () => {
  const baseline = [32, 27, 22, 17, 12].map((day, index) => makeTransaction("OUT", 4, day, `demand-base-${index}`));
  const recent = [6, 4, 2].map((day, index) => makeTransaction("OUT", 15, day, `demand-recent-${index}`));
  const result = analyzeInventoryAnomalies([makeProduct()], [...baseline, ...recent], now);
  const anomaly = result.anomalies.find((item) => item.anomalyType === "DEMAND_SPIKE");
  assert.ok(anomaly);
  assert.equal(anomaly.severity, "HIGH");
  assert.equal(anomaly.unit, "units/day");
  assert.match(anomaly.explanation, /Recent daily OUT demand/);
});

test("three repeated OUT movements in 24 hours can flag rapid activity", () => {
  const baseline = [12, 8, 4].map((day, index) => makeTransaction("OUT", 5, day, `rapid-base-${index}`));
  const recent = [0.8, 0.4, 0.1].map((day, index) => makeTransaction("OUT", 5, day, `rapid-recent-${index}`));
  const result = analyzeInventoryAnomalies([makeProduct()], [...baseline, ...recent], now);
  const anomaly = result.anomalies.find((item) => item.anomalyType === "RAPID_MOVEMENT");
  assert.ok(anomaly);
  assert.equal(anomaly.severity, "HIGH");
  assert.equal(anomaly.observedValue, 3);
  assert.match(anomaly.explanation, /within 24 hours/);
});

test("severity thresholds are deterministic at medium and high deviation", () => {
  const history = [10, 10, 10].map((quantity, index) => makeTransaction("OUT", quantity, 8 - index, `severity-base-${index}`));
  history.push(makeTransaction("OUT", 20, 1, "medium-spike"));
  const medium = analyzeInventoryAnomalies([makeProduct()], history, now).anomalies.find((item) => item.anomalyType === "UNUSUAL_STOCK_OUT");
  assert.equal(medium.severity, "MEDIUM");
  history[3] = makeTransaction("OUT", 30, 1, "high-spike");
  const high = analyzeInventoryAnomalies([makeProduct()], history, now).anomalies.find((item) => item.anomalyType === "UNUSUAL_STOCK_OUT");
  assert.equal(high.severity, "HIGH");
});

test("products are analyzed independently and summary counts match findings", () => {
  const products = [makeProduct(), makeProduct(secondProductId)];
  const history = [
    ...[10, 9, 8].map((quantity, index) => makeTransaction("OUT", quantity, 60 - index * 5, `multi-base-${index}`, productId)),
    makeTransaction("OUT", 50, 1, "multi-spike", productId),
    makeTransaction("IN", 8, 2, "second-only-1", secondProductId)
  ];
  const result = analyzeInventoryAnomalies(products, history, now);
  assert.equal(result.summary.productCount, 2);
  assert.equal(result.summary.totalAnomalies, result.anomalies.length);
  assert.ok(result.anomalies.every((anomaly) => anomaly.product.id === productId));
  assert.equal(result.summary.insufficientDataCount, 1);
});

const startAnomalyApi = async (t, { user, products = [], transactions = [] }) => {
  const originals = {
    userFindById: User.findById,
    userFindOneAndUpdate: User.findOneAndUpdate,
    organizationFindOne: Organization.findOne,
    organizationCreate: Organization.create,
    productFind: Product.find,
    productUpdateMany: Product.updateMany,
    transactionFind: InventoryTransaction.find,
    transactionUpdateMany: InventoryTransaction.updateMany
  };
  const oldSecret = process.env.JWT_SECRET;
  const secret = "anomaly-endpoint-test-secret";
  process.env.JWT_SECRET = secret;
  let productScope;
  let transactionScope;
  User.findById = async () => ({ ...user, password: "not-returned" });
  User.findOneAndUpdate = async (_filter, update) => ({ ...user, organization: update.$set.organization });
  Organization.findOne = async () => null;
  Organization.create = async () => ({ _id: organizationId });
  Product.find = (filter) => {
    productScope = filter;
    return { sort: async () => products };
  };
  Product.updateMany = async () => ({ modifiedCount: 0 });
  InventoryTransaction.find = (filter) => {
    transactionScope = filter;
    return { sort: async () => transactions };
  };
  InventoryTransaction.updateMany = async () => ({ modifiedCount: 0 });

  const app = express();
  app.use("/api/anomalies", anomalyRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  t.after(() => {
    User.findById = originals.userFindById;
    User.findOneAndUpdate = originals.userFindOneAndUpdate;
    Organization.findOne = originals.organizationFindOne;
    Organization.create = originals.organizationCreate;
    Product.find = originals.productFind;
    Product.updateMany = originals.productUpdateMany;
    InventoryTransaction.find = originals.transactionFind;
    InventoryTransaction.updateMany = originals.transactionUpdateMany;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  return {
    url: `http://127.0.0.1:${server.address().port}/api/anomalies`,
    token: jwt.sign({ userId: user._id }, secret),
    get productScope() { return productScope; },
    get transactionScope() { return transactionScope; }
  };
};

test("anomaly endpoint rejects unauthenticated requests", async (t) => {
  const app = express();
  app.use("/api/anomalies", anomalyRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/anomalies`);
  assert.equal(response.status, 401);
});

test("staff endpoint only queries authorized products and same-workspace movements", async (t) => {
  const product = makeProduct();
  const api = await startAnomalyApi(t, {
    user: { _id: staffId, organization: organizationId, role: "staff", status: "active", name: "Staff" },
    products: [product],
    transactions: []
  });
  const response = await fetch(api.url, { headers: { Authorization: `Bearer ${api.token}` } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(api.productScope.$or, [{ assignedTo: staffId }, { "distributions.user": staffId }]);
  assert.equal(api.productScope.organization, organizationId);
  assert.equal(api.transactionScope.organization, organizationId);
  assert.deepEqual(api.transactionScope.product.$in, [productId]);
  assert.deepEqual(api.transactionScope.type.$in, ["IN", "OUT"]);
  assert.equal(body.insufficientProducts[0].product.name, "Laptop");
});

test("legacy account is assigned its own workspace before scoped anomaly query", async (t) => {
  const api = await startAnomalyApi(t, {
    user: { _id: userId, role: "admin", status: "active", name: "No workspace" },
    products: [makeProduct()]
  });
  const response = await fetch(api.url, { headers: { Authorization: `Bearer ${api.token}` } });
  assert.equal(response.status, 200);
  assert.equal(api.productScope.organization, organizationId);
  assert.equal(api.transactionScope.organization, organizationId);
});

test("organization owner request receives only scoped products and transactions", async (t) => {
  const products = [makeProduct(), makeProduct(secondProductId)];
  const transactions = [makeTransaction("OUT", 4, 1, "scoped-tx", productId)];
  const api = await startAnomalyApi(t, {
    user: { _id: userId, organization: organizationId, role: "admin", status: "active", name: "Owner" },
    products,
    transactions
  });
  const response = await fetch(api.url, { headers: { Authorization: `Bearer ${api.token}` } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(api.productScope.organization, organizationId);
  assert.equal(api.transactionScope.organization, organizationId);
  assert.deepEqual(api.transactionScope.product.$in, [productId, secondProductId]);
  assert.equal(body.summary.productCount, 2);
  assert.equal(otherOrganizationId === api.transactionScope.organization, false);
});

/*
 * Seed realistic StockSutra demo inventory into one explicitly selected,
 * existing organization. Run without --apply first to review the plan.
 * Deterministic IDs and transaction markers make repeated runs idempotent.
 * Existing products and transactions are never overwritten or deleted.
 */

const crypto = require("crypto");
const dns = require("dns");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { createDecision } = require("../services/decisionEngine");

dotenv.config();

const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");
const listWorkspaces = args.includes("--list-workspaces");
const organizationOption = args.find((argument) => argument.startsWith("--organization-id="));
const organizationId = organizationOption?.slice("--organization-id=".length).trim();
const ownerOption = args.find((argument) => argument.startsWith("--owner-email="));
const requestedOwnerEmail = ownerOption?.slice("--owner-email=".length).trim().toLowerCase();
const DEMO_MARKER = "Seeded demo demand history (stocksutra-demo-v1";

const catalog = [
  { key: "wireless-keyboard", name: "Wireless Keyboard", category: "Electronics", quantity: 18, lowStockThreshold: 8, supplierLeadTimeDays: 8, supplier: "Logitech Supply", price: 54.99, demand: [8, 6, 7, 5, 9, 6, 8, 7] },
  { key: "wireless-mouse", name: "Wireless Mouse", category: "Electronics", quantity: 45, lowStockThreshold: 12, supplierLeadTimeDays: 7, supplier: "Logitech Supply", price: 29.99, demand: [10, 12, 8, 11, 9, 13, 10, 8] },
  { key: "laptop", name: "Laptop", category: "Computers", quantity: 10, lowStockThreshold: 4, supplierLeadTimeDays: 14, supplier: "Northstar Computing", price: 1249, demand: [2, 3, 1, 2, 4, 2, 3, 2] },
  { key: "smartphone", name: "Smartphone", category: "Electronics", quantity: 2, lowStockThreshold: 5, supplierLeadTimeDays: 12, supplier: "Metro Mobile Supply", price: 799, demand: [5, 3, 4, 6, 4, 5, 3, 4] },
  { key: "usb-c-hub", name: "USB-C Hub", category: "Accessories", quantity: 0, lowStockThreshold: 6, supplierLeadTimeDays: 5, supplier: "Portside Components", price: 42.5, demand: [6, 7, 8, 5, 9, 7, 6, 8] },
  { key: "monitor", name: "Monitor", category: "Computers", quantity: 28, lowStockThreshold: 5, supplierLeadTimeDays: 10, supplier: "Northstar Computing", price: 329, demand: [1, 1, 2, 1, 2, 1, 1, 2] },
  { key: "headphones", name: "Headphones", category: "Electronics", quantity: 16, lowStockThreshold: 8, supplierLeadTimeDays: 14, supplier: "Metro Mobile Supply", price: 119, demand: [3, 4, 2, 3, 5, 4, 3, 4] },
  { key: "webcam", name: "Webcam", category: "Accessories", quantity: 6, lowStockThreshold: 4, supplierLeadTimeDays: 10, supplier: "Portside Components", price: 89, demand: [3, 4, 2, 5, 3, 4, 2, 4] }
];
const ageDays = [82, 70, 60, 49, 38, 27, 15, 4];
const toObjectId = (value) => new mongoose.Types.ObjectId(value);
const stableId = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
const idString = (value) => String(value);

async function getOwner(organization) {
  const members = await User.find({ organization: organization._id, status: "active", role: "admin" })
    .select("name email role status organization")
    .lean();
  if (requestedOwnerEmail) {
    const requested = members.find((member) => member.email.toLowerCase() === requestedOwnerEmail);
    if (!requested) throw new Error("The requested owner is not an active admin in this workspace.");
    return requested;
  }
  const creator = members.find((member) => idString(member._id) === idString(organization.createdBy));
  if (creator) return creator;
  if (members.length === 1) return members[0];
  throw new Error("This workspace has no unambiguous active admin owner. Specify --owner-email for an existing workspace admin.");
}

function createTransactionDocument(product, owner, organization, item, sequence, previousQuantity, createdAt) {
  const transactionKey = `${organization._id}:${item.key}:OUT:${sequence}`;
  const quantity = item.demand[sequence];
  const marker = `${DEMO_MARKER}, ${item.key}, ${String(sequence + 1).padStart(2, "0")})`;
  return {
    _id: toObjectId(stableId(`stocksutra-demo-v1:${transactionKey}`)),
    user: owner._id,
    organization: organization._id,
    performedBy: owner._id,
    performedByName: owner.name,
    product: product._id,
    productName: product.name,
    type: "OUT",
    quantity,
    previousQuantity,
    newQuantity: previousQuantity - quantity,
    note: marker,
    createdAt,
    updatedAt: createdAt
  };
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured; no database changes were made.");
  if (!listWorkspaces && !organizationId) {
    throw new Error("Select the existing demo workspace with --organization-id=<id>. Use --list-workspaces to inspect workspaces first.");
  }

  // Match the existing legacy migration's Atlas DNS fallback used in this project.
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  await mongoose.connect(process.env.MONGO_URI);

  if (listWorkspaces) {
    const organizations = await Organization.find({}).select("name createdBy").lean();
    console.log("Existing workspaces (no changes made):");
    for (const organization of organizations) {
      const [owner, productCount, transactionCount] = await Promise.all([
        User.findById(organization.createdBy).select("name email role status organization").lean(),
        Product.countDocuments({ organization: organization._id }),
        InventoryTransaction.countDocuments({ organization: organization._id })
      ]);
      const currentWorkspace = owner?.organization && idString(owner.organization) === idString(organization._id);
      const productNames = await Product.find({ organization: organization._id }).distinct("name");
      console.log(`- ${organization.name} | ${organization._id} | created by ${owner ? `${owner.name} <${owner.email}> (${owner.role}, ${owner.status})` : "missing user"}${currentWorkspace ? " | account's current workspace" : ""} | ${productCount} products | ${transactionCount} transactions${productNames.length ? ` | products: ${productNames.join(", ")}` : ""}`);
    }
    if (!organizations.length) console.log("No workspaces found.");
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(organizationId)) throw new Error("A valid --organization-id is required.");
  const organization = await Organization.findById(organizationId).lean();
  if (!organization) throw new Error("The selected workspace does not exist; no database changes were made.");
  const owner = await getOwner(organization);
  const existingProducts = await Product.find({ organization: organization._id }).select("_id name user organization").lean();
  const byId = new Map(existingProducts.map((product) => [idString(product._id), product]));
  const names = new Map(existingProducts.map((product) => [product.name.trim().toLocaleLowerCase(), product]));
  const selectedProducts = [];
  const skipped = [];
  let productsCreated = 0;

  for (const item of catalog) {
    const productId = stableId(`stocksutra-demo-v1:${organization._id}:product:${item.key}`);
    let product = byId.get(productId);
    if (product) {
      if (product.name !== item.name || idString(product.organization) !== idString(organization._id) || idString(product.user) !== idString(owner._id)) {
        throw new Error(`Deterministic product ID conflict for ${item.name}; no data was changed.`);
      }
    } else {
      const nameMatch = names.get(item.name.toLocaleLowerCase());
      if (nameMatch) {
        skipped.push(`${item.name}: a product with this name already exists in the workspace; it was left untouched.`);
        continue;
      }
      product = {
        _id: toObjectId(productId),
        user: owner._id,
        organization: organization._id,
        image: "",
        assignedTo: null,
        distributions: [],
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        price: item.price,
        lowStockThreshold: item.lowStockThreshold,
        supplierLeadTimeDays: item.supplierLeadTimeDays,
        supplier: item.supplier,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      productsCreated += 1;
    }
    selectedProducts.push({ item, product, isNew: !byId.has(productId) });
  }

  const transactionDocs = [];
  const existingTransactionIds = new Set();
  for (const { item, product } of selectedProducts) {
    const firstDate = new Date();
    firstDate.setUTCHours(12, 0, 0, 0);
    firstDate.setUTCDate(firstDate.getUTCDate() - ageDays[0]);
    let previousQuantity = item.quantity + item.demand.reduce((sum, amount) => sum + amount, 0);

    for (let sequence = 0; sequence < item.demand.length; sequence += 1) {
      const createdAt = new Date(firstDate);
      createdAt.setUTCDate(createdAt.getUTCDate() + ageDays[0] - ageDays[sequence]);
      const doc = createTransactionDocument(product, owner, organization, item, sequence, previousQuantity, createdAt);
      previousQuantity = doc.newQuantity;
      transactionDocs.push(doc);
    }
  }

  const existingIds = transactionDocs.map((record) => record._id);
  const existingTransactions = existingIds.length
    ? await InventoryTransaction.find({ _id: { $in: existingIds } }).select("_id user organization product type note").lean()
    : [];
  for (const transaction of existingTransactions) {
    const expected = transactionDocs.find((record) => idString(record._id) === idString(transaction._id));
    if (!expected || idString(transaction.organization) !== idString(organization._id) ||
        idString(transaction.user) !== idString(owner._id) || idString(transaction.product) !== idString(expected.product) ||
        transaction.type !== "OUT" || !transaction.note?.startsWith(DEMO_MARKER)) {
      throw new Error(`Seed transaction ID conflict (${transaction._id}); no data was changed.`);
    }
    existingTransactionIds.add(idString(transaction._id));
  }
  const transactionsToCreate = transactionDocs.filter((record) => !existingTransactionIds.has(idString(record._id)));

  console.log("StockSutra Demo Data");
  console.log("--------------------");
  console.log(`Mode: ${applyChanges ? "APPLY" : "DRY RUN (read-only)"}`);
  console.log(`Workspace: ${organization.name} (${organization._id})`);
  console.log(`Owner: ${owner.name} <${owner.email}>`);
  console.log(`Products created/updated: ${productsCreated} created, 0 updated (${selectedProducts.length} demo products selected)`);
  console.log(`OUT transactions created: ${transactionsToCreate.length} (${existingTransactionIds.size} already seeded)`);
  if (skipped.length) console.log(`Products skipped to protect existing workspace data: ${skipped.length}\n  ${skipped.join("\n  ")}`);

  const decisions = [];
  for (const { item, product } of selectedProducts) {
    const history = transactionDocs.filter((transaction) => idString(transaction.product) === idString(product._id));
    decisions.push(createDecision(product, history));
  }
  const countAction = (action) => decisions.filter((decision) => decision.action === action).length;
  console.log(`Healthy products: ${countAction("HEALTHY")}`);
  console.log(`Reorder Soon: ${countAction("REORDER_SOON")}`);
  console.log(`High Risk: ${decisions.filter((decision) => decision.risk === "HIGH").length}`);
  console.log(`Monitor: ${countAction("MONITOR")}; Reorder Now: ${countAction("REORDER_NOW")}; Insufficient data: ${countAction("INSUFFICIENT_DATA")}`);

  if (!applyChanges) {
    console.log("Review this plan, then rerun with the same workspace and --apply to write records.");
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const entry of selectedProducts.filter((candidate) => candidate.isNew)) {
        await Product.create([entry.product], { session });
      }
      if (transactionsToCreate.length) {
        await InventoryTransaction.insertMany(transactionsToCreate, { session, ordered: true });
      }
    });
  } finally {
    await session.endSession();
  }

  const [verifiedProducts, verifiedTransactions] = await Promise.all([
    Product.countDocuments({ organization: organization._id, _id: { $in: selectedProducts.map(({ product }) => product._id) } }),
    InventoryTransaction.countDocuments({ organization: organization._id, _id: { $in: transactionDocs.map((record) => record._id) }, type: "OUT" })
  ]);
  if (verifiedProducts !== selectedProducts.length || verifiedTransactions !== transactionDocs.length) {
    throw new Error(`Post-seed verification mismatch: ${verifiedProducts}/${selectedProducts.length} products and ${verifiedTransactions}/${transactionDocs.length} transactions found.`);
  }
  console.log(`Successfully seeded: ${productsCreated} products and ${transactionsToCreate.length} OUT transactions.`);
  console.log(`Post-seed verification: ${verifiedProducts} products and ${verifiedTransactions} OUT transactions present.`);
}

run()
  .catch((error) => {
    console.error("Demo inventory seed stopped safely:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

/*
 * Assign missing Product and InventoryTransaction ownership without replacing
 * valid references or changing inventory values. Run without arguments first
 * (read-only); pass --apply only after reviewing the printed plan.
 *
 * Owner selection order:
 * 1. Preserve/infer an owner already recorded on the item, its organization,
 *    or (for transactions) its linked product.
 * 2. For genuinely ownerless records, use the active admin with the strongest
 *    existing ownership evidence (owned inventory + workspaces created).
 *    A tie is treated as ambiguous and is not migrated. --owner=email can
 *    explicitly select another existing active admin.
 * 3. Use that user's current valid workspace, or their sole created workspace.
 *    Never create a user or workspace as part of this migration.
 */

const dns = require("dns");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const Organization = require("../models/Organization");

dotenv.config();

const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");
const ownerOption = args.find((argument) => argument.startsWith("--owner="));
const requestedOwnerEmail = ownerOption?.slice("--owner=".length).trim().toLowerCase();

const toId = (value) => (value ? String(value) : null);
const isMissing = (value) => value === undefined || value === null;

function printRecordList(label, records) {
  console.log(`${label}: ${records.length}`);
  for (const record of records) {
    console.log(`  - ${record.model} ${record.name} (${record.id}): ${record.reason}`);
  }
}

function resolveWorkspace(user, organizationsById, organizationsByCreator) {
  if (user.organization && organizationsById.has(toId(user.organization))) {
    return organizationsById.get(toId(user.organization));
  }

  const createdWorkspaces = organizationsByCreator.get(toId(user._id)) || [];
  return createdWorkspaces.length === 1 ? createdWorkspaces[0] : null;
}

async function runMigration() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured. No database changes were made.");
  }

  // Resolve SRV records using public resolvers when the machine's DNS provider
  // cannot resolve MongoDB Atlas SRV records. This does not expose credentials.
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  await mongoose.connect(process.env.MONGO_URI);

  const [users, organizations, products, transactions] = await Promise.all([
    User.find({}, "name email role status organization").lean(),
    Organization.find({}, "name createdBy").lean(),
    Product.find({}, "name user organization").lean(),
    InventoryTransaction.find({}, "product productName user organization").lean()
  ]);

  const usersById = new Map(users.map((user) => [toId(user._id), user]));
  const organizationsById = new Map(organizations.map((org) => [toId(org._id), org]));
  const organizationsByCreator = new Map();
  const productsById = new Map(products.map((product) => [toId(product._id), product]));

  for (const organization of organizations) {
    const creatorId = toId(organization.createdBy);
    if (!organizationsByCreator.has(creatorId)) organizationsByCreator.set(creatorId, []);
    organizationsByCreator.get(creatorId).push(organization);
  }

  const eligibleAdmins = users.filter((user) => user.role === "admin" && user.status === "active");
  let fallbackOwner = null;

  if (requestedOwnerEmail) {
    fallbackOwner = users.find((user) => user.email === requestedOwnerEmail) || null;
    if (!fallbackOwner || fallbackOwner.role !== "admin" || fallbackOwner.status !== "active") {
      throw new Error("The requested migration owner must be an existing active admin. No database changes were made.");
    }
  } else {
    const rankedAdmins = eligibleAdmins.map((user) => {
      const ownedProducts = products.filter((product) => toId(product.user) === toId(user._id)).length;
      const ownedTransactions = transactions.filter((transaction) => toId(transaction.user) === toId(user._id)).length;
      const createdWorkspaces = (organizationsByCreator.get(toId(user._id)) || []).length;
      return { user, evidence: ownedProducts + ownedTransactions + createdWorkspaces };
    }).sort((left, right) => right.evidence - left.evidence);

    if (rankedAdmins.length && rankedAdmins[0].evidence > 0 &&
        (rankedAdmins.length === 1 || rankedAdmins[0].evidence > rankedAdmins[1].evidence)) {
      fallbackOwner = rankedAdmins[0].user;
    }
  }

  const plan = [];
  const skipped = [];
  const hasInvalidReference = (record, field, existingRecords) =>
    !isMissing(record[field]) && !existingRecords.has(toId(record[field]));

  function planRecord(modelName, record, linkedOwner = null, linkedOrganization = null) {
    const recordId = toId(record._id);
    const ownerIsMissing = isMissing(record.user);
    const organizationIsMissing = isMissing(record.organization);
    const existingOwner = ownerIsMissing ? null : usersById.get(toId(record.user));
    const existingOrganization = organizationIsMissing ? null : organizationsById.get(toId(record.organization));

    if (!ownerIsMissing && !existingOwner) {
      skipped.push({ model: modelName, id: recordId, name: record.name || record.productName, reason: "user reference exists but does not point to a current user" });
      return;
    }
    if (!organizationIsMissing && !existingOrganization) {
      skipped.push({ model: modelName, id: recordId, name: record.name || record.productName, reason: "organization reference exists but does not point to a current workspace" });
      return;
    }

    let owner = existingOwner || linkedOwner;
    let organization = existingOrganization || linkedOrganization;

    if (!owner && organization) {
      const creator = usersById.get(toId(organization.createdBy));
      if (creator && creator.role === "admin" && creator.status === "active") owner = creator;
    }
    if (!owner) owner = fallbackOwner;
    if (!owner) {
      skipped.push({ model: modelName, id: recordId, name: record.name || record.productName, reason: "no unambiguous existing active admin owner could be selected" });
      return;
    }

    if (!organization) organization = resolveWorkspace(owner, organizationsById, organizationsByCreator);
    if (!organization) {
      skipped.push({ model: modelName, id: recordId, name: record.name || record.productName, reason: `owner ${owner.name} has no unambiguous existing workspace` });
      return;
    }

    // If only one field is absent, retain the valid field exactly as stored.
    const update = {};
    if (ownerIsMissing) update.user = owner._id;
    if (organizationIsMissing) update.organization = organization._id;
    if (Object.keys(update).length === 0) return;

    plan.push({
      modelName,
      id: recordId,
      name: record.name || record.productName,
      owner,
      organization,
      update
    });
  }

  for (const product of products) {
    const hasOwnershipIssue = isMissing(product.user) || isMissing(product.organization) ||
      hasInvalidReference(product, "user", usersById) ||
      hasInvalidReference(product, "organization", organizationsById);
    if (hasOwnershipIssue) planRecord("Product", product);
  }

  for (const transaction of transactions) {
    const hasOwnershipIssue = isMissing(transaction.user) || isMissing(transaction.organization) ||
      hasInvalidReference(transaction, "user", usersById) ||
      hasInvalidReference(transaction, "organization", organizationsById);
    if (!hasOwnershipIssue) continue;

    const linkedProduct = productsById.get(toId(transaction.product));
    const linkedOwner = linkedProduct?.user ? usersById.get(toId(linkedProduct.user)) || null : null;
    const linkedOrganization = linkedProduct?.organization
      ? organizationsById.get(toId(linkedProduct.organization)) || null
      : null;
    planRecord("InventoryTransaction", transaction, linkedOwner, linkedOrganization);
  }

  const productMissingCount = products.filter((record) => isMissing(record.user) || isMissing(record.organization)).length;
  const transactionMissingCount = transactions.filter((record) => isMissing(record.user) || isMissing(record.organization)).length;
  const invalidReferenceCount = [...products, ...transactions].filter((record) =>
    hasInvalidReference(record, "user", usersById) || hasInvalidReference(record, "organization", organizationsById)
  ).length;
  const fallbackWorkspace = fallbackOwner
    ? resolveWorkspace(fallbackOwner, organizationsById, organizationsByCreator)
    : null;
  const ownersAndWorkspaces = [...new Map(plan.map((item) => [toId(item.owner._id), item.owner])).values()];

  console.log(`Mode: ${applyChanges ? "APPLY (writes enabled)" : "DRY RUN (read-only)"}`);
  console.log(`Legacy products found (missing user or workspace): ${productMissingCount}`);
  console.log(`Legacy transactions found (missing user or workspace): ${transactionMissingCount}`);
  console.log(`Records with invalid ownership references: ${invalidReferenceCount}`);
  console.log(`Migration owner/workspace: ${fallbackOwner ? `${fallbackOwner.name} <${fallbackOwner.email}> / ${fallbackWorkspace ? `${fallbackWorkspace.name} (${toId(fallbackWorkspace._id)})` : "workspace resolved per record"}` : "none selected; ownerless records will be skipped"}`);
  console.log(`Records that will be updated: ${plan.length} (${plan.filter((item) => item.modelName === "Product").length} products, ${plan.filter((item) => item.modelName === "InventoryTransaction").length} transactions)`);
  for (const owner of ownersAndWorkspaces) {
    const ownerPlan = plan.filter((item) => toId(item.owner._id) === toId(owner._id));
    const workspaces = [...new Set(ownerPlan.map((item) => `${item.organization.name} (${toId(item.organization._id)})`))].join(", ");
    console.log(`  Owner used: ${owner.name} <${owner.email}>; workspace(s): ${workspaces}`);
  }
  if (!plan.length) console.log("No records are eligible for migration.");
  printRecordList("Records that cannot be migrated safely", skipped);

  if (applyChanges && plan.length) {
    const buildUpdateOperation = (item) => {
      const missingFieldGuards = Object.keys(item.update).map((field) => ({
        $or: [{ [field]: { $exists: false } }, { [field]: null }]
      }));
      return {
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(item.id), $and: missingFieldGuards },
          update: { $set: item.update }
        }
      };
    };
    const productOps = plan.filter((item) => item.modelName === "Product").map(buildUpdateOperation);
    const transactionOps = plan.filter((item) => item.modelName === "InventoryTransaction").map(buildUpdateOperation);

    // Restrict updates to fields still missing/null; do not overwrite any
    // ownership value that may have been corrected after planning.
    const [productResult, transactionResult] = await Promise.all([
      productOps.length ? Product.bulkWrite(productOps, { timestamps: false }) : Promise.resolve({ modifiedCount: 0 }),
      transactionOps.length ? InventoryTransaction.bulkWrite(transactionOps, { timestamps: false }) : Promise.resolve({ modifiedCount: 0 })
    ]);
    console.log(`Successfully migrated: ${productResult.modifiedCount} products, ${transactionResult.modifiedCount} transactions.`);
  }

  const [verifiedProducts, verifiedTransactions] = await Promise.all([
    Product.find({}, "user organization").lean(),
    InventoryTransaction.find({}, "user organization").lean()
  ]);
  const invalidOwnership = (records) => records.filter((record) =>
    !record.user || !usersById.has(toId(record.user)) ||
    !record.organization || !organizationsById.has(toId(record.organization))
  ).length;
  console.log(`Post-run ownership check: ${invalidOwnership(verifiedProducts)} products and ${invalidOwnership(verifiedTransactions)} transactions still have missing or invalid user/workspace references.`);

  if (skipped.length || invalidOwnership(verifiedProducts) || invalidOwnership(verifiedTransactions)) {
    console.log("Review the skipped records above; valid existing ownership was not overwritten.");
  }
}

runMigration()
  .catch((error) => {
    console.error("Legacy inventory migration stopped safely:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

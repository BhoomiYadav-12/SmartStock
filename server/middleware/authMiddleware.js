const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");

const ensureOrganization = async (user) => {
  if (user.organization) return user;

  let organization = await Organization.findOne({ createdBy: user._id });
  let createdOrganization = false;
  if (!organization) {
    organization = await Organization.create({
      name: `${user.name.trim()}'s Workspace`,
      createdBy: user._id
    });
    createdOrganization = true;
  }

  // Use compare-and-set so parallel protected requests migrate a legacy account only once.
  const migratedUser = await User.findOneAndUpdate(
    { _id: user._id, $or: [{ organization: null }, { organization: { $exists: false } }] },
    { $set: { organization: organization._id, role: "admin", status: user.status || "active" } },
    { new: true }
  );
  if (!migratedUser) {
    if (createdOrganization) await Organization.deleteOne({ _id: organization._id, createdBy: user._id });
    return User.findById(user._id);
  }

  // Legacy records are linked only to the owner already recorded on each document.
  await Promise.all([
    Product.updateMany({ user: user._id, $or: [{ organization: null }, { organization: { $exists: false } }] }, { $set: { organization: organization._id } }),
    InventoryTransaction.updateMany({ user: user._id, $or: [{ organization: null }, { organization: { $exists: false } }] }, { $set: { organization: organization._id } })
  ]);
  return migratedUser;
};

const authMiddleware = async (req, res, next) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({ success: false, message: "Authentication is not configured" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token" });
  }

  try {
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid authentication token" });
    }

    if (user.status === "inactive") {
      return res.status(403).json({ success: false, message: "This account is inactive. Contact your workspace admin." });
    }
    const authenticatedUser = await ensureOrganization(user);
    authenticatedUser.password = undefined;
    req.user = authenticatedUser;
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error);
    return res.status(500).json({ success: false, message: "Unable to verify account" });
  }
};

module.exports = authMiddleware;
module.exports.ensureOrganization = ensureOrganization;

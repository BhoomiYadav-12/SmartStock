const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Product = require("../models/Product");
const ProductAssignment = require("../models/ProductAssignment");
const authMiddleware = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");

const router = express.Router();
router.use(authMiddleware);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const teamMemberFields = "name email role status createdAt";

router.get("/", async (req, res) => {
  try {
    const [members, organization, products] = await Promise.all([
      User.find({ organization: req.user.organization }).select(teamMemberFields).sort({ createdAt: 1 }),
      Organization.findById(req.user.organization).select("name createdAt"),
      Product.find({ organization: req.user.organization }).select("name distributions").lean()
    ]);
    const canViewAllDistribution = ["admin", "manager"].includes(req.user.role);
    const allocationsByMember = new Map();
    for (const product of products) {
      for (const allocation of product.distributions || []) {
        const memberId = String(allocation.user);
        if (!allocationsByMember.has(memberId)) allocationsByMember.set(memberId, []);
        allocationsByMember.get(memberId).push({
          productId: product._id,
          productName: product.name,
          quantity: allocation.quantity
        });
      }
    }
    const membersWithInventory = members.map((member) => {
      const canViewMemberInventory = canViewAllDistribution || String(member._id) === String(req.user._id);
      const distributedInventory = canViewMemberInventory ? (allocationsByMember.get(String(member._id)) || []) : [];
      return {
        ...member.toObject(),
        distributionVisible: canViewMemberInventory,
        distributedInventory,
        distributedUnitCount: distributedInventory.reduce((total, item) => total + item.quantity, 0)
      };
    });
    return res.json({ success: true, members: membersWithInventory, organization });
  } catch (error) {
    console.error("Failed to load workspace team:", error);
    return res.status(500).json({ success: false, message: "Unable to load workspace team" });
  }
});

router.post("/members", requireRoles("admin"), async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const role = req.body.role;
  if (!name || !email || !emailPattern.test(email) || !["manager", "staff"].includes(role)) {
    return res.status(400).json({ success: false, message: "Provide a name, valid email, and manager or staff role." });
  }
  try {
    if (await User.exists({ email })) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    const temporaryPassword = crypto.randomBytes(9).toString("base64url");
    const member = await User.create({
      name, email, password: temporaryPassword,
      organization: req.user.organization, role, status: "active"
    });
    return res.status(201).json({
      success: true,
      message: "Team account created. Share this temporary password with the member securely.",
      member: { _id: member._id, name: member.name, email: member.email, role: member.role, status: member.status, createdAt: member.createdAt },
      temporaryPassword
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    console.error("Failed to create workspace member:", error);
    return res.status(500).json({ success: false, message: "Unable to create team member" });
  }
});

router.patch("/members/:id", requireRoles("admin"), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid team member id" });
  if (!req.body.role || !["manager", "staff"].includes(req.body.role)) {
    return res.status(400).json({ success: false, message: "Role must be manager or staff." });
  }
  try {
    const member = await User.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!member) return res.status(404).json({ success: false, message: "Team member not found" });
    if (member.role === "admin") return res.status(403).json({ success: false, message: "Workspace admin roles cannot be changed here." });
    member.role = req.body.role;
    await member.save();
    return res.json({ success: true, member: { _id: member._id, name: member.name, email: member.email, role: member.role, status: member.status, createdAt: member.createdAt } });
  } catch (error) {
    console.error("Failed to update member role:", error);
    return res.status(500).json({ success: false, message: "Unable to update team member" });
  }
});

router.delete("/members/:id", requireRoles("admin"), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid team member id" });
  if (String(req.params.id) === String(req.user._id)) return res.status(403).json({ success: false, message: "You cannot deactivate your own admin account." });
  try {
    const member = await User.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!member) return res.status(404).json({ success: false, message: "Team member not found" });
    if (member.role === "admin") return res.status(403).json({ success: false, message: "Workspace admins cannot be deactivated." });
    member.status = "inactive";
    await member.save();
    const assignedProducts = await Product.find({ organization: req.user.organization, assignedTo: member._id }).select("_id name");
    await Product.updateMany({ organization: req.user.organization, assignedTo: member._id }, { $set: { assignedTo: null } });
    if (assignedProducts.length) {
      try {
        await ProductAssignment.insertMany(assignedProducts.map((product) => ({
          organization: req.user.organization,
          product: product._id,
          productName: product.name,
          changedBy: req.user._id,
          changedByName: req.user.name,
          previousAssignee: member._id,
          assignedTo: null
        })));
      } catch (error) {
        console.error("Unable to record assignment changes for deactivated member:", error.message);
      }
    }
    return res.json({ success: true, message: "Team member deactivated. Product assignments were cleared; any distributed stock remains recorded and can be returned by an admin or manager." });
  } catch (error) {
    console.error("Failed to deactivate member:", error);
    return res.status(500).json({ success: false, message: "Unable to deactivate team member" });
  }
});

module.exports = router;

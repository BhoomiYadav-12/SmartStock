const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const ProductAssignment = require("../models/ProductAssignment");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");
const { handleImageUpload, removeStoredImage } = require("../middleware/productImageUpload");

const router = express.Router();
router.use(authMiddleware);

const productsVisibleTo = (user) => user.role === "staff"
  ? { organization: user.organization, $or: [{ assignedTo: user._id }, { "distributions.user": user._id }] }
  : { organization: user.organization };

const visibleDistribution = (product, user) => {
  if (user.role === "staff") {
    product.distributions = product.distributions.filter((allocation) =>
      String(allocation.user?._id || allocation.user) === String(user._id)
    );
  }
  return product;
};

const validateAssignee = async (assignedTo, organization) => {
  if (!assignedTo) return null;
  if (!mongoose.Types.ObjectId.isValid(assignedTo)) throw new Error("Choose a valid team member.");
  const member = await User.findOne({ _id: assignedTo, organization, status: "active" }).select("_id");
  if (!member) throw new Error("The assigned team member is not active in this workspace.");
  return member._id;
};

const productFields = async (body, organization) => {
  const rawLeadTime = body.supplierLeadTimeDays;
  const supplierLeadTimeDays = rawLeadTime === undefined || rawLeadTime === null || rawLeadTime === ""
    ? null
    : Number(rawLeadTime);
  if (supplierLeadTimeDays !== null && (!Number.isInteger(supplierLeadTimeDays) || supplierLeadTimeDays < 1)) {
    throw new Error("Supplier lead time must be a whole number of at least 1 day.");
  }

  return {
    name: body.name,
    category: body.category,
    quantity: body.quantity,
    price: body.price,
    lowStockThreshold: body.lowStockThreshold,
    supplier: body.supplier,
    supplierLeadTimeDays,
    assignedTo: await validateAssignee(body.assignedTo, organization)
  };
};

const validateProductId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
  return next();
};

router.get("/", async (req, res) => {
  try {
    const products = await Product.find(productsVisibleTo(req.user))
      .populate("assignedTo", "name email role")
      .populate("distributions.user", "name email role status")
      .sort({ createdAt: -1 });
    return res.json({ success: true, products: products.map((product) => visibleDistribution(product, req.user)) });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
});

router.get("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
  try {
    const product = await Product.findOne({ _id: req.params.id, ...productsVisibleTo(req.user) })
      .populate("assignedTo", "name email role")
      .populate("distributions.user", "name email role status");
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    const recentActivity = await InventoryTransaction.find({ product: product._id, organization: req.user.organization })
      .sort({ createdAt: -1 }).limit(5).populate("performedBy", "name email");
    const assignmentHistory = await ProductAssignment.find({ product: product._id, organization: req.user.organization })
      .sort({ createdAt: -1 }).limit(5).populate("previousAssignee assignedTo", "name email");
    return res.json({ success: true, product: visibleDistribution(product, req.user), recentActivity, assignmentHistory });
  } catch (error) {
    console.error("Failed to fetch product:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
});

router.post("/", requireRoles("admin", "manager"), handleImageUpload, async (req, res) => {
  try {
    const fields = await productFields(req.body, req.user.organization);
    const product = await Product.create({
      ...fields,
      image: req.file ? `/uploads/${req.user.organization}/${req.file.filename}` : "",
      user: req.user._id,
      organization: req.user.organization
    });
    if (product.assignedTo) {
      try {
        await ProductAssignment.create({
          organization: req.user.organization, product: product._id, productName: product.name,
          changedBy: req.user._id, changedByName: req.user.name, assignedTo: product.assignedTo
        });
      } catch (error) {
        console.error("Unable to record initial product assignment:", error.message);
      }
    }
    return res.status(201).json({ success: true, message: "Product added successfully", product });
  } catch (error) {
    if (req.file) await removeStoredImage(`/uploads/${req.user.organization}/${req.file.filename}`);
    return res.status(400).json({ success: false, message: error.message || "Failed to add product" });
  }
});

router.put("/:id", requireRoles("admin", "manager"), validateProductId, handleImageUpload, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!product) {
      if (req.file) await removeStoredImage(`/uploads/${req.user.organization}/${req.file.filename}`);
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const fields = await productFields(req.body, req.user.organization);
    const previousImage = product.image;
    const previousAssignee = product.assignedTo;
    Object.assign(product, fields);
    if (req.file) product.image = `/uploads/${req.user.organization}/${req.file.filename}`;
    if (req.body.imageAction === "remove") product.image = "";
    await product.save();
    if (previousImage !== product.image) await removeStoredImage(previousImage);
    if (String(previousAssignee || "") !== String(product.assignedTo || "")) {
      try {
        await ProductAssignment.create({
          organization: req.user.organization, product: product._id, productName: product.name,
          changedBy: req.user._id, changedByName: req.user.name,
          previousAssignee: previousAssignee || null, assignedTo: product.assignedTo || null
        });
      } catch (error) {
        console.error("Unable to record product reassignment:", error.message);
      }
    }
    return res.json({ success: true, message: "Product updated successfully", product });
  } catch (error) {
    if (req.file) await removeStoredImage(`/uploads/${req.user.organization}/${req.file.filename}`);
    return res.status(400).json({ success: false, message: error.message || "Failed to update product" });
  }
});

router.delete("/:id", requireRoles("admin", "manager"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
  try {
    const existingProduct = await Product.findOne({ _id: req.params.id, organization: req.user.organization }).select("_id distributions image");
    if (!existingProduct) return res.status(404).json({ success: false, message: "Product not found" });
    const distributedQuantity = existingProduct.distributions.reduce((total, allocation) => total + allocation.quantity, 0);
    if (distributedQuantity > 0) {
      return res.status(409).json({ success: false, message: "Return distributed stock to Main Inventory before deleting this product." });
    }
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization,
      distributions: { $not: { $elemMatch: { quantity: { $gt: 0 } } } }
    });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    await removeStoredImage(product.image);
    return res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("Failed to delete product:", error);
    return res.status(500).json({ success: false, message: "Failed to delete product" });
  }
});

module.exports = router;

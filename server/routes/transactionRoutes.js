const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");

const router = express.Router();
router.use(authMiddleware);

const recordStockChange = async (req, res, type) => {
  let session;
  try {
    const { productId, note = "" } = req.body;
    const quantity = Number(req.body.quantity);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "A valid productId is required" });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Quantity must be greater than 0" });
    }

    const productQuery = { _id: productId, organization: req.user.organization };
    if (req.user.role === "staff") productQuery.assignedTo = req.user._id;
    session = await mongoose.startSession();
    let product;
    let transaction;
    await session.withTransaction(async () => {
      const currentProduct = await Product.findOne(productQuery).session(session);
      if (!currentProduct) throw transferError("Product not found", 404);

      const previousQuantity = currentProduct.quantity;
      if (type === "OUT" && quantity > previousQuantity) throw transferError("Insufficient stock", 400);
      const productFilter = { ...productQuery };
      if (type === "OUT") productFilter.quantity = { $gte: quantity };
      product = await Product.findOneAndUpdate(
        productFilter,
        { $inc: { quantity: type === "IN" ? quantity : -quantity } },
        { returnDocument: "after", session }
      );
      if (!product) throw transferError("Available stock changed. Refresh and try again.", 400);

      const createdTransactions = await InventoryTransaction.create([{
        user: req.user._id,
        organization: req.user.organization,
        performedBy: req.user._id,
        performedByName: req.user.name,
        product: currentProduct._id,
        productName: currentProduct.name,
        type,
        quantity,
        previousQuantity,
        newQuantity: product.quantity,
        note: typeof note === "string" ? note : ""
      }], { session });
      transaction = createdTransactions[0];
    });

    return res.status(201).json({
      success: true,
      message: `Stock ${type === "IN" ? "added" : "removed"} successfully`,
      product,
      transaction
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error("Failed to record inventory transaction:", error);
    return res.status(500).json({ success: false, message: "Failed to record inventory transaction" });
  } finally {
    if (session) await session.endSession();
  }
};

router.post("/stock-in", requireRoles("admin", "manager", "staff"), (req, res) => recordStockChange(req, res, "IN"));
router.post("/stock-out", requireRoles("admin", "manager", "staff"), (req, res) => recordStockChange(req, res, "OUT"));

const transferError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const transferStock = async (req, res, isReturn = false) => {
  const { productId, recipientUserId, note = "" } = req.body;
  const quantity = Number(req.body.quantity);

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ success: false, message: "A valid productId is required." });
  }
  if (!mongoose.Types.ObjectId.isValid(recipientUserId)) {
    return res.status(400).json({ success: false, message: "Choose a valid team member." });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: "Quantity must be a whole number greater than 0." });
  }
  if (typeof note !== "string") {
    return res.status(400).json({ success: false, message: "Reason must be text." });
  }

  const organization = req.user.organization;
  const session = await mongoose.startSession();
  let updatedProduct;
  let createdTransaction;

  try {
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: productId, organization }).session(session);
      if (!product) throw transferError("Product not found in this workspace.", 404);

      const recipient = await User.findOne({
        _id: recipientUserId,
        organization,
        role: { $in: ["manager", "staff"] },
        ...(isReturn ? {} : { status: "active" })
      }).select("name email role status organization").session(session);
      if (!recipient) {
        throw transferError(
          isReturn
            ? "The team member was not found in this workspace."
            : "The recipient must be an active team member in this workspace.",
          404
        );
      }
      if (String(recipient._id) === String(req.user._id)) {
        throw transferError("Choose another team member.", 400);
      }

      const allocation = product.distributions.find((item) => String(item.user) === String(recipient._id));
      const recipientPreviousQuantity = allocation?.quantity || 0;
      let stockUpdate;
      let sourcePreviousQuantity;
      let sourceNewQuantity;
      let destinationPreviousQuantity;
      let destinationNewQuantity;
      let sourceLocation;
      let destinationLocation;
      let sourceUser = null;
      let destinationUser = null;

      if (isReturn) {
        if (!allocation || recipientPreviousQuantity < quantity) {
          throw transferError("The team member does not have enough distributed stock to return.", 409);
        }

        sourcePreviousQuantity = recipientPreviousQuantity;
        sourceNewQuantity = recipientPreviousQuantity - quantity;
        destinationPreviousQuantity = product.quantity;
        destinationNewQuantity = product.quantity + quantity;
        sourceLocation = recipient.name;
        destinationLocation = "Main Inventory";
        sourceUser = recipient._id;

        stockUpdate = await Product.findOneAndUpdate(
          {
            _id: product._id,
            organization,
            distributions: { $elemMatch: { user: recipient._id, quantity: { $gte: quantity } } }
          },
          {
            $inc: { quantity, "distributions.$[allocation].quantity": -quantity }
          },
          {
            returnDocument: "after",
            session,
            arrayFilters: [{ "allocation.user": recipient._id }]
          }
        );
        if (!stockUpdate) throw transferError("The distributed quantity changed. Refresh and try again.", 409);
        if (sourceNewQuantity === 0) {
          await Product.updateOne(
            { _id: product._id, organization },
            { $pull: { distributions: { user: recipient._id, quantity: 0 } } },
            { session }
          );
          stockUpdate = await Product.findOne({ _id: product._id, organization }).session(session);
        }
      } else {
        if (product.quantity < quantity) throw transferError("Insufficient available stock in Main Inventory.", 409);

        sourcePreviousQuantity = product.quantity;
        sourceNewQuantity = product.quantity - quantity;
        destinationPreviousQuantity = recipientPreviousQuantity;
        destinationNewQuantity = recipientPreviousQuantity + quantity;
        sourceLocation = "Main Inventory";
        destinationLocation = recipient.name;
        destinationUser = recipient._id;

        const update = allocation
          ? { $inc: { quantity: -quantity, "distributions.$[allocation].quantity": quantity } }
          : { $inc: { quantity: -quantity }, $push: { distributions: { user: recipient._id, quantity } } };
        const filter = { _id: product._id, organization, quantity: { $gte: quantity } };
        const options = { returnDocument: "after", session };
        if (allocation) {
          filter["distributions.user"] = recipient._id;
          options.arrayFilters = [{ "allocation.user": recipient._id }];
        } else {
          filter["distributions.user"] = { $ne: recipient._id };
        }
        stockUpdate = await Product.findOneAndUpdate(filter, update, options);
        if (!stockUpdate) throw transferError("Available stock changed. Refresh and try again.", 409);
      }

      const transaction = await InventoryTransaction.create([{
        user: req.user._id,
        organization,
        performedBy: req.user._id,
        performedByName: req.user.name,
        product: product._id,
        productName: product.name,
        type: isReturn ? "RETURN" : "TRANSFER",
        quantity,
        previousQuantity: isReturn ? destinationPreviousQuantity : sourcePreviousQuantity,
        newQuantity: isReturn ? destinationNewQuantity : sourceNewQuantity,
        note: note.trim(),
        sourceLocation,
        destinationLocation,
        sourceUser,
        destinationUser,
        sourcePreviousQuantity,
        sourceNewQuantity,
        destinationPreviousQuantity,
        destinationNewQuantity
      }], { session });

      updatedProduct = stockUpdate;
      createdTransaction = transaction[0];
    });

    const populatedProduct = await Product.findById(updatedProduct._id)
      .populate("assignedTo", "name email role")
      .populate("distributions.user", "name email role status");
    return res.status(201).json({
      success: true,
      message: isReturn ? "Stock returned to Main Inventory successfully." : "Stock transferred successfully.",
      product: populatedProduct,
      transaction: createdTransaction
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error(`Failed to ${isReturn ? "return" : "transfer"} inventory:`, error);
    return res.status(500).json({
      success: false,
      message: "Unable to complete the inventory movement. No partial transfer was applied."
    });
  } finally {
    await session.endSession();
  }
};

router.post("/transfer", requireRoles("admin", "manager"), (req, res) => transferStock(req, res));
router.post("/return", requireRoles("admin", "manager"), (req, res) => transferStock(req, res, true));

router.get("/", async (req, res) => {
  try {
    const transactionFilter = { organization: req.user.organization };
    if (req.user.role === "staff") {
      const assignedProducts = await Product.find({
        organization: req.user.organization,
        $or: [{ assignedTo: req.user._id }, { "distributions.user": req.user._id }]
      }).distinct("_id");
      transactionFilter.$or = [
        { performedBy: req.user._id },
        { user: req.user._id },
        { product: { $in: assignedProducts } }
      ];
    }
    const transactions = await InventoryTransaction.find(transactionFilter)
      .sort({ createdAt: -1 }).populate("performedBy", "name email");
    res.json({ success: true, transactions });
  } catch (error) {
    console.error("Failed to fetch inventory transactions:", error);
    res.status(500).json({ success: false, message: "Failed to fetch inventory history" });
  }
});

module.exports = router;

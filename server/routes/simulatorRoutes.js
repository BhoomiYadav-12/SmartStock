const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const authMiddleware = require("../middleware/authMiddleware");
const { buildProductScope, createDecision } = require("../services/decisionEngine");
const { simulateInventory } = require("../services/inventorySimulator");

const router = express.Router();
router.use(authMiddleware);

const readNumber = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

router.post("/", async (req, res) => {
  const { productId } = req.body || {};
  const demandChangePercent = readNumber(req.body?.demandChangePercent, 0);
  const leadTimeChangeDays = readNumber(req.body?.leadTimeChangeDays, 0);
  const simulationHorizonDays = readNumber(req.body?.simulationHorizonDays, 30);

  if (typeof productId !== "string" || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ success: false, message: "A valid productId is required." });
  }
  if (demandChangePercent === null || demandChangePercent < -100 || demandChangePercent > 300) {
    return res.status(400).json({ success: false, message: "Demand change must be between -100% and 300%." });
  }
  if (leadTimeChangeDays === null || !Number.isInteger(leadTimeChangeDays) || leadTimeChangeDays < 0 || leadTimeChangeDays > 365) {
    return res.status(400).json({ success: false, message: "Supplier delay must be a whole number from 0 to 365 days." });
  }
  if (simulationHorizonDays === null || !Number.isInteger(simulationHorizonDays) || simulationHorizonDays < 1 || simulationHorizonDays > 365) {
    return res.status(400).json({ success: false, message: "Simulation horizon must be a whole number from 1 to 365 days." });
  }

  try {
    const product = await Product.findOne({
      _id: productId,
      ...buildProductScope(req.user)
    });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found in your inventory." });
    }

    const transactions = await InventoryTransaction.find({
      organization: req.user.organization,
      product: product._id,
      type: "OUT"
    }).sort({ createdAt: -1 });
    const currentDecision = createDecision(product, transactions);
    const result = simulateInventory(currentDecision, {
      demandChangePercent,
      leadTimeChangeDays,
      simulationHorizonDays
    });

    return res.json({
      success: true,
      product: { productId: product._id, name: product.name },
      ...result
    });
  } catch (error) {
    console.error("Failed to simulate inventory scenario:", error);
    return res.status(500).json({ success: false, message: "Unable to simulate this inventory scenario." });
  }
});

module.exports = router;

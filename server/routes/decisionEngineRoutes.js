const express = require("express");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const authMiddleware = require("../middleware/authMiddleware");
const {
  buildProductScope,
  buildOutTransactionScope,
  createDecision,
  summarizeDecisions
} = require("../services/decisionEngine");

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const products = await Product.find(buildProductScope(req.user)).sort({ createdAt: -1 });
    const productIds = products.map((product) => product._id);
    const transactions = productIds.length
      ? await InventoryTransaction.find(buildOutTransactionScope(req.user.organization, productIds)).sort({ createdAt: -1 })
      : [];

    const transactionsByProduct = new Map();
    for (const transaction of transactions) {
      const productId = transaction.product.toString();
      const productTransactions = transactionsByProduct.get(productId) || [];
      productTransactions.push(transaction);
      transactionsByProduct.set(productId, productTransactions);
    }

    const decisions = products.map((product) => createDecision(
      product,
      transactionsByProduct.get(product._id.toString()) || []
    ));

    return res.json({
      success: true,
      summary: summarizeDecisions(decisions),
      products: decisions
    });
  } catch (error) {
    console.error("Failed to generate inventory decisions:", error);
    return res.status(500).json({ success: false, message: "Failed to generate inventory decisions" });
  }
});

module.exports = router;

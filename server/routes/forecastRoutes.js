const express = require("express");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const MINIMUM_OUT_TRANSACTIONS = 3;
const RECENT_TRANSACTION_WINDOW = 5;

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const productFilter = { organization: req.user.organization };
    if (req.user.role === "staff") {
      productFilter.$or = [{ assignedTo: req.user._id }, { "distributions.user": req.user._id }];
    }
    const products = await Product.find(productFilter).sort({ createdAt: -1 });
    const transactions = await InventoryTransaction.find({
      organization: req.user.organization,
      type: "OUT",
      product: { $in: products.map((product) => product._id) }
    }).sort({ createdAt: -1 });

    const transactionsByProduct = new Map();
    for (const transaction of transactions) {
      const productId = transaction.product.toString();
      const productTransactions = transactionsByProduct.get(productId) || [];
      productTransactions.push(transaction);
      transactionsByProduct.set(productId, productTransactions);
    }

    const forecasts = products.map((product) => {
      const productTransactions = transactionsByProduct.get(product._id.toString()) || [];
      const transactionCount = productTransactions.length;
      const totalDemand = productTransactions.reduce(
        (total, transaction) => total + transaction.quantity,
        0
      );
      const averageDemand = transactionCount > 0
        ? totalDemand / transactionCount
        : null;
      const hasEnoughHistory = transactionCount >= MINIMUM_OUT_TRANSACTIONS;
      const recentTransactions = productTransactions.slice(0, RECENT_TRANSACTION_WINDOW);
      const recentDemand = hasEnoughHistory
        ? recentTransactions.reduce((total, transaction) => total + transaction.quantity, 0)
        : null;

      let recommendedReorder = null;
      let status = "Insufficient Data";

      if (hasEnoughHistory) {
        const targetStock = Math.max(
          product.lowStockThreshold * 2,
          averageDemand * 3
        );
        recommendedReorder = Math.max(targetStock - product.quantity, 0);

        if (product.quantity <= product.lowStockThreshold) {
          status = "Low Stock";
        } else if (recommendedReorder > 0) {
          status = "Reorder Recommended";
        } else {
          status = "Healthy";
        }
      }

      return {
        productId: product._id,
        productName: product.name,
        currentStock: product.quantity,
        lowStockThreshold: product.lowStockThreshold,
        totalDemand,
        transactionCount,
        averageDemand,
        recentDemand,
        recentTransactionCount: hasEnoughHistory ? recentTransactions.length : null,
        recommendedReorder,
        status
      };
    });

    return res.json({ success: true, forecasts });
  } catch (error) {
    console.error("Failed to generate inventory forecasts:", error);
    return res.status(500).json({ success: false, message: "Failed to generate inventory forecasts" });
  }
});

module.exports = router;

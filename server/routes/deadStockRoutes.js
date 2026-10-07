const express = require("express");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const authMiddleware = require("../middleware/authMiddleware");
const { buildProductScope } = require("../services/decisionEngine");
const { analyzeDeadStock } = require("../services/deadStockAnalysis");

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    if (!req.user.organization) {
      return res.status(403).json({ success: false, message: "A workspace is required to analyze dead stock." });
    }

    const products = await Product.find(buildProductScope(req.user)).sort({ createdAt: -1 }).lean();
    const productIds = products.map((product) => product._id);
    const transactions = productIds.length
      ? await InventoryTransaction.find({
        organization: req.user.organization,
        product: { $in: productIds },
        type: { $in: ["IN", "OUT", "TRANSFER", "RETURN"] }
      }).sort({ createdAt: -1 }).lean()
      : [];

    return res.json({ success: true, ...analyzeDeadStock(products, transactions) });
  } catch (error) {
    console.error("Failed to analyze dead stock:", error);
    return res.status(500).json({ success: false, message: "Unable to analyze dead stock right now." });
  }
});

module.exports = router;

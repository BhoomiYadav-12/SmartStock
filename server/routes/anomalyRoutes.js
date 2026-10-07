const express = require("express");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const authMiddleware = require("../middleware/authMiddleware");
const { buildProductScope } = require("../services/decisionEngine");
const { analyzeInventoryAnomalies } = require("../services/anomalyDetector");

const router = express.Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    // Never allow a missing workspace id to turn into an unscoped transaction query.
    if (!req.user.organization) {
      return res.status(403).json({ success: false, message: "A workspace is required to analyze inventory." });
    }

    const products = await Product.find(buildProductScope(req.user)).sort({ createdAt: -1 });
    const productIds = products.map((product) => product._id);
    const transactions = productIds.length
      ? await InventoryTransaction.find({
        organization: req.user.organization,
        product: { $in: productIds },
        type: { $in: ["IN", "OUT"] }
      }).sort({ createdAt: 1 })
      : [];

    const result = analyzeInventoryAnomalies(products, transactions);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to analyze inventory anomalies:", error);
    return res.status(500).json({ success: false, message: "Failed to analyze inventory anomalies" });
  }
});

module.exports = router;

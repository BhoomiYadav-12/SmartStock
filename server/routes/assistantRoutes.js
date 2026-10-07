const express = require("express");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  buildProductScope,
  buildOutTransactionScope,
  createDecision
} = require("../services/decisionEngine");
const { analyzeInventoryAnomalies } = require("../services/anomalyDetector");
const { detectIntent, findMentionedProduct, createAnswer } = require("../services/inventoryAssistant");

const router = express.Router();
router.use(authMiddleware);

const getProducts = (user) => Product.find(buildProductScope(user)).sort({ createdAt: -1 }).lean();

router.post("/", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ success: false, message: "Enter an inventory question to continue." });
  if (message.length > 500) return res.status(400).json({ success: false, message: "Keep your question under 500 characters." });
  if (!req.user.organization) return res.status(403).json({ success: false, message: "A workspace is required to ask inventory questions." });

  const initialIntent = detectIntent(message);
  if (initialIntent === "unknown") {
    return res.json({ success: true, ...createAnswer({ intent: "unknown" }) });
  }

  try {
    const visibleNames = ["product", "demand", "transactions", "assigned_inventory", "anomalies", "low_stock", "high_risk", "reorder", "attention"].includes(initialIntent)
      ? await Product.find(buildProductScope(req.user)).select("_id name").lean()
      : [];
    const productMention = findMentionedProduct(message, visibleNames);
    const isShortFollowUp = message.split(/\s+/).length <= 3 && /\b(why|explain|what about|that|this|it|they)\b/i.test(message);
    const isContextQuestion = /\b(why|explain)\s+(is|does|should)\s+(it|that|this)\b|\bwhat about (it|that|this)\b/i.test(message);
    const isFollowUp = isShortFollowUp || isContextQuestion;
    const product = productMention || (isFollowUp
      ? findMentionedProduct("", visibleNames, req.body.contextProductName)
      : null);
    const asksWhy = /\b(why|explain)\b/i.test(message);
    const explicitProductWhy = asksWhy && /\b(why|explain)\b.*\b(reorder|restock|high risk|risk)\b/i.test(message);
    if (explicitProductWhy && !product) {
      return res.json({ success: true, ...createAnswer({ intent: "product", product: null }) });
    }
    const intent = product && asksWhy && ["reorder", "high_risk", "low_stock"].includes(initialIntent)
      ? "product_risk"
      : initialIntent;

    if (initialIntent === "product" && !product) {
      return res.json({ success: true, ...createAnswer({ intent: "product", product: null }) });
    }

    const broadIntents = ["reorder", "high_risk", "low_stock", "attention", "demand", "anomalies", "assigned_inventory", "inventory_value"];
    const requiresFullInventory = broadIntents.includes(intent) && !(product && ["demand", "low_stock", "reorder", "high_risk", "anomalies", "assigned_inventory"].includes(intent));
    let products;
    if (requiresFullInventory) {
      products = await getProducts(req.user);
    } else if (product) {
      const scopedProductFilter = { ...buildProductScope(req.user), _id: product._id };
      const selectedProduct = await Product.findOne(scopedProductFilter).lean();
      products = selectedProduct ? [selectedProduct] : [];
    } else if (broadIntents.includes(intent)) {
      products = await getProducts(req.user);
    } else {
      products = [];
    }

    const productIds = products.map((item) => item._id);
    const decisionIntents = ["reorder", "high_risk", "low_stock", "attention", "demand", "product_risk", "product"].includes(intent);
    let decisions = [];
    if (decisionIntents && products.length) {
      const outTransactions = await InventoryTransaction.find(buildOutTransactionScope(req.user.organization, productIds)).sort({ createdAt: -1 }).lean();
      const byProduct = new Map();
      for (const transaction of outTransactions) {
        const id = String(transaction.product);
        const history = byProduct.get(id) || [];
        history.push(transaction);
        byProduct.set(id, history);
      }
      decisions = products.map((item) => createDecision(item, byProduct.get(String(item._id)) || []));
    }

    let anomalies = [];
    if (intent === "anomalies" && products.length) {
      const movements = await InventoryTransaction.find({
        organization: req.user.organization,
        product: { $in: productIds },
        type: { $in: ["IN", "OUT"] }
      }).sort({ createdAt: 1 }).lean();
      anomalies = analyzeInventoryAnomalies(products, movements).anomalies;
    }

    let transactions = [];
    if (intent === "transactions" && product) {
      const query = { organization: req.user.organization, product: product._id };
      if (/\b(transferred|transfer)\b/i.test(message)) query.type = "TRANSFER";
      transactions = await InventoryTransaction.find(query).sort({ createdAt: -1 }).limit(5).populate("performedBy", "name").lean();
      products = product ? [await Product.findOne({ ...buildProductScope(req.user), _id: product._id }).lean()].filter(Boolean) : [];
    } else if (intent === "transactions") {
      products = await getProducts(req.user);
      transactions = products.length
        ? await InventoryTransaction.find({ organization: req.user.organization, product: { $in: products.map((item) => item._id) } })
          .sort({ createdAt: -1 }).limit(5).populate("performedBy", "name").lean()
        : [];
    }

    let members = [];
    if (intent === "assigned_inventory") {
      const memberQuery = { organization: req.user.organization };
      const canViewTeamAllocation = ["admin", "manager"].includes(req.user.role);
      if (!canViewTeamAllocation) memberQuery._id = req.user._id;
      members = await User.find(memberQuery).select("_id name role status").lean();
      if (product) {
        const selectedProduct = products[0];
        const allocations = selectedProduct?.distributions || [];
        const visibleMemberById = new Map(members.map((member) => [String(member._id), member]));
        const selectedAllocations = allocations
          .filter((allocation) => Number(allocation.quantity) > 0 && (canViewTeamAllocation || String(allocation.user) === String(req.user._id)))
          .map((allocation) => ({ ...allocation, name: visibleMemberById.get(String(allocation.user))?.name }));
        if (selectedProduct) selectedProduct.distributions = selectedAllocations;
      } else if (canViewTeamAllocation) {
        const visibleMemberById = new Map(members.map((member) => [String(member._id), member]));
        for (const item of products) item.distributions = (item.distributions || []).map((allocation) => ({
          ...allocation,
          name: visibleMemberById.get(String(allocation.user))?.name
        }));
      }
    }

    const answer = createAnswer({ intent, product: product ? products[0] || product : null, products, decisions, anomalies, transactions, members, user: req.user, question: message });
    return res.json({ success: true, ...answer });
  } catch (error) {
    console.error("Failed to answer inventory question:", error);
    return res.status(500).json({ success: false, message: "Unable to answer this inventory question right now." });
  }
});

module.exports = router;

const HELP_ANSWER = "I can help with reorder decisions, inventory risk, stock levels, demand, anomalies, assigned stock, inventory value and recent transactions. Try one of the suggested questions.";

const normalizeWords = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const detectIntent = (message) => {
  const question = normalizeWords(message);
  if (!question) return "empty";
  if (/\b(value|worth|valuation)\b/.test(question) && /\b(inventory|stock|products?)\b/.test(question)) return "inventory_value";
  if (/\b(assigned|distributed|team member|my team|who has|holding)\b/.test(question)) return "assigned_inventory";
  if (/\b(anomal|unusual|unexpected activity)\b/.test(question)) return "anomalies";
  if (/\b(transactions?|movement|transferred|transfer|stock in|stock out|recently moved|latest movement)\b/.test(question)) return "transactions";
  if (/\b(demand|selling fastest|fastest selling|highest sales)\b/.test(question)) return "demand";
  if (/\b(high risk|risk|risky|run out|stockout|stock out soon|inventory at risk)\b/.test(question)) return "high_risk";
  if (/\b(low stock|low in stock|stock low|below threshold|below reorder point|reorder point)\b/.test(question)) return "low_stock";
  if (/\b(need attention|needs attention|require attention)\b/.test(question)) return "attention";
  if (/\b(reorder|restock|buy|purchase|what should i order)\b/.test(question)) return "reorder";
  if (/\b(why|explain|tell me about|how much|what is|what about)\b/.test(question)) return "product";
  return "unknown";
};

const findMentionedProduct = (message, products, contextProductName) => {
  const normalizedQuestion = ` ${normalizeWords(message)} `;
  const matches = products
    .filter((product) => {
      const name = normalizeWords(product.name);
      return name && normalizedQuestion.includes(` ${name} `);
    })
    .sort((first, second) => normalizeWords(second.name).length - normalizeWords(first.name).length);
  if (matches.length) return matches[0];

  const normalizedContext = normalizeWords(contextProductName);
  return products.find((product) => normalizeWords(product.name) === normalizedContext) || null;
};

const productCard = (product, decision = null, extras = {}) => ({
  productId: String(product._id || product.productId),
  name: product.name || product.productName,
  image: product.image || "",
  currentStock: decision?.currentStock ?? product.quantity ?? null,
  lowStockThreshold: product.lowStockThreshold ?? null,
  risk: decision?.risk || extras.risk || null,
  action: decision?.action || extras.action || null,
  averageDailyDemand: decision?.averageDailyDemand ?? null,
  reorderPoint: decision?.reorderPoint ?? null,
  recommendedOrderQuantity: decision?.recommendedOrderQuantity ?? null,
  supplierLeadTimeDays: decision?.supplierLeadTimeDays ?? null,
  explanation: decision?.explanation || extras.explanation || "",
  anomalyType: extras.anomalyType || null,
  severity: extras.severity || null,
  deviation: extras.deviation || null
});

const createAnswer = ({ intent, product, products = [], decisions = [], anomalies = [], transactions = [], members = [], user, question }) => {
  const decisionById = new Map(decisions.map((item) => [String(item.productId), item]));
  const decisionFor = (item) => decisionById.get(String(item._id || item.productId));
  let answer;
  let resultProducts = [];
  let insights = [];

  if (intent === "unknown") {
    answer = HELP_ANSWER;
  } else if (intent === "inventory_value") {
    const totalValue = products.reduce((total, item) => total + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
    answer = `The current value of the visible Main Inventory stock is ₹${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}, calculated from ${products.length} ${products.length === 1 ? "product" : "products"} using quantity × unit price.`;
    insights = [{ label: "Current inventory value", value: totalValue, currency: "INR", productCount: products.length }];
  } else if (intent === "reorder") {
    const needsAction = decisions.filter((item) => ["REORDER_NOW", "REORDER_SOON"].includes(item.action)
      && (!product || String(item.productId) === String(product._id)));
    resultProducts = needsAction.map((decision) => productCard(products.find((item) => String(item._id) === String(decision.productId)) || decision, decision));
    if (needsAction.length) {
      answer = `${needsAction.length} ${needsAction.length === 1 ? "product needs" : "products need"} attention according to the Decision Engine: ${needsAction.map((item) => item.name).join(", ")}.`;
    } else {
      const insufficient = decisions.filter((item) => item.action === "INSUFFICIENT_DATA");
      answer = insufficient.length
        ? `No product currently has a data-supported reorder recommendation. ${insufficient.length} ${insufficient.length === 1 ? "product needs" : "products need"} more stock-out history and/or supplier lead-time data. Ask about a product to see the exact reason.`
        : "The Decision Engine reports no products that currently need reordering.";
    }
  } else if (intent === "high_risk") {
    const risky = decisions.filter((item) => item.risk === "HIGH"
      && (!product || String(item.productId) === String(product._id)));
    resultProducts = risky.map((decision) => productCard(products.find((item) => String(item._id) === String(decision.productId)) || decision, decision));
    answer = risky.length
      ? `${risky.length} ${risky.length === 1 ? "product is" : "products are"} currently classified as high risk by the Decision Engine: ${risky.map((item) => item.name).join(", ")}.`
      : "The Decision Engine reports no high-risk products among the inventory you can access.";
  } else if (intent === "attention") {
    const needsAttention = decisions.filter((item) => item.action !== "HEALTHY" && item.action !== "INSUFFICIENT_DATA");
    resultProducts = needsAttention.map((decision) => productCard(products.find((item) => String(item._id) === String(decision.productId)) || decision, decision));
    answer = needsAttention.length
      ? `${needsAttention.length} ${needsAttention.length === 1 ? "product needs" : "products need"} attention according to the Decision Engine: ${needsAttention.map((item) => `${item.name} (${item.action.toLowerCase().replaceAll("_", " ")})`).join(", ")}.`
      : decisions.some((item) => item.action === "INSUFFICIENT_DATA")
        ? "No data-supported attention action was identified, but some products need more stock-out history or supplier lead-time data before their risk can be assessed."
        : "The Decision Engine reports no products currently needing attention.";
  } else if (intent === "low_stock") {
    const belowReorderPoint = /\breorder point\b/.test(normalizeWords(question));
    const lowStockProducts = products.filter((item) => {
      if (product && String(item._id) !== String(product._id)) return false;
      const decision = decisionFor(item);
      if (belowReorderPoint) return decision?.reorderPoint !== null && decision?.reorderPoint !== undefined && item.quantity <= decision.reorderPoint;
      return Number(item.quantity) <= Number(item.lowStockThreshold);
    });
    resultProducts = lowStockProducts.map((item) => productCard(item, decisionFor(item)));
    answer = lowStockProducts.length
      ? `${lowStockProducts.length} ${lowStockProducts.length === 1 ? "product is" : "products are"} ${belowReorderPoint ? "at or below a data-supported reorder point" : "at or below the saved low-stock threshold"}: ${lowStockProducts.map((item) => item.name).join(", ")}.`
      : belowReorderPoint && decisions.some((item) => item.reorderPoint === null)
        ? "I can't compare every product with a reliable reorder point because some are missing sufficient stock-out history or supplier lead-time data. No threshold-based low-stock products were found."
        : `No products are currently at or below ${belowReorderPoint ? "a data-supported reorder point" : "their saved low-stock threshold"}.`;
  } else if (intent === "demand") {
    const demandDecisions = decisions.filter((item) => Number.isFinite(item.averageDailyDemand));
    demandDecisions.sort((first, second) => second.averageDailyDemand - first.averageDailyDemand);
    if (demandDecisions.length) {
      const isSpecific = Boolean(product);
      const matches = isSpecific ? demandDecisions.filter((item) => String(item.productId) === String(product._id)) : demandDecisions.slice(0, 5);
      resultProducts = matches.map((decision) => productCard(products.find((item) => String(item._id) === String(decision.productId)) || decision, decision));
      answer = isSpecific
        ? matches.length
          ? `${matches[0].name} has recorded average OUT demand of ${matches[0].averageDailyDemand} units per day, based on ${matches[0].demandTransactionsUsed} historical transactions.`
          : `I don't have enough historical stock-out transactions to calculate demand for ${product.name} yet.`
        : `The highest recorded average daily demand is for ${demandDecisions[0].name} at ${demandDecisions[0].averageDailyDemand} units per day. Here are the top ${matches.length} products with sufficient history.`;
    } else {
      answer = product
        ? `I don't have enough historical stock-out transactions to calculate demand for ${product.name} yet.`
        : "I don't have enough historical stock-out transaction data to calculate demand for the products you can access yet.";
    }
  } else if (intent === "product_risk" || intent === "product") {
    if (!product) {
      answer = "I couldn't find a product matching that question in the inventory you can access. Check the product name and try again.";
    } else {
      const decision = decisionFor(product);
      resultProducts = [productCard(product, decision)];
      answer = decision
        ? `${product.name}: ${decision.explanation}${decision.recommendedOrderQuantity === null ? " A reliable order quantity is unavailable with the current data." : ` Recommended order: ${decision.recommendedOrderQuantity} units.`}`
        : `${product.name} has ${product.quantity} units in Main Inventory. Its low-stock threshold is ${product.lowStockThreshold} units.`;
    }
  } else if (intent === "anomalies") {
    const selectedAnomalies = product ? anomalies.filter((item) => item.product.id === String(product._id)) : anomalies;
    resultProducts = selectedAnomalies.map((item) => {
      const inventoryProduct = products.find((entry) => String(entry._id) === item.product.id) || { _id: item.product.id, name: item.product.name };
      return productCard(inventoryProduct, decisionFor(inventoryProduct), { anomalyType: item.anomalyType, severity: item.severity, explanation: item.explanation, deviation: item.deviation });
    });
    answer = selectedAnomalies.length
      ? `${selectedAnomalies.length} unusual ${selectedAnomalies.length === 1 ? "activity was" : "activities were"} detected from recorded transactions${product ? ` for ${product.name}` : ""}. Each result includes its explanation and evidence.`
      : product
        ? `No unusual activity was detected for ${product.name}. ${anomalies.length === 0 ? "The existing detector found no qualifying events in the available history." : ""}`
        : "No unusual inventory activity was detected in the transaction history available to you.";
  } else if (intent === "assigned_inventory") {
    if (product) {
      const allocations = (product.distributions || []).filter((allocation) => Number(allocation.quantity) > 0);
      if (!["admin", "manager"].includes(user.role)) {
        const ownAllocation = allocations.filter((allocation) => String(allocation.user) === String(user._id));
        const quantity = ownAllocation.reduce((total, allocation) => total + allocation.quantity, 0);
        answer = quantity ? `${product.name} has ${quantity} units distributed to your account.` : `${product.name} has no stock distributed to your account.`;
      } else if (allocations.length) {
        answer = allocations.map((allocation) => `${allocation.name || "Team member"}: ${allocation.quantity} units`).join("; ");
      } else {
        const assignee = members.find((member) => String(member._id) === String(product.assignedTo));
        answer = assignee ? `${product.name} is assigned to ${assignee.name}, but no distributed unit quantity is recorded for this product.` : `${product.name} has no stock currently distributed to team members.`;
      }
      resultProducts = [productCard(product)];
      insights = allocations.map((allocation) => ({ label: allocation.name || "Team member", value: allocation.quantity, unit: "units", productName: product.name }));
    } else {
      const totals = new Map();
      for (const item of products) {
        for (const allocation of item.distributions || []) {
          const id = String(allocation.user);
          if (!["admin", "manager"].includes(user.role) && id !== String(user._id)) continue;
          totals.set(id, (totals.get(id) || 0) + (Number(allocation.quantity) || 0));
        }
      }
      const ranked = members.map((member) => ({ name: member.name, quantity: totals.get(String(member._id)) || 0 })).sort((a, b) => b.quantity - a.quantity);
      const unitTotal = ranked.reduce((total, member) => total + member.quantity, 0);
      if (/\bwho has the most\b|\bmost inventory\b/.test(normalizeWords(question)) && ranked[0]?.quantity > 0) {
        answer = `${ranked[0].name} has the most distributed inventory, with ${ranked[0].quantity} units across visible products.`;
      } else {
        answer = `${unitTotal} units are currently distributed across the team inventory visible to you.`;
      }
      insights = ranked.filter((member) => member.quantity > 0).map((member) => ({ label: member.name, value: member.quantity, unit: "units" }));
    }
  } else if (intent === "transactions") {
    const displayedTransactions = transactions.slice(0, 5);
    if (!displayedTransactions.length) {
      answer = `No matching inventory transactions were found${product ? ` for ${product.name}` : ""}.`;
    } else {
      answer = displayedTransactions.map((transaction) => {
        const actor = transaction.performedByName || transaction.performedBy?.name || "Legacy record";
        return `${transaction.productName}: ${transaction.type} ${transaction.quantity} units, ${new Date(transaction.createdAt).toLocaleDateString("en-GB")} (by ${actor})`;
      }).join(". ");
      insights = displayedTransactions.map((transaction) => ({
        productName: transaction.productName,
        type: transaction.type,
        quantity: transaction.quantity,
        detectedAt: transaction.createdAt,
        performedBy: transaction.performedByName || transaction.performedBy?.name || "Legacy record",
        note: transaction.note || ""
      }));
    }
  }

  const contextName = product?.name || resultProducts[0]?.name || null;
  return { answer: answer || HELP_ANSWER, intent, products: resultProducts, insights, contextProductName: contextName };
};

module.exports = { HELP_ANSWER, normalizeWords, detectIntent, findMentionedProduct, productCard, createAnswer };

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ANALYSIS_PERIOD_DAYS = 90;
const MINIMUM_OUT_HISTORY = 3;
const EXCESS_COVERAGE_DAYS = 180;
const SEVERE_EXCESS_COVERAGE_DAYS = 365;
const SLOW_COVERAGE_DAYS = 90;
const MODERATE_SLOW_COVERAGE_DAYS = 135;

const roundTo = (value, places = 2) => Number(value.toFixed(places));

const analyzeDeadStock = (products, transactions, now = Date.now()) => {
  const transactionGroups = new Map();
  for (const transaction of transactions) {
    const productId = String(transaction.product?._id || transaction.product || "");
    if (!transactionGroups.has(productId)) transactionGroups.set(productId, []);
    const createdAt = new Date(transaction.createdAt).getTime();
    const quantity = Number(transaction.quantity);
    if (!["IN", "OUT", "TRANSFER", "RETURN"].includes(transaction.type)
      || !Number.isFinite(createdAt) || createdAt > now || !Number.isFinite(quantity) || quantity <= 0) continue;
    transactionGroups.get(productId).push({ type: transaction.type, quantity, createdAt });
  }

  const periodStart = now - ANALYSIS_PERIOD_DAYS * DAY_IN_MS;
  const items = products.map((product) => {
    const history = (transactionGroups.get(String(product._id)) || []).sort((first, second) => second.createdAt - first.createdAt);
    const outHistory = history.filter((transaction) => transaction.type === "OUT");
    const recentOut = outHistory.filter((transaction) => transaction.createdAt >= periodStart);
    const outQuantity90Days = recentOut.reduce((total, transaction) => total + transaction.quantity, 0);
    const lastMovement = history[0] || null;
    const lastOut = outHistory[0] || null;
    const daysSinceLastMovement = lastMovement ? Math.floor((now - lastMovement.createdAt) / DAY_IN_MS) : null;
    const daysSinceLastOut = lastOut ? Math.floor((now - lastOut.createdAt) / DAY_IN_MS) : null;
    const enoughHistory = outHistory.length >= MINIMUM_OUT_HISTORY;
    const currentStock = Math.max(0, Number(product.quantity) || 0);
    const unitPrice = Number(product.price);
    const hasReliablePrice = product.price !== null && product.price !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0;
    const averageDailyOutDemand = enoughHistory ? roundTo(outQuantity90Days / ANALYSIS_PERIOD_DAYS) : null;
    const daysOfStockCoverage = averageDailyOutDemand > 0 ? roundTo(currentStock / averageDailyOutDemand) : null;

    let status = "INSUFFICIENT_DATA";
    let severity = "UNKNOWN";
    let recommendedAction = "REVIEW";
    let explanation = `Only ${outHistory.length} stock-out transactions are recorded; at least ${MINIMUM_OUT_HISTORY} are needed to classify movement reliably.`;

    if (enoughHistory) {
      if (currentStock === 0) {
        status = "ACTIVE";
        severity = "LOW";
        recommendedAction = "MONITOR";
        explanation = `There is no Main Inventory stock to classify as tied-up or dead stock. ${outQuantity90Days} units were issued during the last ${ANALYSIS_PERIOD_DAYS} days.`;
      } else if (daysSinceLastMovement === null || daysSinceLastMovement >= ANALYSIS_PERIOD_DAYS) {
        status = "NO_MOVEMENT";
        severity = currentStock >= Math.max(1, Number(product.lowStockThreshold) || 0) ? "HIGH" : "MEDIUM";
        recommendedAction = "REVIEW";
        explanation = `${currentStock} units remain in Main Inventory, but no stock movement was recorded during the last ${ANALYSIS_PERIOD_DAYS} days. There are ${outHistory.length} recorded stock-out transactions in the history, so this inactivity is based on an established demand record.`;
      } else if (outQuantity90Days === 0) {
        status = "SLOW_MOVING";
        severity = currentStock >= Math.max(1, Number(product.lowStockThreshold) || 0) ? "MEDIUM" : "LOW";
        recommendedAction = "REVIEW";
        explanation = `${currentStock} units remain in Main Inventory and there was recent stock movement, but no stock-outs were recorded during the last ${ANALYSIS_PERIOD_DAYS} days. Review the recorded receipts/transfers and expected use before reordering.`;
      } else if (daysOfStockCoverage > EXCESS_COVERAGE_DAYS) {
        status = "EXCESS_STOCK";
        severity = daysOfStockCoverage > SEVERE_EXCESS_COVERAGE_DAYS ? "HIGH" : "MEDIUM";
        recommendedAction = "REDUCE_REORDERING";
        explanation = `${currentStock} units are on hand, while ${outQuantity90Days} units were issued in the last ${ANALYSIS_PERIOD_DAYS} days (${averageDailyOutDemand} units/day). Current stock represents about ${daysOfStockCoverage} days of demand, above the ${EXCESS_COVERAGE_DAYS}-day excess-stock threshold.`;
      } else if (daysOfStockCoverage > SLOW_COVERAGE_DAYS) {
        status = "SLOW_MOVING";
        severity = daysOfStockCoverage > MODERATE_SLOW_COVERAGE_DAYS ? "MEDIUM" : "LOW";
        recommendedAction = "PROMOTE_USAGE";
        explanation = `${currentStock} units are on hand, while ${outQuantity90Days} units were issued in the last ${ANALYSIS_PERIOD_DAYS} days (${averageDailyOutDemand} units/day). At this rate, current stock covers about ${daysOfStockCoverage} days, above the ${SLOW_COVERAGE_DAYS}-day slow-moving threshold.`;
      } else {
        status = "ACTIVE";
        severity = "LOW";
        recommendedAction = "MONITOR";
        explanation = `${outQuantity90Days} units were issued during the last ${ANALYSIS_PERIOD_DAYS} days (${averageDailyOutDemand} units/day). Current stock covers about ${daysOfStockCoverage} days of demand, within the active range.`;
      }
    }

    return {
      productId: String(product._id),
      name: product.name,
      sku: typeof product.sku === "string" && product.sku.trim() ? product.sku.trim() : null,
      currentStock,
      lastMovementAt: lastMovement ? new Date(lastMovement.createdAt).toISOString() : null,
      daysSinceLastMovement,
      daysSinceLastOut,
      outQuantity90Days,
      averageDailyOutDemand,
      daysOfStockCoverage,
      estimatedTiedUpValue: hasReliablePrice ? roundTo(currentStock * unitPrice) : null,
      financialValueAvailable: hasReliablePrice,
      status,
      severity,
      recommendedAction,
      explanation,
      analysisPeriodDays: ANALYSIS_PERIOD_DAYS,
      stockOutTransactionCount: outHistory.length
    };
  });

  const tiedUpValueAvailable = products.length > 0 && items.every((item) => item.currentStock === 0 || item.financialValueAvailable);
  const summary = {
    totalProducts: items.length,
    deadStockItems: items.filter((item) => item.status === "NO_MOVEMENT").length,
    slowMovingItems: items.filter((item) => item.status === "SLOW_MOVING").length,
    excessStockItems: items.filter((item) => item.status === "EXCESS_STOCK").length,
    insufficientDataItems: items.filter((item) => item.status === "INSUFFICIENT_DATA").length,
    estimatedTiedUpValue: tiedUpValueAvailable
      ? roundTo(items.reduce((total, item) => total + (item.estimatedTiedUpValue || 0), 0))
      : null,
    financialValueAvailable: tiedUpValueAvailable,
    financialValueUnavailableCount: items.filter((item) => item.currentStock > 0 && !item.financialValueAvailable).length
  };

  return { summary, items };
};

module.exports = {
  analyzeDeadStock,
  ANALYSIS_PERIOD_DAYS,
  MINIMUM_OUT_HISTORY,
  EXCESS_COVERAGE_DAYS,
  SEVERE_EXCESS_COVERAGE_DAYS,
  SLOW_COVERAGE_DAYS
};

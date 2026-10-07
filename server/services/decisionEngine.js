const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 90;
const MINIMUM_OUT_TRANSACTIONS = 3;
const REVIEW_PERIOD_DAYS = 30;

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatUnits = (value) => Number(value.toFixed(1)).toString();

const buildProductScope = (user) => {
  const filter = { organization: user.organization };
  if (user.role === "staff") {
    filter.$or = [
      { assignedTo: user._id },
      { "distributions.user": user._id }
    ];
  }
  return filter;
};

const buildOutTransactionScope = (organization, productIds) => ({
  organization,
  type: "OUT",
  product: { $in: productIds }
});

const createDecision = (product, transactions, now = Date.now()) => {
  const validTransactions = transactions
    .map((transaction) => ({
      quantity: toFiniteNumber(transaction.quantity),
      createdAt: new Date(transaction.createdAt).getTime()
    }))
    .filter((transaction) => transaction.quantity !== null && transaction.quantity > 0 && Number.isFinite(transaction.createdAt))
    .sort((left, right) => right.createdAt - left.createdAt);

  const recentCutoff = now - RECENT_WINDOW_DAYS * DAY_IN_MS;
  const recentTransactions = validTransactions.filter((transaction) => transaction.createdAt >= recentCutoff);
  const demandTransactions = recentTransactions.length >= MINIMUM_OUT_TRANSACTIONS
    ? recentTransactions
    : validTransactions;

  const totalUnitsConsumed = validTransactions.reduce((total, transaction) => total + transaction.quantity, 0);
  const demandUnitsUsed = demandTransactions.reduce((total, transaction) => total + transaction.quantity, 0);
  const oldestDemandAt = demandTransactions.length
    ? demandTransactions[demandTransactions.length - 1].createdAt
    : null;
  const newestDemandAt = demandTransactions.length
    ? demandTransactions[0].createdAt
    : null;
  // Using the observed date span (at least one day) avoids inventing a fixed demand period.
  const demandObservationDays = oldestDemandAt === null
    ? null
    : Math.max((newestDemandAt - oldestDemandAt) / DAY_IN_MS, 1);
  const averageDailyDemand = demandTransactions.length > 0 && demandObservationDays !== null
    ? demandUnitsUsed / demandObservationDays
    : null;
  const averageDemandPerTransaction = demandTransactions.length > 0
    ? demandUnitsUsed / demandTransactions.length
    : null;

  const currentStock = Math.max(0, toFiniteNumber(product.quantity) ?? 0);
  const threshold = Math.max(0, toFiniteNumber(product.lowStockThreshold) ?? 0);
  // The existing low-stock threshold is used as the safety-stock buffer.
  const safetyStock = threshold;
  const supplierLeadTimeDays = Number.isInteger(product.supplierLeadTimeDays) && product.supplierLeadTimeDays >= 1
    ? product.supplierLeadTimeDays
    : null;
  const hasEnoughDemandHistory = demandTransactions.length >= MINIMUM_OUT_TRANSACTIONS;
  const hasReliableInputs = hasEnoughDemandHistory && averageDailyDemand !== null && supplierLeadTimeDays !== null;

  const expectedLeadTimeDemand = hasReliableInputs
    ? averageDailyDemand * supplierLeadTimeDays
    : null;
  const reorderPoint = hasReliableInputs
    ? Math.ceil(expectedLeadTimeDemand + safetyStock)
    : null;
  const targetStockLevel = hasReliableInputs
    ? Math.ceil(safetyStock + averageDailyDemand * (supplierLeadTimeDays + REVIEW_PERIOD_DAYS))
    : null;
  const recommendedOrderQuantity = hasReliableInputs
    ? Math.max(targetStockLevel - currentStock, 0)
    : null;
  const estimatedDaysUntilStockout = averageDailyDemand !== null && averageDailyDemand > 0
    ? currentStock / averageDailyDemand
    : null;

  let risk = "UNKNOWN";
  if (currentStock === 0) {
    risk = "HIGH";
  } else if (estimatedDaysUntilStockout !== null && supplierLeadTimeDays !== null) {
    if (estimatedDaysUntilStockout <= supplierLeadTimeDays) risk = "HIGH";
    else if (estimatedDaysUntilStockout <= supplierLeadTimeDays + 7) risk = "MEDIUM";
    else risk = "LOW";
  }

  let action = "INSUFFICIENT_DATA";
  if (currentStock === 0) {
    // Zero stock is an immediate operational condition even without enough history to size an order.
    action = "REORDER_NOW";
  } else if (hasReliableInputs) {
    if (currentStock <= reorderPoint) {
      action = "REORDER_NOW";
    } else if (currentStock <= reorderPoint + averageDailyDemand * 7) {
      action = "REORDER_SOON";
    } else if (currentStock <= targetStockLevel) {
      action = "MONITOR";
    } else {
      action = "HEALTHY";
    }
  }

  let explanation;
  if (currentStock === 0) {
    explanation = hasReliableInputs
      ? `There is no stock available. The calculated reorder point is ${reorderPoint} units; estimated demand during the ${supplierLeadTimeDays}-day supplier lead time is ${formatUnits(expectedLeadTimeDemand)} units.`
      : "There is no stock available, so restock immediately. Historical demand and/or supplier lead-time data is insufficient to size a reliable order.";
  } else if (!hasEnoughDemandHistory) {
    explanation = `Only ${demandTransactions.length} valid OUT transactions are available; at least ${MINIMUM_OUT_TRANSACTIONS} are needed for a demand-based recommendation.`;
  } else if (supplierLeadTimeDays === null) {
    explanation = `Average demand is ${formatUnits(averageDailyDemand)} units/day, but supplier lead time is not set. Add the supplier lead time to calculate a reliable reorder point.`;
  } else if (currentStock <= reorderPoint) {
    explanation = `Current stock is ${currentStock} units, at or below the reorder point of ${reorderPoint} units. Average demand is ${formatUnits(averageDailyDemand)} units/day and supplier lead time is ${supplierLeadTimeDays} days, creating estimated lead-time demand of ${formatUnits(expectedLeadTimeDemand)} units.`;
  } else if (action === "REORDER_SOON") {
    explanation = `Current stock is ${currentStock} units, above the reorder point of ${reorderPoint} units but within the next 7 days of estimated demand. Average demand is ${formatUnits(averageDailyDemand)} units/day.`;
  } else if (action === "MONITOR") {
    explanation = `Current stock is ${currentStock} units, above the reorder point of ${reorderPoint} units but at or below the ${targetStockLevel}-unit target (lead time plus a ${REVIEW_PERIOD_DAYS}-day review period and ${safetyStock} units of safety stock).`;
  } else {
    explanation = `Current stock is ${currentStock} units, above the ${targetStockLevel}-unit target level. Average demand is ${formatUnits(averageDailyDemand)} units/day and supplier lead time is ${supplierLeadTimeDays} days.`;
  }

  const historyStart = oldestDemandAt === null ? null : new Date(oldestDemandAt).toISOString();
  const historyEnd = newestDemandAt === null ? null : new Date(newestDemandAt).toISOString();

  return {
    productId: product._id,
    name: product.name,
    currentStock,
    totalUnitsConsumed,
    outTransactionCount: validTransactions.length,
    demandTransactionsUsed: demandTransactions.length,
    demandWindow: recentTransactions.length >= MINIMUM_OUT_TRANSACTIONS ? "RECENT_90_DAYS" : "ALL_AVAILABLE_HISTORY",
    demandHistoryStart: historyStart,
    demandHistoryEnd: historyEnd,
    demandObservationDays: demandObservationDays === null ? null : Number(demandObservationDays.toFixed(2)),
    averageDemandPerTransaction: averageDemandPerTransaction === null ? null : Number(averageDemandPerTransaction.toFixed(2)),
    averageDailyDemand: averageDailyDemand === null ? null : Number(averageDailyDemand.toFixed(2)),
    supplierLeadTimeDays,
    safetyStock,
    expectedLeadTimeDemand: expectedLeadTimeDemand === null ? null : Number(expectedLeadTimeDemand.toFixed(2)),
    reorderPoint,
    targetStockLevel,
    estimatedDaysUntilStockout: estimatedDaysUntilStockout === null ? null : Number(estimatedDaysUntilStockout.toFixed(2)),
    risk,
    action,
    recommendedOrderQuantity,
    explanation
  };
};

const summarizeDecisions = (products) => products.reduce((summary, product) => {
  summary.totalProducts += 1;
  if (product.action === "HEALTHY") summary.healthy += 1;
  else if (product.action === "MONITOR") summary.monitor += 1;
  else if (product.action === "REORDER_SOON") summary.reorderSoon += 1;
  else if (product.action === "REORDER_NOW") summary.reorderNow += 1;
  else summary.insufficientData += 1;
  return summary;
}, { totalProducts: 0, healthy: 0, monitor: 0, reorderSoon: 0, reorderNow: 0, insufficientData: 0 });

module.exports = {
  MINIMUM_OUT_TRANSACTIONS,
  buildProductScope,
  buildOutTransactionScope,
  createDecision,
  summarizeDecisions
};

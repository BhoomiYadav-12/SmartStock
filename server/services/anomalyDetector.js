const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MINIMUM_HISTORY = 3;
const RECENT_MOVEMENT_DAYS = 30;
const DEMAND_RECENT_DAYS = 7;
const DEMAND_BASELINE_DAYS = 30;
const RAPID_WINDOW_HOURS = 24;

// Explainable thresholds: isolated movements require >=1.5x the prior median plus
// either a robust z-score >=3.5 or a very large >=3x ratio. Demand/rapid rules use
// >=2x baseline for MEDIUM and >=3x (or >=6x for rapid counts) for HIGH.
const severityForRatio = (ratio) => ratio >= 3 ? "HIGH" : ratio >= 2 ? "MEDIUM" : "LOW";
const formatNumber = (value) => Number(value.toFixed(1)).toString();

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const normalizeTransactions = (transactions) => transactions
  .map((transaction) => ({
    id: String(transaction._id || ""),
    type: transaction.type,
    quantity: Number(transaction.quantity),
    createdAt: new Date(transaction.createdAt),
    previousQuantity: Number(transaction.previousQuantity),
    newQuantity: Number(transaction.newQuantity),
    note: typeof transaction.note === "string" ? transaction.note : ""
  }))
  .filter((transaction) => ["IN", "OUT"].includes(transaction.type)
    && Number.isFinite(transaction.quantity) && transaction.quantity > 0
    && Number.isFinite(transaction.createdAt.getTime()))
  .sort((first, second) => first.createdAt - second.createdAt);

const transactionEvidence = (transactions) => transactions.slice(-8).map((transaction) => ({
  id: transaction.id,
  type: transaction.type,
  quantity: transaction.quantity,
  previousQuantity: Number.isFinite(transaction.previousQuantity) ? transaction.previousQuantity : null,
  newQuantity: Number.isFinite(transaction.newQuantity) ? transaction.newQuantity : null,
  detectedAt: transaction.createdAt.toISOString(),
  note: transaction.note
}));

const makeAnomaly = ({ product, type, severity, observedValue, baselineValue, detectedAt, explanation, relatedTransactions, unit = "units", window }) => {
  const ratio = baselineValue > 0 ? observedValue / baselineValue : null;
  return {
    id: `${product._id}-${type}-${detectedAt.getTime()}`,
    product: { id: String(product._id), name: product.name, category: product.category || "" },
    anomalyType: type,
    severity,
    observedValue: Number(observedValue.toFixed(2)),
    baselineValue: Number(baselineValue.toFixed(2)),
    unit,
    deviation: ratio === null ? null : {
      multiplier: Number(ratio.toFixed(2)),
      percent: Math.round((ratio - 1) * 100)
    },
    detectedAt: detectedAt.toISOString(),
    explanation,
    window,
    relatedTransactions: transactionEvidence(relatedTransactions)
  };
};

const detectLargeMovements = (product, transactions, now) => {
  const anomalies = [];
  const recentCutoff = now - RECENT_MOVEMENT_DAYS * DAY_IN_MS;

  for (const type of ["OUT", "IN"]) {
    const movements = transactions.filter((transaction) => transaction.type === type);
    movements.forEach((movement, index) => {
      if (movement.createdAt.getTime() < recentCutoff || movement.createdAt.getTime() > now) return;
      const history = movements.slice(0, index);
      if (history.length < MINIMUM_HISTORY) return;

      const baseline = median(history.map((transaction) => transaction.quantity));
      if (!baseline || movement.quantity < baseline * 1.5) return;

      const deviationFromMedian = median(history.map((transaction) => Math.abs(transaction.quantity - baseline))) || 0;
      const robustScore = deviationFromMedian === 0
        ? (movement.quantity > baseline * 1.5 ? Number.POSITIVE_INFINITY : 0)
        : 0.6745 * (movement.quantity - baseline) / deviationFromMedian;
      const ratio = movement.quantity / baseline;
      if (robustScore < 3.5 && ratio < 3) return;

      const label = type === "OUT" ? "OUT" : "IN";
      const anomalyType = type === "OUT" ? "UNUSUAL_STOCK_OUT" : "UNUSUAL_STOCK_IN";
      const historySummary = history.slice(-3);
      anomalies.push(makeAnomaly({
        product,
        type: anomalyType,
        severity: severityForRatio(ratio),
        observedValue: movement.quantity,
        baselineValue: baseline,
        detectedAt: movement.createdAt,
        explanation: `${label} quantity of ${formatNumber(movement.quantity)} units is ${formatNumber(ratio)}× the prior median of ${formatNumber(baseline)} units across ${history.length} earlier ${label} movements.`,
        relatedTransactions: [...historySummary, movement],
        window: `Compared with all ${history.length} earlier ${label} transactions`
      }));
    });
  }
  return anomalies;
};

const detectDemandSpike = (product, transactions, now) => {
  const outTransactions = transactions.filter((transaction) => transaction.type === "OUT");
  const recentStart = now - DEMAND_RECENT_DAYS * DAY_IN_MS;
  const baselineStart = recentStart - DEMAND_BASELINE_DAYS * DAY_IN_MS;
  const recent = outTransactions.filter((transaction) => transaction.createdAt.getTime() >= recentStart && transaction.createdAt.getTime() <= now);
  const baseline = outTransactions.filter((transaction) => transaction.createdAt.getTime() >= baselineStart && transaction.createdAt.getTime() < recentStart);
  if (recent.length < MINIMUM_HISTORY || baseline.length < MINIMUM_HISTORY) return null;

  const recentDailyDemand = recent.reduce((total, transaction) => total + transaction.quantity, 0) / DEMAND_RECENT_DAYS;
  const baselineDailyDemand = baseline.reduce((total, transaction) => total + transaction.quantity, 0) / DEMAND_BASELINE_DAYS;
  if (baselineDailyDemand <= 0) return null;
  const ratio = recentDailyDemand / baselineDailyDemand;
  if (ratio < 2) return null;

  const latest = recent[recent.length - 1];
  return makeAnomaly({
    product,
    type: "DEMAND_SPIKE",
    severity: severityForRatio(ratio),
    observedValue: recentDailyDemand,
    baselineValue: baselineDailyDemand,
    detectedAt: latest.createdAt,
    unit: "units/day",
    explanation: `Recent daily OUT demand is ${formatNumber(ratio)}× the historical baseline (${formatNumber(recentDailyDemand)} vs ${formatNumber(baselineDailyDemand)} units/day), based on ${recent.length} recent and ${baseline.length} baseline transactions.`,
    relatedTransactions: [...baseline.slice(-4), ...recent.slice(-4)],
    window: `Recent ${DEMAND_RECENT_DAYS} days vs preceding ${DEMAND_BASELINE_DAYS} days`
  });
};

const detectRapidMovement = (product, transactions, now) => {
  const outTransactions = transactions.filter((transaction) => transaction.type === "OUT");
  const recentStart = now - RAPID_WINDOW_HOURS * 60 * 60 * 1000;
  const baselineStart = recentStart - DEMAND_BASELINE_DAYS * DAY_IN_MS;
  const recent = outTransactions.filter((transaction) => transaction.createdAt.getTime() >= recentStart && transaction.createdAt.getTime() <= now);
  const baseline = outTransactions.filter((transaction) => transaction.createdAt.getTime() >= baselineStart && transaction.createdAt.getTime() < recentStart);
  if (recent.length < MINIMUM_HISTORY || baseline.length < MINIMUM_HISTORY) return null;

  const expectedPerDay = baseline.length / DEMAND_BASELINE_DAYS;
  const movementRatio = recent.length / expectedPerDay;
  if (movementRatio < 3) return null;

  const latest = recent[recent.length - 1];
  return makeAnomaly({
    product,
    type: "RAPID_MOVEMENT",
    severity: movementRatio >= 6 ? "HIGH" : movementRatio >= 3 ? "MEDIUM" : "LOW",
    observedValue: recent.length,
    baselineValue: expectedPerDay,
    detectedAt: latest.createdAt,
    unit: "OUT transactions/24h",
    explanation: `${recent.length} OUT transactions occurred within 24 hours, ${formatNumber(movementRatio)}× the historical rate of ${formatNumber(expectedPerDay)} transactions per day.`,
    relatedTransactions: [...baseline.slice(-4), ...recent],
    window: "Most recent 24 hours vs preceding 30 days"
  });
};

const analyzeInventoryAnomalies = (products, transactions, now = Date.now()) => {
  const productTransactions = new Map();
  for (const transaction of transactions) {
    const productId = String(transaction.product?._id || transaction.product || "");
    if (!productTransactions.has(productId)) productTransactions.set(productId, []);
    productTransactions.get(productId).push(transaction);
  }

  const anomalies = [];
  const insufficientProducts = [];
  for (const product of products) {
    const normalized = normalizeTransactions(productTransactions.get(String(product._id)) || []);
    if (normalized.length < MINIMUM_HISTORY) {
      insufficientProducts.push({
        product: { id: String(product._id), name: product.name, category: product.category || "" },
        movementCount: normalized.length,
        requiredMovements: MINIMUM_HISTORY,
        message: `Insufficient data: ${normalized.length} relevant stock IN/OUT transactions found; at least ${MINIMUM_HISTORY} are required.`
      });
    }

    anomalies.push(...detectLargeMovements(product, normalized, now));
    const demandSpike = detectDemandSpike(product, normalized, now);
    if (demandSpike) anomalies.push(demandSpike);
    const rapidMovement = detectRapidMovement(product, normalized, now);
    if (rapidMovement) anomalies.push(rapidMovement);
  }

  anomalies.sort((first, second) => new Date(second.detectedAt) - new Date(first.detectedAt));
  const summary = {
    totalAnomalies: anomalies.length,
    highCount: anomalies.filter((anomaly) => anomaly.severity === "HIGH").length,
    mediumCount: anomalies.filter((anomaly) => anomaly.severity === "MEDIUM").length,
    lowCount: anomalies.filter((anomaly) => anomaly.severity === "LOW").length,
    insufficientDataCount: insufficientProducts.length,
    productCount: products.length
  };

  return { anomalies, summary, insufficientProducts };
};

module.exports = {
  analyzeInventoryAnomalies,
  median,
  MINIMUM_HISTORY,
  DEMAND_RECENT_DAYS,
  DEMAND_BASELINE_DAYS,
  RAPID_WINDOW_HOURS
};

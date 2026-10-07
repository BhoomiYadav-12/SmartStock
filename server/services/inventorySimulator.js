const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REVIEW_PERIOD_DAYS = 30;

const roundToTwo = (value) => Number(value.toFixed(2));

const getRisk = ({ currentStock, demandPerDay, leadTimeDays }) => {
  if (currentStock === 0) return "HIGH";
  if (demandPerDay === null || leadTimeDays === null) return "UNKNOWN";
  if (demandPerDay === 0) return "LOW";

  const daysUntilStockout = currentStock / demandPerDay;
  if (daysUntilStockout <= leadTimeDays) return "HIGH";
  if (daysUntilStockout <= leadTimeDays + 7) return "MEDIUM";
  return "LOW";
};

const getAction = ({ currentStock, hasReliableInputs, reorderPoint, targetStockLevel, demandPerDay }) => {
  if (currentStock === 0) return "REORDER_NOW";
  if (!hasReliableInputs) return "INSUFFICIENT_DATA";
  if (currentStock <= reorderPoint) return "REORDER_NOW";
  if (currentStock <= reorderPoint + demandPerDay * 7) return "REORDER_SOON";
  if (currentStock <= targetStockLevel) return "MONITOR";
  return "HEALTHY";
};

const explainScenario = ({ demandChangePercent, leadTimeChangeDays, current, simulated }) => {
  const pieces = [];
  const describeDemand = (value) => value === null ? "unavailable" : `${value} units/day`;

  if (demandChangePercent > 0) {
    pieces.push(`Demand increased by ${demandChangePercent}%, changing estimated daily use from ${describeDemand(current.averageDailyDemand)} to ${describeDemand(simulated.averageDailyDemand)}.`);
  } else if (demandChangePercent < 0) {
    pieces.push(`Demand decreased by ${Math.abs(demandChangePercent)}%, changing estimated daily use from ${describeDemand(current.averageDailyDemand)} to ${describeDemand(simulated.averageDailyDemand)}.`);
  } else {
    pieces.push(`Demand is unchanged at an estimated ${describeDemand(simulated.averageDailyDemand)}.`);
  }

  if (leadTimeChangeDays > 0 && current.supplierLeadTimeDays !== null) {
    pieces.push(`The supplier delay adds ${leadTimeChangeDays} days, changing lead time from ${current.supplierLeadTimeDays ?? "unknown"} to ${simulated.supplierLeadTimeDays ?? "unknown"} days.`);
  } else if (leadTimeChangeDays > 0) {
    pieces.push(`A ${leadTimeChangeDays}-day supplier delay was requested, but the product's base lead time is not set, so total simulated lead time is unavailable.`);
  } else {
    pieces.push(`Supplier lead time remains ${simulated.supplierLeadTimeDays ?? "unknown"} days.`);
  }

  if (current.risk !== simulated.risk) {
    pieces.push(`Risk changes from ${current.risk} to ${simulated.risk}.`);
  } else {
    pieces.push(`Risk remains ${simulated.risk}.`);
  }

  if (simulated.reorderPoint !== null && current.reorderPoint !== simulated.reorderPoint) {
    pieces.push(`The reorder point changes from ${current.reorderPoint ?? "unavailable"} to ${simulated.reorderPoint} units.`);
  }

  if (simulated.targetStockLevel !== null) {
    pieces.push(`The planning target covers supplier lead time plus ${simulated.simulationHorizonDays} days, for a target of ${simulated.targetStockLevel} units and a simulated order quantity of ${simulated.recommendedOrderQuantity} units.`);
  } else {
    pieces.push("A reliable reorder quantity is unavailable until demand history and supplier lead time are known.");
  }

  if (current.estimatedDaysUntilStockout !== simulated.estimatedDaysUntilStockout) {
    const describeStockout = (data) => {
      if (data.estimatedDaysUntilStockout !== null) return `${data.estimatedDaysUntilStockout} days`;
      return data.averageDailyDemand === 0 && data.risk !== "UNKNOWN" ? "not projected at zero demand" : "unavailable";
    };
    pieces.push(`Estimated stockout timing changes from ${describeStockout(current)} to ${describeStockout(simulated)}.`);
  }

  return pieces.join(" ");
};

const simulateInventory = (currentDecision, scenario, now = new Date()) => {
  const {
    demandChangePercent,
    leadTimeChangeDays,
    simulationHorizonDays
  } = scenario;
  const currentStock = currentDecision.currentStock;
  const currentDailyDemand = currentDecision.averageDailyDemand;
  const simulatedDailyDemand = currentDailyDemand === null
    ? null
    : Math.max(0, currentDailyDemand * (1 + demandChangePercent / 100));
  const simulatedLeadTimeDays = currentDecision.supplierLeadTimeDays === null
    ? null
    : currentDecision.supplierLeadTimeDays + leadTimeChangeDays;
  const safetyStock = currentDecision.safetyStock;
  const hasReliableInputs = currentDecision.demandTransactionsUsed >= 3
    && simulatedDailyDemand !== null
    && simulatedLeadTimeDays !== null;

  const expectedLeadTimeDemand = hasReliableInputs
    ? simulatedDailyDemand * simulatedLeadTimeDays
    : null;
  const reorderPoint = hasReliableInputs
    ? Math.ceil(expectedLeadTimeDemand + safetyStock)
    : null;
  const targetStockLevel = hasReliableInputs
    ? Math.ceil(safetyStock + simulatedDailyDemand * (simulatedLeadTimeDays + simulationHorizonDays))
    : null;
  const recommendedOrderQuantity = hasReliableInputs
    ? Math.max(targetStockLevel - currentStock, 0)
    : null;
  const estimatedDaysUntilStockout = currentStock === 0
    ? 0
    : simulatedDailyDemand > 0
      ? currentStock / simulatedDailyDemand
      : null;
  const estimatedStockoutDate = estimatedDaysUntilStockout === null
    ? null
    : new Date(now.getTime() + estimatedDaysUntilStockout * DAY_IN_MS).toISOString();
  const risk = getRisk({
    currentStock,
    demandPerDay: hasReliableInputs ? simulatedDailyDemand : null,
    leadTimeDays: simulatedLeadTimeDays
  });
  const action = getAction({
    currentStock,
    hasReliableInputs,
    reorderPoint,
    targetStockLevel,
    demandPerDay: simulatedDailyDemand
  });

  const current = {
    currentStock,
    averageDailyDemand: currentDailyDemand,
    supplierLeadTimeDays: currentDecision.supplierLeadTimeDays,
    estimatedDaysUntilStockout: currentDecision.estimatedDaysUntilStockout,
    estimatedStockoutDate: currentDecision.estimatedDaysUntilStockout === null
      ? null
      : new Date(now.getTime() + currentDecision.estimatedDaysUntilStockout * DAY_IN_MS).toISOString(),
    reorderPoint: currentDecision.reorderPoint,
    risk: currentDecision.risk,
    action: currentDecision.action,
    recommendedOrderQuantity: currentDecision.recommendedOrderQuantity
  };
  const simulated = {
    currentStock,
    averageDailyDemand: simulatedDailyDemand === null ? null : roundToTwo(simulatedDailyDemand),
    supplierLeadTimeDays: simulatedLeadTimeDays,
    expectedLeadTimeDemand: expectedLeadTimeDemand === null ? null : roundToTwo(expectedLeadTimeDemand),
    reorderPoint,
    targetStockLevel,
    simulationHorizonDays,
    estimatedDaysUntilStockout: estimatedDaysUntilStockout === null ? null : roundToTwo(estimatedDaysUntilStockout),
    estimatedStockoutDate,
    risk,
    action,
    recommendedOrderQuantity
  };

  return {
    scenario: { demandChangePercent, leadTimeChangeDays, simulationHorizonDays },
    current,
    simulated,
    explanation: explainScenario({ demandChangePercent, leadTimeChangeDays, current, simulated })
  };
};

module.exports = { simulateInventory };

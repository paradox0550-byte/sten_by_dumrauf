'use strict';

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumDefined(values) {
  const present = values.filter(value => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function pctOf(value, base) {
  const denominator = numOrNull(base);
  const numerator = numOrNull(value);
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator * 100;
}

function pnl({ revenue, cogs, personnel, overtime, opex, other, other_operating, depreciation, interest, tax } = {}) {
  const expenseValue = value => {
    const parsed = numOrNull(value);
    return parsed === null ? null : Math.abs(parsed);
  };
  const result = {
    revenue: numOrNull(revenue),
    cogs: expenseValue(cogs),
    personnel: expenseValue(personnel),
    overtime: expenseValue(overtime),
    opex: expenseValue(opex),
    other: expenseValue(other),
    otherOperating: expenseValue(other_operating),
    depreciation: expenseValue(depreciation),
    interest: expenseValue(interest),
    tax: expenseValue(tax),
  };

  const labor = sumDefined([result.personnel, result.overtime]);
  const operatingOther = sumDefined([result.otherOperating, result.other]);
  const operatingExpenses = sumDefined([result.opex, operatingOther]);
  const costs = sumDefined([result.cogs, labor, operatingExpenses]);
  result.labor = labor;
  result.grossProfit = result.revenue !== null && result.cogs !== null
    ? result.revenue - result.cogs : null;
  result.operatingExpenses = operatingExpenses;

  const ebitdaMissingBlocks = [];
  if (result.revenue === null) ebitdaMissingBlocks.push('revenue');
  if (result.cogs === null) ebitdaMissingBlocks.push('cogs');
  if (labor === null) ebitdaMissingBlocks.push('labor');
  if (result.opex === null) ebitdaMissingBlocks.push('opex');
  result.ebitdaMissingBlocks = ebitdaMissingBlocks;
  result.ebitdaPartial = ebitdaMissingBlocks.length > 0;
  // Never publish a partial sum as EBITDA. Missing inputs stay unavailable.
  result.ebitda = !result.ebitdaPartial && costs !== null
    ? result.revenue - costs : null;

  result.primeCostPercent = result.revenue !== null && labor !== null
    && result.cogs !== null && result.revenue !== 0
    ? (result.cogs + labor) / result.revenue * 100 : null;
  result.primeCostStatus = result.primeCostPercent === null ? 'missing'
    : result.primeCostPercent <= 60 ? 'normal'
      : result.primeCostPercent <= 65 ? 'attention' : 'critical';
  result.otherOperatingPercent = pctOf(operatingOther, result.revenue);
  result.otherOperatingRequiresReview = result.otherOperatingPercent !== null
    && result.otherOperatingPercent > 5;
  result.overtimePercentOfLabor = pctOf(result.overtime, labor);

  const netProfitMissingBlocks = [];
  if (result.ebitda === null) netProfitMissingBlocks.push('ebitda');
  if (result.depreciation === null) netProfitMissingBlocks.push('depreciation');
  if (result.interest === null) netProfitMissingBlocks.push('interest');
  if (result.tax === null) netProfitMissingBlocks.push('tax');
  const belowEbitda = sumDefined([result.depreciation, result.interest, result.tax]);
  result.belowEbitdaExpenses = belowEbitda;
  result.netProfitMissingBlocks = netProfitMissingBlocks;
  result.netProfitPartial = netProfitMissingBlocks.length > 0;
  result.netProfit = !result.netProfitPartial && belowEbitda !== null
    ? result.ebitda - belowEbitda : null;

  result.foodCostPercent = pctOf(result.cogs, result.revenue);
  result.personnelPercent = pctOf(labor, result.revenue);
  result.opexPercent = pctOf(operatingExpenses, result.revenue);
  result.ebitdaMargin = pctOf(result.ebitda, result.revenue);
  result.netMargin = pctOf(result.netProfit, result.revenue);
  result.formulaVersion = 'pnl-v5-complete-inputs-only';
  result.provenance = 'deterministic-backend-calculator';
  return result;
}

function calculatePnl(input = {}) {
  const result = pnl(input);
  return {
    ...result,
    foodCost: { revenue: result.revenue, cogs: result.cogs, amount: result.cogs, percent: result.foodCostPercent },
    personnelCost: { revenue: result.revenue, personnel: result.personnel, overtime: result.overtime, labor: result.labor, percent: result.personnelPercent },
    overtimeAmount: result.overtime,
    primeCost: { percent: result.primeCostPercent, status: result.primeCostStatus, formula: '(COGS + Labor) / Revenue * 100' },
    review: { otherOperatingRequiresReview: result.otherOperatingRequiresReview, otherOperatingPercent: result.otherOperatingPercent },
    margins: {
      foodCostPercent: result.foodCostPercent, personnelPercent: result.personnelPercent,
      opexPercent: result.opexPercent, ebitdaMargin: result.ebitdaMargin, netMargin: result.netMargin,
    },
  };
}

module.exports = { calculatePnl, pnl };

import type { PnlDraftRow } from './pnl';
import { canonicalArticleKey } from './financialRows';
import { calculateSignedEbitda } from './financialAnalytics';

export type PnlMetricSet = {
  revenue?: number;
  foodRevenue?: number;
  cogs?: number;
  payroll?: number;
  opex?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  /** Food Cost is only shown when food-specific revenue is explicitly available. */
  foodCostPercent?: number;
  /** COGS as a share of total revenue; reconciliation metric, not Food Cost. */
  cogsPercent?: number;
  laborCostPercent?: number;
  primeCostPercentFromInputs?: number;
  ebitda?: number;
};

function valueFor(rows: PnlDraftRow[], field: 'plan' | 'fact', aliases: string[]): number | undefined {
  const row = rows.find((item) => aliases.includes(canonicalArticleKey(item.article)));
  const value = row?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function foodRevenueFor(rows: PnlDraftRow[], field: 'plan' | 'fact'): number | undefined {
  const row = rows.find((item) => /^(?:выручка кухни|выручка от еды|выручка от кухни|food sales|kitchen revenue|food revenue)$/i.test(item.article.trim()));
  const value = row?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ratioPercent(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined || denominator <= 0) return undefined;
  const result = numerator / denominator * 100;
  return Number.isFinite(result) ? result : undefined;
}

/**
 * STEN signed P&L formulas (expenses are negative):
 * Gross profit = revenue + signed COGS.
 * Gross margin % = gross profit / total revenue * 100%.
 * Food Cost % = -signed COGS / food-only revenue * 100%; omitted without food revenue.
 * COGS share = -signed COGS / total revenue * 100%; never labelled Food Cost.
 * Labor Cost % = -signed payroll / total revenue * 100%.
 * Prime Cost % check = COGS share + Labor Cost %.
 * EBITDA = signed sum of revenue, COGS, payroll and OPEX.
 * Ratios require positive revenue. Missing inputs stay undefined; signed storno stays signed.
 */
export function calculatePnlMetrics(rows: PnlDraftRow[], field: 'plan' | 'fact'): PnlMetricSet {
  const revenue = valueFor(rows, field, ['revenue']);
  const foodRevenue = foodRevenueFor(rows, field);
  const cogs = valueFor(rows, field, ['cogs']);
  const payroll = valueFor(rows, field, ['payroll']);
  const opex = valueFor(rows, field, ['opex']);
  const grossProfit = revenue !== undefined && cogs !== undefined ? revenue + cogs : undefined;
  const grossMarginPercent = ratioPercent(grossProfit, revenue);
  const cogsPercent = ratioPercent(cogs === undefined ? undefined : -cogs, revenue);
  const foodCostPercent = ratioPercent(cogs === undefined ? undefined : -cogs, foodRevenue);
  const laborCostPercent = ratioPercent(payroll === undefined ? undefined : -payroll, revenue);
  const primeCostPercentFromInputs = cogsPercent !== undefined && laborCostPercent !== undefined
    ? cogsPercent + laborCostPercent
    : undefined;
  const ebitda = calculateSignedEbitda(revenue, cogs, payroll, opex);
  return { revenue, foodRevenue, cogs, payroll, opex, grossProfit, grossMarginPercent, foodCostPercent, cogsPercent, laborCostPercent, primeCostPercentFromInputs, ebitda };
}

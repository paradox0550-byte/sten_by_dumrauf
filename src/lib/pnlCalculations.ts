import type { PnlDraftRow } from './pnl';
import { canonicalArticleKey } from './financialRows';
import { calculateSignedEbitda } from './financialAnalytics';

export type PnlMetricSet = {
  revenue?: number;
  cogs?: number;
  payroll?: number;
  opex?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  foodCostPercent?: number;
  laborCostPercent?: number;
  ebitda?: number;
};

function valueFor(rows: PnlDraftRow[], field: 'plan' | 'fact', aliases: string[]): number | undefined {
  const row = rows.find((item) => aliases.includes(canonicalArticleKey(item.article)));
  const value = row?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ratioPercent(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined || denominator <= 0) return undefined;
  const result = numerator / denominator * 100;
  return Number.isFinite(result) ? result : undefined;
}

/**
 * Derives display metrics only when the underlying inputs are present.
 * Expense ratios use absolute cost values; the existing STEN EBITDA convention
 * expects expense rows to be signed negative. Missing inputs stay undefined.
 */
export function calculatePnlMetrics(rows: PnlDraftRow[], field: 'plan' | 'fact'): PnlMetricSet {
  const revenue = valueFor(rows, field, ['revenue']);
  const cogs = valueFor(rows, field, ['cogs']);
  const payroll = valueFor(rows, field, ['payroll']);
  const opex = valueFor(rows, field, ['opex']);
  const grossProfit = revenue !== undefined && cogs !== undefined
    ? revenue - Math.abs(cogs)
    : undefined;
  const grossMarginPercent = ratioPercent(grossProfit, revenue);
  const foodCostPercent = ratioPercent(cogs === undefined ? undefined : Math.abs(cogs), revenue);
  const laborCostPercent = ratioPercent(payroll === undefined ? undefined : Math.abs(payroll), revenue);
  const ebitda = calculateSignedEbitda(revenue, cogs, payroll, opex);

  return {
    revenue,
    cogs,
    payroll,
    opex,
    grossProfit,
    grossMarginPercent,
    foodCostPercent,
    laborCostPercent,
    ebitda,
  };
}

import { finiteNumber } from './financialAnalytics';

export type DailySalesReport = {
  date?: unknown;
  values?: unknown;
};

export type DailySalesField = 'revenue' | 'cash' | 'card' | 'discounts' | 'checks';
export type DailySalesAggregation = {
  reportCount: number;
  daysWithReports: number;
  fields: Record<DailySalesField, { total: number | undefined; reportCount: number }>;
  averageCheck: { value: number | undefined; source: 'calculated' | 'entered' | 'unavailable'; reportCount: number };
};

const KEYS: DailySalesField[] = ['revenue', 'cash', 'card', 'discounts', 'checks'];

/**
 * Sums only explicitly entered finite values for the requested month.
 * Does not interpret missing dates/fields as zero. Average check is a ratio,
 * never a sum of daily averages: revenue / checks when both are available.
 */
export function aggregateDailySalesReports(
  reports: DailySalesReport[],
  period: string,
): DailySalesAggregation {
  const totals = Object.fromEntries(KEYS.map((key) => [key, { total: 0, reportCount: 0 }])) as
    Record<DailySalesField, { total: number; reportCount: number }>;
  const dates = new Set<string>();
  let reportCount = 0;
  let enteredAverageCheckTotal = 0;
  let enteredAverageCheckCount = 0;

  for (const report of reports) {
    const date = typeof report.date === 'string' ? report.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== period) continue;
    if (!report.values || typeof report.values !== 'object' || Array.isArray(report.values)) continue;

    reportCount += 1;
    dates.add(date);
    const values = report.values as Record<string, unknown>;
    for (const key of KEYS) {
      const value = finiteNumber(values[key]);
      if (value === undefined || value < 0) continue;
      totals[key].total += value;
      totals[key].reportCount += 1;
    }
    const enteredAverage = finiteNumber(values.avgCheck);
    if (enteredAverage !== undefined && enteredAverage >= 0) {
      enteredAverageCheckTotal += enteredAverage;
      enteredAverageCheckCount += 1;
    }
  }

  const fields = Object.fromEntries(KEYS.map((key) => [
    key,
    { total: totals[key].reportCount > 0 ? totals[key].total : undefined, reportCount: totals[key].reportCount },
  ])) as DailySalesAggregation['fields'];

  const revenue = fields.revenue.total;
  const checks = fields.checks.total;
  const calculatedAverage = revenue !== undefined && checks !== undefined && checks > 0
    ? revenue / checks
    : undefined;
  const enteredAverage = enteredAverageCheckCount > 0
    ? enteredAverageCheckTotal / enteredAverageCheckCount
    : undefined;

  return {
    reportCount,
    daysWithReports: dates.size,
    fields,
    averageCheck: calculatedAverage !== undefined
      ? { value: calculatedAverage, source: 'calculated', reportCount: Math.min(fields.revenue.reportCount, fields.checks.reportCount) }
      : enteredAverage !== undefined
        ? { value: enteredAverage, source: 'entered', reportCount: enteredAverageCheckCount }
        : { value: undefined, source: 'unavailable', reportCount: 0 },
  };
}

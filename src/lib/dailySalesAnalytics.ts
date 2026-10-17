import { finiteNumber } from './financialAnalytics';

export type DailySalesReport = {
  date?: unknown;
  values?: unknown;
};

export type DailySalesField = 'revenue' | 'cash' | 'card' | 'discounts' | 'checks' | 'avgCheck';

export type DailySalesAggregation = {
  reportCount: number;
  daysWithReports: number;
  fields: Record<DailySalesField, { total: number | undefined; reportCount: number }>;
};

/**
 * Totals only explicitly entered finite values. These are sums of recorded
 * reports, not proof that every day in the month has been submitted.
 */
export function aggregateDailySalesReports(
  reports: DailySalesReport[],
  period: string,
): DailySalesAggregation {
  const keys: DailySalesField[] = ['revenue', 'cash', 'card', 'discounts', 'checks', 'avgCheck'];
  const totals = Object.fromEntries(keys.map((key) => [key, { total: 0, reportCount: 0 }])) as
    Record<DailySalesField, { total: number; reportCount: number }>;
  const dates = new Set<string>();
  let reportCount = 0;

  for (const report of reports) {
    const date = typeof report.date === 'string' ? report.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== period) continue;
    if (!report.values || typeof report.values !== 'object' || Array.isArray(report.values)) continue;

    reportCount += 1;
    dates.add(date);
    const values = report.values as Record<string, unknown>;
    for (const key of keys) {
      const value = finiteNumber(values[key]);
      if (value === undefined || value < 0) continue;
      totals[key].total += value;
      totals[key].reportCount += 1;
    }
  }

  return {
    reportCount,
    daysWithReports: dates.size,
    fields: Object.fromEntries(keys.map((key) => [
      key,
      {
        total: totals[key].reportCount > 0 ? totals[key].total : undefined,
        reportCount: totals[key].reportCount,
      },
    ])) as DailySalesAggregation['fields'],
  };
}

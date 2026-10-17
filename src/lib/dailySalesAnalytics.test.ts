import { describe, expect, it } from 'vitest';
import { aggregateDailySalesReports } from './dailySalesAnalytics';

describe('aggregateDailySalesReports', () => {
  it('aggregates only reports for the selected month and counts coverage per field', () => {
    const result = aggregateDailySalesReports([
      { date: '2026-10-01', values: { revenue: 1000, checks: 10 } },
      { date: '2026-10-01', values: { revenue: 500, cash: 200 } },
      { date: '2026-09-30', values: { revenue: 9000, checks: 90 } },
      { date: '2026-10-02', values: { revenue: null, checks: Number.NaN, card: -10 } },
    ], '2026-10');

    expect(result.reportCount).toBe(3);
    expect(result.daysWithReports).toBe(2);
    expect(result.fields.revenue).toEqual({ total: 1500, reportCount: 2 });
    expect(result.fields.checks).toEqual({ total: 10, reportCount: 1 });
    expect(result.fields.cash).toEqual({ total: 200, reportCount: 1 });
    expect(result.fields.card).toEqual({ total: undefined, reportCount: 0 });
  });

  it('does not treat absent fields or empty data as zero', () => {
    const result = aggregateDailySalesReports([
      { date: '2026-10-01', values: { revenue: '' } },
      { date: 'not-a-date', values: { revenue: 100 } },
      { date: '2026-10-03', values: null },
    ], '2026-10');

    expect(result.reportCount).toBe(1);
    expect(result.fields.revenue).toEqual({ total: undefined, reportCount: 0 });
    expect(result.fields.checks).toEqual({ total: undefined, reportCount: 0 });
  });
});

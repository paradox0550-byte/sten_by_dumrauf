import { describe, expect, it } from 'vitest';
import { aggregateDailySalesReports } from './dailySalesAnalytics';

describe('aggregateDailySalesReports', () => {
  it('aggregates only reports for the selected month and tracks field coverage', () => {
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
    expect(result.averageCheck).toEqual({ value: 150, source: 'calculated', reportCount: 1 });
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
    expect(result.averageCheck.value).toBeUndefined();
    expect(result.averageCheck.source).toBe('unavailable');
  });

  it('does not sum daily average checks; calculates a weighted monthly value', () => {
    const result = aggregateDailySalesReports([
      { date: '2026-10-01', values: { revenue: 1000, checks: 10, avgCheck: 100 } },
      { date: '2026-10-02', values: { revenue: 3000, checks: 10, avgCheck: 300 } },
    ], '2026-10');

    expect(result.averageCheck).toEqual({ value: 200, source: 'calculated', reportCount: 2 });
  });

  it('uses entered average check only when monthly revenue/checks cannot be calculated', () => {
    const result = aggregateDailySalesReports([
      { date: '2026-10-01', values: { avgCheck: 250 } },
      { date: '2026-10-02', values: { avgCheck: 350 } },
    ], '2026-10');

    expect(result.averageCheck).toEqual({ value: 300, source: 'entered', reportCount: 2 });
  });
});

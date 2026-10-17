import { describe, expect, it } from 'vitest';
import { aggregateLaborRecords, calculateSignedEbitda, safeRatioPercent } from './financialAnalytics';

describe('safeRatioPercent', () => {
  it('calculates percentages for a positive denominator', () => {
    expect(safeRatioPercent(25, 100)).toBe(25);
  });

  it('does not calculate a ratio when denominator is zero or negative', () => {
    expect(safeRatioPercent(25, 0)).toBeUndefined();
    expect(safeRatioPercent(25, -100)).toBeUndefined();
  });

  it('accepts numeric strings returned by database drivers', () => {
    expect(safeRatioPercent('25', '100')).toBe(25);
    expect(safeRatioPercent(' ', 100)).toBeUndefined();
  });

  it('rejects missing and non-finite values', () => {
    expect(safeRatioPercent(null, 100)).toBeUndefined();
    expect(safeRatioPercent(10, Number.NaN)).toBeUndefined();
    expect(safeRatioPercent(Number.POSITIVE_INFINITY, 100)).toBeUndefined();
  });
});

describe('aggregateLaborRecords', () => {
  it('aggregates valid records by department', () => {
    const result = aggregateLaborRecords([
      { department: 'Кухня', hours: 10, amount: 5000 },
      { department: 'Кухня', hours: 5, amount: 2500 },
      { department: 'Зал', hours: 8, amount: 3200 },
    ]);

    expect(result.totalHours).toBe(23);
    expect(result.totalAmount).toBe(10700);
    expect(result.incompleteCount).toBe(0);
    expect(result.groups).toEqual([
      ['Кухня', { hours: 15, amount: 7500 }],
      ['Зал', { hours: 8, amount: 3200 }],
    ]);
  });

  it('excludes partial or invalid records instead of coercing missing values to zero', () => {
    const result = aggregateLaborRecords([
      { department: 'Кухня', hours: 10, amount: 5000 },
      { department: 'Зал', hours: null, amount: 3200 },
      { department: 'Бар', hours: 4, amount: undefined },
      { department: 'Склад', hours: -1, amount: 1000 },
      { department: 'Зал', hours: Number.NaN, amount: 2000 },
    ]);

    expect(result.totalHours).toBe(10);
    expect(result.totalAmount).toBe(5000);
    expect(result.incompleteCount).toBe(4);
    expect(result.validRecordCount).toBe(1);
    expect(result.groups).toEqual([['Кухня', { hours: 10, amount: 5000 }]]);
  });

  it('returns undefined totals when no complete records exist', () => {
    const result = aggregateLaborRecords([{ hours: null, amount: 100 }]);
    expect(result.totalHours).toBeUndefined();
    expect(result.totalAmount).toBeUndefined();
    expect(result.incompleteCount).toBe(1);
  });
});

describe('calculateSignedEbitda', () => {
  it('sums signed expense rows without subtracting negative expenses twice', () => {
    expect(calculateSignedEbitda(1000000, -300000, -200000, -100000)).toBe(400000);
  });

  it('keeps EBITDA unavailable when any required component is missing', () => {
    expect(calculateSignedEbitda(1000000, -300000, null, -100000)).toBeUndefined();
  });
});

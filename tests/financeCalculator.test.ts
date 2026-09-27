import { describe, expect, it } from 'vitest';
import { aggregateFinance, calculateFinance } from '../src/lib/financeCalculator';

describe('finance domain', () => {
  it('calculates the canonical P&L chain without inventing missing values', () => {
    const result = calculateFinance({
      revenue: 1_000_000,
      cogs: 300_000,
      payroll: 250_000,
      opex: 200_000,
      depreciation: 50_000,
      interest: 20_000,
      tax: 30_000,
      other: 0,
    });

    expect(result.grossProfit).toBe(700_000);
    expect(result.primeCost).toBe(550_000);
    expect(result.ebitda).toBe(250_000);
    expect(result.netProfit).toBe(150_000);
    expect(result.foodCostPct).toBe(30);
    expect(result.laborCostPct).toBe(25);
    expect(result.primeCostPct).toBe(55);
    expect(result.ebitdaMargin).toBe(25);
    expect(result.netMargin).toBe(15);
    expect(result.validationIssues.some(issue => issue.type === 'missing_data')).toBe(false);
  });

  it('keeps derived metrics undefined when a critical source value is missing', () => {
    const result = calculateFinance({ revenue: 500_000, cogs: 150_000 });

    expect(result.grossProfit).toBe(350_000);
    expect(result.primeCost).toBeUndefined();
    expect(result.ebitda).toBeUndefined();
    expect(result.netProfit).toBeUndefined();
    expect(result.primeCostPct).toBeUndefined();
    expect(result.validationIssues.some(issue => issue.type === 'missing_data')).toBe(true);
  });

  it('aggregates numeric breakdowns without turning missing entries into zero', () => {
    const result = aggregateFinance([
      { revenue: 100_000, cogs: 30_000, cogsBreakdown: { food: 20_000 } },
      { revenue: 200_000, cogs: 60_000, cogsBreakdown: { food: 10_000, beverage: 5_000 } },
    ]);

    expect(result.revenue).toBe(300_000);
    expect(result.cogs).toBe(90_000);
    expect(result.cogsBreakdown).toEqual({ food: 30_000, beverage: 5_000 });
  });
});

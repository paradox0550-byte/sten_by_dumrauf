import { describe, expect, it } from 'vitest';
import { calculatePnlMetrics } from './pnlCalculations';
import type { PnlDraftRow } from './pnl';

const rows: PnlDraftRow[] = [
  { id: 'revenue', article: 'Выручка', plan: 10_000_000, fact: 9_000_000 },
  { id: 'cogs', article: 'Себестоимость', plan: -2_800_000, fact: -2_700_000 },
  { id: 'payroll', article: 'ФОТ', plan: -3_000_000, fact: -2_900_000 },
  { id: 'opex', article: 'OPEX', plan: -1_000_000, fact: -950_000 },
];

describe('calculatePnlMetrics', () => {
  it('calculates gross profit and percentages from known plan inputs', () => {
    const result = calculatePnlMetrics(rows, 'plan');
    expect(result.grossProfit).toBe(7_200_000);
    expect(result.grossMarginPercent).toBeCloseTo(72);
    expect(result.foodCostPercent).toBeCloseTo(28);
    expect(result.laborCostPercent).toBeCloseTo(30);
    expect(result.ebitda).toBe(3_200_000);
  });

  it('calculates fact metrics independently from plan', () => {
    const result = calculatePnlMetrics(rows, 'fact');
    expect(result.grossProfit).toBe(6_300_000);
    expect(result.foodCostPercent).toBeCloseTo(30);
    expect(result.laborCostPercent).toBeCloseTo(32.2222222);
    expect(result.ebitda).toBe(2_450_000);
  });

  it('keeps derived values missing when inputs are missing or revenue is not positive', () => {
    expect(calculatePnlMetrics([{ id: 'revenue', article: 'Выручка', plan: 0 }], 'plan').foodCostPercent).toBeUndefined();
    expect(calculatePnlMetrics([{ id: 'revenue', article: 'Выручка', plan: 100 }], 'plan').grossProfit).toBeUndefined();
    expect(calculatePnlMetrics([{ id: 'cogs', article: 'Себестоимость', plan: -20 }], 'plan').foodCostPercent).toBeUndefined();
  });
});

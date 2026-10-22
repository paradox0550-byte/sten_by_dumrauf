import { describe, expect, it } from 'vitest';
import { calculatePnlMetrics } from './pnlCalculations';
import type { PnlDraftRow } from './pnl';

const rows: PnlDraftRow[] = [
  { id: 'revenue', article: 'Выручка', plan: 10_000_000, fact: 9_000_000 },
  { id: 'food-revenue', article: 'Выручка кухни', plan: 7_000_000, fact: 6_000_000 },
  { id: 'cogs', article: 'Себестоимость', plan: -2_800_000, fact: -2_700_000 },
  { id: 'food-cogs', article: 'Себестоимость кухни', plan: -2_800_000, fact: -2_700_000 },
  { id: 'payroll', article: 'ФОТ', plan: -3_000_000, fact: -2_900_000 },
  { id: 'opex', article: 'OPEX', plan: -1_000_000, fact: -950_000 },
];

describe('calculatePnlMetrics', () => {
  it('calculates gross profit, food-only cost and percentages from known inputs', () => {
    const result = calculatePnlMetrics(rows, 'plan');
    expect(result.grossProfit).toBe(7_200_000);
    expect(result.grossMarginPercent).toBeCloseTo(72);
    expect(result.foodCostPercent).toBeCloseTo(40);
    expect(result.cogsPercent).toBeCloseTo(28);
    expect(result.laborCostPercent).toBeCloseTo(30);
    expect(result.primeCostPercentFromInputs).toBeCloseTo(58);
    expect(result.ebitda).toBe(3_200_000);
  });

  it('calculates fact metrics independently from plan', () => {
    const result = calculatePnlMetrics(rows, 'fact');
    expect(result.grossProfit).toBe(6_300_000);
    expect(result.foodCostPercent).toBeCloseTo(45);
    expect(result.cogsPercent).toBeCloseTo(30);
    expect(result.laborCostPercent).toBeCloseTo(32.2222222);
    expect(result.ebitda).toBe(2_450_000);
  });

  it('does not label COGS over total revenue as Food Cost when food revenue is missing', () => {
    const result = calculatePnlMetrics(rows.filter((row) => row.article !== 'Выручка кухни'), 'plan');
    expect(result.foodCostPercent).toBeUndefined();
    expect(result.cogsPercent).toBeCloseTo(28);
  });

  it('does not calculate Food Cost without food-specific COGS', () => {
    const result = calculatePnlMetrics(rows.filter((row) => row.article !== 'Себестоимость кухни'), 'plan');
    expect(result.foodCostPercent).toBeUndefined();
  });

  it('permits negative gross profit when signed cost exceeds revenue', () => {
    const result = calculatePnlMetrics([
      { id: 'revenue', article: 'Выручка', plan: 100 },
      { id: 'cogs', article: 'Себестоимость', plan: -150 },
    ], 'plan');
    expect(result.grossProfit).toBe(-50);
    expect(result.grossMarginPercent).toBeCloseTo(-50);
    expect(result.cogsPercent).toBeCloseTo(150);
  });

  it('preserves positive signed COGS storno as a negative cost share', () => {
    const result = calculatePnlMetrics([
      { id: 'revenue', article: 'Выручка', plan: 100 },
      { id: 'cogs', article: 'Себестоимость', plan: 20 },
    ], 'plan');
    expect(result.grossProfit).toBe(120);
    expect(result.cogsPercent).toBeCloseTo(-20);
  });

  it('keeps ratios missing for zero/negative revenue and missing inputs', () => {
    expect(calculatePnlMetrics([{ id: 'revenue', article: 'Выручка', plan: 0 }], 'plan').foodCostPercent).toBeUndefined();
    expect(calculatePnlMetrics([{ id: 'revenue', article: 'Выручка', plan: -100 }, { id: 'cogs', article: 'Себестоимость', plan: -20 }], 'plan').cogsPercent).toBeUndefined();
    expect(calculatePnlMetrics([{ id: 'revenue', article: 'Выручка', plan: 100 }], 'plan').grossProfit).toBeUndefined();
    expect(calculatePnlMetrics([{ id: 'cogs', article: 'Себестоимость', plan: -20 }], 'plan').foodCostPercent).toBeUndefined();
  });
});

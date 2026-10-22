import { describe, expect, it } from 'vitest';
import type { PnlDraftRow } from '../../../lib/pnl';
import { calculateClassifiedPlData } from './usePlCalculations';
import { classifyExpense } from '../constants/expenseClassification';

const row = (id: string, article: string, plan?: number | null, fact?: number | null): PnlDraftRow =>
  ({ id, article, plan: plan ?? undefined, fact: fact ?? undefined });

describe('expense classification', () => {
  it('classifies known keywords and leaves ambiguous articles unknown', () => {
    expect(classifyExpense('Аренда помещения')).toBe('uncontrollable');
    expect(classifyExpense('Продукты кухни')).toBe('controllable');
    expect(classifyExpense('Услуги подрядчика')).toBe('unknown');
  });

  it('lets an explicit ID override win over the keyword mapping', () => {
    expect(classifyExpense('Аренда помещения', 'rent-1', { 'rent-1': 'controllable' })).toBe('controllable');
  });

  it('can infer a known category from a normalized article ID when the name is generic', () => {
    expect(classifyExpense('Прочие расходы', 'marketing-expense')).toBe('controllable');
  });

  it('does not calculate controllable profit when an unknown expense exists', () => {
    const result = calculateClassifiedPlData([
      row('rev', 'Выручка', 1000, 1200),
      row('cogs', 'Себестоимость', -250, -300),
      row('payroll', 'ФОТ', -200, -220),
      row('marketing', 'Маркетинг', -50, -60),
      row('other', 'Услуги подрядчика', -20, -25),
    ]);
    expect(result.controllableProfit.plan).toBeUndefined();
    expect(result.hasUnclassifiedArticles).toBe(true);
  });

  it('does not split an aggregate OPEX row or double-count detail rows', () => {
    const result = calculateClassifiedPlData([
      row('rev', 'Выручка', 1000, 1200),
      row('cogs', 'Себестоимость', -250, -300),
      row('payroll', 'ФОТ', -200, -220),
      row('opex', 'OPEX', -100, -120),
      row('marketing', 'Маркетинг', -50, -60),
    ]);
    expect(result.hasAggregateOpex).toBe(true);
    expect(result.controllableProfit.fact).toBeUndefined();
  });

  it('keeps missing inputs missing rather than treating them as zero', () => {
    const result = calculateClassifiedPlData([
      row('rev', 'Выручка', 1000, null),
      row('cogs', 'Себестоимость', -250, -300),
      row('payroll', 'ФОТ', -200, -220),
      row('marketing', 'Маркетинг', -50, -60),
    ]);
    expect(result.controllableProfit.plan).toBe(500);
    expect(result.controllableProfit.fact).toBeUndefined();
  });

  it('calculates profit using STEN signed expense values', () => {
    const result = calculateClassifiedPlData([
      row('rev', 'Выручка', 1000, 1200),
      row('cogs', 'Себестоимость', -250, -300),
      row('payroll', 'ФОТ', -200, -220),
      row('marketing', 'Маркетинг', -50, -60),
    ]);
    expect(result.controllableProfit.plan).toBe(500);
    expect(result.controllableProfit.fact).toBe(620);
    expect(result.controllableMargin.fact).toBeCloseTo(51.6667);
  });

  it('allows a zero controllable OPEX subtotal when all detailed expenses are classified as uncontrollable', () => {
    const result = calculateClassifiedPlData([
      row('rev', 'Выручка', 1000, 1200),
      row('cogs', 'Себестоимость', -250, -300),
      row('payroll', 'ФОТ', -200, -220),
      row('rent', 'Аренда помещения', -50, -60),
    ]);
    expect(result.controllableOpex.plan).toBe(0);
    expect(result.controllableProfit.plan).toBe(550);
    expect(result.canCalculateControllableProfit).toBe(true);
  });
});

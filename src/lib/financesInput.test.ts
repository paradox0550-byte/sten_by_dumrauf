import { describe, expect, it } from 'vitest';
import { calculateFinance } from './financeCalculator';
import { buildFinanceInput } from './financesInput';

describe('buildFinanceInput', () => {
  it('normalizes signed P&L expenses for the subtractive finance calculator', () => {
    const input = buildFinanceInput([
      { article: 'Выручка', fact: 100_000, plan: 120_000 },
      { article: 'Себестоимость', fact: -30_000, plan: -32_000 },
      { article: 'ФОТ', fact: -20_000, plan: -22_000 },
      { article: 'OPEX', fact: -10_000, plan: -11_000 },
      { article: 'Амортизация', fact: -2_000, plan: -2_000 },
      { article: 'Проценты', fact: -1_000, plan: -1_000 },
      { article: 'Налоги', fact: -3_000, plan: -3_000 },
      { article: 'Прочее', fact: -500, plan: -500 },
    ], true);

    expect(input).toMatchObject({
      revenue: 100_000,
      cogs: 30_000,
      payroll: 20_000,
      opex: 10_000,
      depreciation: 2_000,
      interest: 1_000,
      tax: 3_000,
      other: 500,
    });
    expect(calculateFinance(input).ebitda).toBe(40_000);
  });

  it('prefers canonical totals over similarly named detail rows regardless of row order', () => {
    const input = buildFinanceInput([
      { article: 'Прочие операционные', fact: -1_200 },
      { article: 'Расходы на персонал (не ФОТ)', fact: -4_000 },
      { article: 'Аренда', fact: -15_000 },
      { article: 'ФОТ (оклад + премии + отпуск)', fact: -24_000 },
      { article: 'OPEX (без ФОТ)', fact: -18_000 },
      { article: 'Себестоимость итого', fact: -32_000 },
      { article: 'Выручка итого', fact: 100_000 },
      { article: 'Прочее', fact: -700 },
    ], true);

    expect(input.revenue).toBe(100_000);
    expect(input.cogs).toBe(32_000);
    expect(input.payroll).toBe(24_000);
    expect(input.opex).toBe(18_000);
    expect(input.other).toBe(700);
  });

  it('does not mistake rent or an OPEX detail row for aggregate OPEX', () => {
    const input = buildFinanceInput([
      { article: 'Аренда', fact: -15_000 },
      { article: 'Прочие операционные', fact: -1_200 },
    ], true);

    expect(input.opex).toBeUndefined();
  });

  it('does not replace missing or non-finite values with zero', () => {
    const input = buildFinanceInput([
      { article: 'Выручка', fact: 100_000 },
      { article: 'Себестоимость', fact: null },
      { article: 'ФОТ', fact: Number.NaN },
    ], true);

    expect(input.revenue).toBe(100_000);
    expect(input.cogs).toBeUndefined();
    expect(input.payroll).toBeUndefined();
    expect(input.opex).toBeUndefined();
    expect(calculateFinance(input).ebitda).toBeUndefined();
  });

  it('keeps plan and fact isolated', () => {
    const input = buildFinanceInput([
      { article: 'Выручка', plan: 120_000, fact: 100_000 },
      { article: 'Себестоимость', plan: -36_000, fact: -30_000 },
    ], false);
    expect(input.revenue).toBe(120_000);
    expect(input.cogs).toBe(36_000);
  });
});

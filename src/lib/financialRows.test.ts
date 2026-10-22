import { describe, expect, it } from 'vitest';
import { aggregateFinancialRows, isDerivedPnlArticle } from './financialRows';

describe('aggregateFinancialRows', () => {
  it('sums duplicate canonical articles when plan and fact are present', () => {
    expect(aggregateFinancialRows([
      { article: 'Выручка', plan: 100, fact: 110 },
      { article: 'revenue', plan: 200, fact: 210 },
    ])).toEqual([
      { article: 'Выручка', plan: 300, fact: 320, source: undefined },
    ]);
  });

  it('does not turn missing plan or fact into zero while aggregating duplicates', () => {
    expect(aggregateFinancialRows([
      { article: 'Выручка', plan: 100, fact: 110 },
      { article: 'revenue', plan: null, fact: 90 },
    ])).toEqual([
      { article: 'Выручка', plan: null, fact: 200, source: undefined },
    ]);

    expect(aggregateFinancialRows([
      { article: 'COGS', plan: -30, fact: -25 },
      { article: 'себестоимость', plan: -35, fact: null },
    ])).toEqual([
      { article: 'Себестоимость', plan: -65, fact: null, source: undefined },
    ]);
  });
});


describe('isDerivedPnlArticle', () => {
  it('marks calculated financial totals as read-only', () => {
    expect(isDerivedPnlArticle('Валовая прибыль')).toBe(true);
    expect(isDerivedPnlArticle(' EBITDA ')).toBe(true);
    expect(isDerivedPnlArticle('Контролируемая прибыль')).toBe(true);
    expect(isDerivedPnlArticle('Чистая прибыль')).toBe(true);
  });

  it('leaves ordinary expense inputs editable', () => {
    expect(isDerivedPnlArticle('Аренда')).toBe(false);
    expect(isDerivedPnlArticle('Маркетинг')).toBe(false);
  });
});

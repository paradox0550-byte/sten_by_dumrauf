import { describe, expect, it } from 'vitest';
import { isPnlExpenseArticle, pnlDeltaTone } from './pnlPresentation';

describe('P&L presentation semantics', () => {
  it('treats common expense articles as expenses', () => {
    expect(isPnlExpenseArticle('ФОТ')).toBe(true);
    expect(isPnlExpenseArticle('Аренда')).toBe(true);
    expect(isPnlExpenseArticle('Налоги')).toBe(true);
    expect(isPnlExpenseArticle('Коммунальные расходы')).toBe(true);
  });

  it('colors savings and overruns according to article semantics', () => {
    expect(pnlDeltaTone('ФОТ', -100)).toBe('is-positive');
    expect(pnlDeltaTone('Аренда', 100)).toBe('is-negative');
    expect(pnlDeltaTone('Выручка', 100)).toBe('is-positive');
    expect(pnlDeltaTone('EBITDA', -100)).toBe('is-negative');
    expect(pnlDeltaTone('Net Profit', 100)).toBe('is-positive');
  });

  it('keeps missing and neutral deltas uncolored', () => {
    expect(pnlDeltaTone('ФОТ', null)).toBe('');
    expect(pnlDeltaTone('Выручка', undefined)).toBe('');
    expect(pnlDeltaTone('Выручка', 0)).toBe('');
  });
});

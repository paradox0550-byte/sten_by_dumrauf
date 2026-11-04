import { describe, expect, it } from 'vitest';
import { classifyArticleType } from './articleClassifier';
import { normalizeArticle } from './normalize';

describe('article classification', () => {
  it('recognizes revenue and expense labels using Russian ё/е normalization', () => {
    expect(classifyArticleType('Выручка ресторана')).toBe('revenue');
    expect(classifyArticleType('Емкость холодильника')).toBe('unknown');
    expect(classifyArticleType('Ёмкость и себестоимость')).toBe('expense');
    expect(classifyArticleType('Операционные расходы')).toBe('expense');
  });
  it('normalizes equivalent article labels', () => {
    expect(normalizeArticle('  Ёмкость   кухни ')).toBe(normalizeArticle('емкость кухни'));
  });
  it('does not force unknown labels into a financial category', () => {
    expect(classifyArticleType('Комментарий управляющего')).toBe('unknown');
  });
});

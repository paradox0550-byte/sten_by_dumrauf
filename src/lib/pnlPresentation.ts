export type PnlDeltaTone = 'is-positive' | 'is-negative' | '';

const EXPENSE_TERMS = [
  'cogs', 'food cost', 'foodcost', 'payroll', 'labor', 'labour', 'opex', 'rent',
  'tax', 'depreciation', 'interest', 'utilities', 'marketing', 'repair', 'waste',
  'expense', 'cost', 'spend', 'расход', 'затрат', 'себестоим', 'рецепт', 'фот',
  'персонал', 'аренд', 'налог', 'амортизац', 'процент', 'коммунал', 'маркетинг',
  'ремонт', 'брак', 'списан', 'закуп', 'продукт', 'неконтролируем',
];

export function isPnlExpenseArticle(article: string): boolean {
  const normalized = String(article || '').toLocaleLowerCase('ru-RU');
  return EXPENSE_TERMS.some((term) => normalized.includes(term));
}

export function pnlDeltaTone(article: string, delta?: number | null): PnlDeltaTone {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return '';
  const favorable = delta > 0;
  return favorable ? 'is-positive' : 'is-negative';
}

import { normalizeArticle } from './normalize';

export type ArticleType = 'revenue' | 'expense' | 'unknown';

export function classifyArticleType(article: string): ArticleType {
  const value = normalizeArticle(article);
  if (/выруч|revenue|sales|оборот|доход от продаж/.test(value)) return 'revenue';
  if (/cogs|food.?cost|себестоим|фот|фонд оплаты|зарплат|payroll|personnel|labor|opex|операцион|аренд|коммунал|маркетинг|ремонт|расход|затрат|налог|амортизац|процент|прочие расходы/.test(value)) return 'expense';
  return 'unknown';
}

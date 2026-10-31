import type { FinanceInput } from './financeCalculator';

export type FinanceRow = {
  article: string;
  key?: string;
  label?: string;
  plan?: number | null;
  fact?: number | null;
  source?: string;
};

const articleText = (row: FinanceRow) =>
  String(row.article || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');

const exactOrStartsWith = (rows: FinanceRow[], labels: string[]) => {
  for (const label of labels) {
    const match = rows.find((row) => {
      const article = articleText(row);
      return article === label || article.startsWith(`${label} (`);
    });
    if (match) return match;
  }
  return undefined;
};

const includesAny = (rows: FinanceRow[], keys: string[], exclude: string[] = []) =>
  rows.find((row) => {
    const article = articleText(row);
    return keys.some((key) => article.includes(key)) &&
      !exclude.some((key) => article.includes(key));
  });

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * /api/pnl rows follow STEN's signed P&L convention: revenue is positive,
 * expense lines are negative. financeCalculator expects positive expense inputs
 * because it subtracts them, so normalize expenses at this UI boundary only.
 * Missing/non-finite values stay missing; they are never converted to zero.
 *
 * Prefer canonical aggregate rows over detail rows. In particular, the payroll
 * alias "персонал" must not match "Расходы на персонал (не ФОТ)", and OPEX must
 * never fall back to rent or a single "Прочие операционные" detail line.
 */
export function buildFinanceInput(rows: FinanceRow[], useFact: boolean): FinanceInput {
  const choose = (keys: string[], preferred: string[] = [], exclude: string[] = []) =>
    exactOrStartsWith(rows, preferred) ?? includesAny(rows, keys, exclude);

  const categoryValue = (category: string): { found: boolean; value: number | undefined } => {
    const matches = rows.filter(row => row.key === category);
    if (!matches.length) return { found: false, value: undefined };
    const values = matches.map(row => row[useFact ? 'fact' : 'plan']);
    if (values.some(value => !finite(value))) return { found: true, value: undefined };
    return { found: true, value: (values as number[]).reduce((sum, value) => sum + value, 0) };
  };
  const value = (category: string, keys: string[], preferred: string[] = [], exclude: string[] = []): number | undefined => {
    const mapped = categoryValue(category);
    if (mapped.found) return mapped.value;
    const raw = choose(keys, preferred, exclude)?.[useFact ? 'fact' : 'plan'];
    return finite(raw) ? raw : undefined;
  };
  const expense = (category: string, keys: string[], preferred: string[] = [], exclude: string[] = []): number | undefined => {
    const raw = value(category, keys, preferred, exclude);
    return raw === undefined ? undefined : Math.abs(raw);
  };

  return {
    revenue: value('revenue', ['выруч', 'revenue'], ['выручка итого', 'revenue']),
    cogs: expense('cogs', ['себесто', 'cogs', 'фудкост'], ['себестоимость итого', 'cogs', 'фудкост']),
    payroll: expense('payroll', ['фот', 'payroll', 'зарплат'], ['фот', 'payroll'], ['не фот']),
    opex: expense('opex', ['opex', 'операцион'], ['opex (без фот)', 'opex'], ['аренд', 'прочие операционные']),
    depreciation: expense('depreciation', ['амортиза', 'depreciation']),
    interest: expense('interest', ['процент', 'interest']),
    tax: expense('tax', ['налог', 'tax']),
    other: expense('other', ['проч', 'other'], ['прочее', 'other'], ['операцион']),
  };
}

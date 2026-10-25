import type { FinanceInput } from './financeCalculator';

export type FinanceRow = {
  article: string;
  plan?: number | null;
  fact?: number | null;
  source?: string;
};

const find = (rows: FinanceRow[], keys: string[]) =>
  rows.find((row) => keys.some((key) => String(row.article || '').toLocaleLowerCase('ru-RU').includes(key)));

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * /api/pnl rows follow STEN's signed P&L convention: revenue is positive,
 * expense lines are negative. financeCalculator expects positive expense inputs
 * because it subtracts them, so normalize expenses at this UI boundary only.
 * Missing/non-finite values stay missing; they are never converted to zero.
 */
export function buildFinanceInput(rows: FinanceRow[], useFact: boolean): FinanceInput {
  const value = (keys: string[]): number | undefined => {
    const raw = find(rows, keys)?.[useFact ? 'fact' : 'plan'];
    return finite(raw) ? raw : undefined;
  };
  const expense = (keys: string[]): number | undefined => {
    const raw = value(keys);
    return raw === undefined ? undefined : Math.abs(raw);
  };

  return {
    revenue: value(['выруч', 'revenue']),
    cogs: expense(['себесто', 'cogs', 'фудкост']),
    payroll: expense(['фот', 'зарплат', 'персон', 'personnel']),
    opex: expense(['opex', 'операцион', 'аренд']),
    depreciation: expense(['амортиза', 'depreciation']),
    interest: expense(['процент', 'interest']),
    tax: expense(['налог', 'tax']),
    other: expense(['проч', 'other']),
  };
}

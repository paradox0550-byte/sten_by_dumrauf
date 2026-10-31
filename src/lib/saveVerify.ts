/* Контракт сохранения (правило продукта №5): запись считается сохранённой
   ТОЛЬКО после повторного чтения с сервера и совпадения значений.
   Сравниваются article/plan/fact в порядке строк; null и undefined равны
   («нет данных» — это тоже состояние, отличное от 0). */
import { api } from './api';
import { Scope, scopeQuery } from './scope';
import { PnlWriteSchema, type PnlWriteRequest } from './contracts/pnl';

export interface ComparableRow {
  article: string;
  key?: string;
  label?: string;
  source?: string | null;
  plan?: number | null;
  fact?: number | null;
}

const norm = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const normalizedArticle = (value: string) => {
  const text = value.normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/[–—-]+/g, ' ').replace(/\s+/g, ' ');
  const aliases: Record<string, string> = { revenue: 'revenue', выручка: 'revenue', cogs: 'cogs', себестоимость: 'cogs', payroll: 'payroll', personnel: 'payroll', фот: 'payroll', opex: 'opex', 'операционные расходы': 'opex', 'операционные затраты': 'opex', depreciation: 'depreciation', амортизация: 'depreciation', interest: 'interest', проценты: 'interest', tax: 'tax', налоги: 'tax', other: 'other', прочее: 'other' };
  return aliases[text] || text;
};
function comparableMap(rows: ComparableRow[]) {
  const grouped = new Map<string, { article: string; key: string; plan: number | null; fact: number | null; planMissing: boolean; factMissing: boolean; planSeen: boolean; factSeen: boolean }>();
  for (const row of rows) {
    const article = normalizedArticle(String(row.article ?? ''));
    const key = String(row.key || normalizedArticle(String(row.article ?? '')));
    const composite = key + '|' + article;
    const current = grouped.get(composite) ?? { article, key, plan: null, fact: null, planMissing: false, factMissing: false, planSeen: false, factSeen: false };
    if (norm(row.plan) === null) current.planMissing = true;
    else { current.plan = (current.plan ?? 0) + norm(row.plan)!; current.planSeen = true; }
    if (norm(row.fact) === null) current.factMissing = true;
    else { current.fact = (current.fact ?? 0) + norm(row.fact)!; current.factSeen = true; }
    grouped.set(composite, current);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => ({
    key,
    article: row.article,
    plan: row.planMissing || !row.planSeen ? null : row.plan,
    fact: row.factMissing || !row.factSeen ? null : row.fact,
  }));
}
export function rowsMatch(expected: ComparableRow[], actual: ComparableRow[]): boolean {
  if (!Array.isArray(actual)) return false;
  const left = comparableMap(expected);
  const right = comparableMap(actual);
  if (left.length !== right.length) return false;
  return left.every((row, index) => row.key === right[index].key
    && row.article === right[index].article
    && row.plan === right[index].plan
    && row.fact === right[index].fact);
}

export type PnlWriteResult =
  | { ok: true; confirmed: true; message: string }
  | { ok: false; message: string };

interface PnlWriteResponse {
  saved?: boolean;
  confirmed?: boolean;
  count?: number;
  period?: string;
}

/** Полный финансовый цикл записи: input → API → DB → save → re-read → compare → подтверждение UI. */
export async function writePnlAndVerify(scope: Scope, rows: ComparableRow[]): Promise<PnlWriteResult> {
  try {
    const body: PnlWriteRequest = {
      period: scope.period,
      project_id: scope.projectId ?? null,
      branch_id: scope.branchId ?? null,
      restaurant_id: scope.restaurantId ?? null,
      department_id: scope.departmentId ?? null,
      rows: rows.map(r => ({
        article: r.article,
        key: r.key,
        label: r.label,
        source: r.source ?? null,
        plan: r.plan ?? null,
        fact: r.fact ?? null,
      })),
    };
    const res = await api.post<PnlWriteResponse>('/api/pnl', PnlWriteSchema.parse(body));
    if ((res?.confirmed ?? res?.saved) !== true) {
      return { ok: false, message: 'Сервер не вернул подтверждение записи (confirmed ≠ true). Черновик НЕ считается сохранённым.' };
    }
    // Обязательное повторное чтение той же области.
    const read = await api.get<{ rows?: ComparableRow[] }>('/api/pnl?' + scopeQuery(scope));
    const saved: ComparableRow[] = Array.isArray(read?.rows) ? read.rows : [];
    if (!rowsMatch(rows, saved)) {
      return { ok: false, message: 'Повторное чтение с сервера не подтвердило сохранение: строки P&L не совпали. Не считайте эти данные сохранёнными.' };
    }
    return { ok: true, confirmed: true, message: 'Сохранено сервером и подтверждено повторным чтением выбранной области.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? e.message : 'Сервер отклонил запись. Черновик не сохранён.' };
  }
}
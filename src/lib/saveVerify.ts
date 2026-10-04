/* Контракт сохранения (правило продукта №5): запись считается сохранённой
   ТОЛЬКО после повторного чтения с сервера и совпадения значений.
   Сравниваются article/plan/fact в порядке строк; null и undefined равны
   («нет данных» — это тоже состояние, отличное от 0). */
import { api } from './api';
import { Scope, scopeQuery } from './scope';
import { PnlWriteSchema, type PnlWriteRequest } from './contracts/pnl';

export interface ComparableRow {
  article: string;
  plan?: number | null;
  fact?: number | null;
}

const norm = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function rowsMatch(expected: ComparableRow[], actual: ComparableRow[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return expected.every((e, i) => {
    const a = actual[i] as Partial<ComparableRow> | undefined;
    return !!a && String(a.article ?? '') === String(e.article ?? '')
      && norm(a.plan) === norm(e.plan ?? null)
      && norm(a.fact) === norm(e.fact ?? null);
  });
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
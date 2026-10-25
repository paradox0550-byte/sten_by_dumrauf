import type { Scope } from './scope';
import { scopeKey } from './scope';

export type AnalyticsActionStatus = 'recommended' | 'accepted' | 'confirmed';
export type AnalyticsAction = {
  status: AnalyticsActionStatus;
  note: string;
  responsible?: string;
  dueDate?: string;
};
export type AnalyticsActionStates = Record<string, AnalyticsAction>;

export function analyticsActionStorageKey(scope: Scope): string {
  return `sten_analytics_actions_v1:${encodeURIComponent(scopeKey(scope))}`;
}

export function readAnalyticsActionStates(
  scope: Scope,
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): AnalyticsActionStates {
  if (!storage) return {};
  try {
    const raw = storage.getItem(analyticsActionStorageKey(scope));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: AnalyticsActionStates = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as Partial<AnalyticsAction>;
      if (
        (candidate.status === 'recommended' || candidate.status === 'accepted' || candidate.status === 'confirmed') &&
        typeof candidate.note === 'string'
      ) {
        const responsible = typeof candidate.responsible === 'string' ? candidate.responsible.slice(0, 120) : undefined;
        const dueDate = typeof candidate.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.dueDate) ? candidate.dueDate : undefined;
        result[key] = { status: candidate.status, note: candidate.note.slice(0, 1000), ...(responsible ? { responsible } : {}), ...(dueDate ? { dueDate } : {}) };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeAnalyticsActionStates(
  scope: Scope,
  states: AnalyticsActionStates,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(analyticsActionStorageKey(scope), JSON.stringify(states));
    return true;
  } catch {
    return false;
  }
}

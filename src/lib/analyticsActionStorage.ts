import type { Scope } from './scope';
import { scopeKey } from './scope';

export type AnalyticsActionStatus = 'recommended' | 'accepted' | 'confirmed';
export type AnalyticsAction = {
  status: AnalyticsActionStatus;
  note: string;
  responsible?: string;
  dueDate?: string;
  /** Snapshot of the adverse plan/fact deviation when the action is accepted. */
  initialImpact?: number;
  /** Period and exact P&L article label used for the baseline snapshot. */
  initialImpactPeriod?: string;
  initialImpactArticle?: string;
  /** User-entered realized effect; not independently verified by STEN. */
  resultAmount?: number;
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
        const initialImpact = typeof candidate.initialImpact === 'number' && Number.isFinite(candidate.initialImpact) && candidate.initialImpact >= 0 ? candidate.initialImpact : undefined;
        const initialImpactPeriod = typeof candidate.initialImpactPeriod === 'string' && /^\\d{4}-\\d{2}$/.test(candidate.initialImpactPeriod) ? candidate.initialImpactPeriod : undefined;
        const initialImpactArticle = typeof candidate.initialImpactArticle === 'string' ? candidate.initialImpactArticle.slice(0, 200) : undefined;
        const resultAmount = typeof candidate.resultAmount === 'number' && Number.isFinite(candidate.resultAmount) && candidate.resultAmount >= 0 ? candidate.resultAmount : undefined;
        result[key] = { status: candidate.status, note: candidate.note.slice(0, 1000), ...(responsible ? { responsible } : {}), ...(dueDate ? { dueDate } : {}), ...(initialImpact !== undefined ? { initialImpact } : {}), ...(initialImpactPeriod ? { initialImpactPeriod } : {}), ...(initialImpactArticle ? { initialImpactArticle } : {}), ...(resultAmount !== undefined ? { resultAmount } : {}) };
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
export function isAnalyticsActionOverdue(
  action: Pick<AnalyticsAction, 'status' | 'dueDate'>,
  today: string,
): boolean {
  return action.status === 'accepted' && Boolean(action.dueDate) && action.dueDate! < today;
}


export type AnalyticsActionReconciliationStatus = 'insufficient_data' | 'improved' | 'unchanged' | 'worsened';
export type AnalyticsActionReconciliation = { status: AnalyticsActionReconciliationStatus; currentExposure?: number; change?: number };

/** Compare baseline and latest adverse deviation for the same article, period and scope. This does not prove causality. */
export function reconcileAnalyticsActionImpact(
  initialImpact: number | undefined,
  currentImpact: number | undefined,
  hasComparableData: boolean,
  baselinePeriod?: string,
  currentPeriod?: string,
  baselineArticle?: string,
  currentArticle?: string,
): AnalyticsActionReconciliation {
  const samePeriod = Boolean(baselinePeriod && currentPeriod && baselinePeriod === currentPeriod);
  const sameArticle = Boolean(baselineArticle && currentArticle && baselineArticle.trim().toLocaleLowerCase('ru-RU') === currentArticle.trim().toLocaleLowerCase('ru-RU'));
  if (!hasComparableData || !samePeriod || !sameArticle || initialImpact === undefined || !Number.isFinite(initialImpact) || initialImpact < 0 || currentImpact === undefined || !Number.isFinite(currentImpact)) return { status: 'insufficient_data' };
  const currentExposure = Math.max(0, -currentImpact);
  const change = initialImpact - currentExposure;
  const tolerance = 1;
  const status = change > tolerance ? 'improved' : change < -tolerance ? 'worsened' : 'unchanged';
  return { status, currentExposure, change };
}

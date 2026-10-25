import { describe, expect, it } from 'vitest';
import { analyticsActionStorageKey, isAnalyticsActionOverdue, readAnalyticsActionStates, writeAnalyticsActionStates, reconcileAnalyticsActionImpact } from './analyticsActionStorage';

const scope = { period: '2026-10', projectId: 'p1', restaurantId: 'r1' };
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('analytics action storage', () => {
  it('persists and restores decisions for the same scope', () => {
    const storage = memoryStorage();
    const states = { revenue: { status: 'accepted' as const, note: 'Сверить чеки' } };
    expect(writeAnalyticsActionStates(scope, states, storage)).toBe(true);
    expect(readAnalyticsActionStates(scope, storage)).toEqual(states);
  });

  it('isolates actions by period and restaurant scope', () => {
    const storage = memoryStorage();
    writeAnalyticsActionStates(scope, { revenue: { status: 'confirmed', note: 'Проверено' } }, storage);
    expect(analyticsActionStorageKey(scope)).not.toBe(analyticsActionStorageKey({ ...scope, period: '2026-09' }));
    expect(readAnalyticsActionStates({ ...scope, restaurantId: 'r2' }, storage)).toEqual({});
    expect(readAnalyticsActionStates({ ...scope, period: '2026-09' }, storage)).toEqual({});
  });

  it('ignores malformed or invalid records', () => {
    const storage = memoryStorage();
    storage.setItem(analyticsActionStorageKey(scope), JSON.stringify({
      good: { status: 'confirmed', note: 'Есть документ' },
      badStatus: { status: 'done', note: 'неверный статус' },
      badNote: { status: 'accepted', note: 123 },
    }));
    expect(readAnalyticsActionStates(scope, storage)).toEqual({
      good: { status: 'confirmed', note: 'Есть документ' },
    });
  });

  it('fails safely when storage is unavailable', () => {
    expect(writeAnalyticsActionStates(scope, {}, null)).toBe(false);
    expect(readAnalyticsActionStates(scope, null)).toEqual({});
  });
  it('persists owner, due date, baseline deviation and user-reported result', () => {
    const storage = memoryStorage();
    const states = { cogs: { status: 'confirmed' as const, note: 'Сверен акт закупки', responsible: 'Управляющий', dueDate: '2026-10-28', initialImpact: 125000, initialImpactPeriod: '2026-10', initialImpactArticle: 'Себестоимость', resultAmount: 40000 } };
    writeAnalyticsActionStates(scope, states, storage);
    expect(readAnalyticsActionStates(scope, storage)).toEqual(states);
    storage.setItem(analyticsActionStorageKey(scope), JSON.stringify({
      invalid: { status: 'accepted', note: 'Проверка', responsible: 'x'.repeat(140), dueDate: '28.10.2026', initialImpact: -5, resultAmount: '100' },
    }));
    expect(readAnalyticsActionStates(scope, storage)).toEqual({ invalid: { status: 'accepted', note: 'Проверка', responsible: 'x'.repeat(120) } });
  });

  it('marks only accepted actions with a past due date as overdue', () => {
    const today = '2026-10-25';
    expect(isAnalyticsActionOverdue({ status: 'accepted', dueDate: '2026-10-24' }, today)).toBe(true);
    expect(isAnalyticsActionOverdue({ status: 'accepted', dueDate: today }, today)).toBe(false);
    expect(isAnalyticsActionOverdue({ status: 'accepted', dueDate: '2026-10-26' }, today)).toBe(false);
    expect(isAnalyticsActionOverdue({ status: 'accepted' }, today)).toBe(false);
    expect(isAnalyticsActionOverdue({ status: 'recommended', dueDate: '2026-10-24' }, today)).toBe(false);
    expect(isAnalyticsActionOverdue({ status: 'confirmed', dueDate: '2026-10-24' }, today)).toBe(false);
  });

});


describe('management action P&L reconciliation', () => {
  it('marks a lower adverse deviation as improved without claiming causality', () => {
    expect(reconcileAnalyticsActionImpact(100000, -60000, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'improved', currentExposure: 60000, change: 40000 });
  });
  it('treats a neutral or favorable comparable article as zero adverse exposure', () => {
    expect(reconcileAnalyticsActionImpact(100000, 0, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'improved', currentExposure: 0, change: 100000 });
    expect(reconcileAnalyticsActionImpact(100000, 15000, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость').currentExposure).toBe(0);
  });
  it('marks a larger adverse deviation as worsened', () => {
    expect(reconcileAnalyticsActionImpact(100000, -120000, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'worsened', currentExposure: 120000, change: -20000 });
  });
  it('uses a one-ruble tolerance for rounding noise', () => {
    expect(reconcileAnalyticsActionImpact(100000, -100000.5, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость').status).toBe('unchanged');
  });
  it('refuses to compare a different period or a different article label', () => {
    expect(reconcileAnalyticsActionImpact(100000, -50000, true, '2026-09', '2026-10', 'Себестоимость', 'Себестоимость').status).toBe('insufficient_data');
    expect(reconcileAnalyticsActionImpact(100000, -50000, true, '2026-10', '2026-10', 'Себестоимость', 'ФОТ').status).toBe('insufficient_data');
    expect(reconcileAnalyticsActionImpact(100000, -50000, true, undefined, '2026-10', 'Себестоимость', 'Себестоимость').status).toBe('insufficient_data');
  });
  it('does not infer zero when P&L or baseline is unavailable', () => {
    expect(reconcileAnalyticsActionImpact(100000, undefined, false, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'insufficient_data' });
    expect(reconcileAnalyticsActionImpact(undefined, 0, true, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'insufficient_data' });
    expect(reconcileAnalyticsActionImpact(100000, 0, false, '2026-10', '2026-10', 'Себестоимость', 'Себестоимость')).toEqual({ status: 'insufficient_data' });
  });
});

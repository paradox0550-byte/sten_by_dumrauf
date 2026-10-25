import { describe, expect, it } from 'vitest';
import { analyticsActionStorageKey, readAnalyticsActionStates, writeAnalyticsActionStates } from './analyticsActionStorage';

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
  it('persists owner and due date and rejects malformed dates', () => {
    const storage = memoryStorage();
    const states = { cogs: { status: 'accepted' as const, note: 'Сверить списания', responsible: 'Управляющий', dueDate: '2026-10-28' } };
    writeAnalyticsActionStates(scope, states, storage);
    expect(readAnalyticsActionStates(scope, storage)).toEqual(states);
    storage.setItem(analyticsActionStorageKey(scope), JSON.stringify({ invalid: { status: 'accepted', note: 'Проверка', responsible: 'x'.repeat(140), dueDate: '28.10.2026' } }));
    expect(readAnalyticsActionStates(scope, storage)).toEqual({ invalid: { status: 'accepted', note: 'Проверка', responsible: 'x'.repeat(120) } });
  });

});

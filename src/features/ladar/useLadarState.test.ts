import { describe, expect, it } from 'vitest';
import { resolveLadarState } from './useLadarState';

describe('resolveLadarState', () => {
  it('defaults missing or non-server status to idle', () => {
    expect(resolveLadarState(null)).toBe('idle');
    expect(resolveLadarState(undefined)).toBe('idle');
    expect(resolveLadarState({ source: 'local' as 'server', state: 'deviation', confirmed: true, explanation: 'test' })).toBe('idle');
  });

  it('passes through valid server analysis states', () => {
    expect(resolveLadarState({ source: 'server', state: 'idle' })).toBe('idle');
    expect(resolveLadarState({ source: 'server', state: 'analyzing' })).toBe('analyzing');
    expect(resolveLadarState({ source: 'server', state: 'complete' })).toBe('complete');
  });

  it('never shows a deviation without explicit confirmation and explanation', () => {
    expect(resolveLadarState({ source: 'server', state: 'deviation' })).toBe('idle');
    expect(resolveLadarState({ source: 'server', state: 'deviation', confirmed: false, explanation: 'Есть отклонение' })).toBe('idle');
    expect(resolveLadarState({ source: 'server', state: 'deviation', confirmed: true, explanation: '   ' })).toBe('idle');
    expect(resolveLadarState({ source: 'server', state: 'deviation', confirmed: true, explanation: 'Факт выше плана' })).toBe('deviation');
  });

  it('does not invent state transitions over time', () => {
    const status = { source: 'server' as const, state: 'analyzing' as const };
    expect(resolveLadarState(status)).toBe('analyzing');
    expect(resolveLadarState(status)).toBe('analyzing');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from './defaults';
import { appearanceKey, loadAppearance, saveAppearance } from './storage';

describe('STEN Chat Appearance v1', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the isolated organization/user namespace', () => {
    expect(appearanceKey({ organizationId: 'org-7', id: 'user-3' })).toBe('sten_chat_appearance_v1:org-7:user-3');
    expect(appearanceKey({ organizationId: null, id: 'user-3' })).toBe('sten_chat_appearance_v1:no-org:user-3');
  });

  it('falls back to graphite defaults when nothing is stored', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    });
    expect(loadAppearance({ organizationId: 'org-7', id: 'user-3' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('round-trips valid settings', () => {
    let stored = '';
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() => stored || null),
        setItem: vi.fn((_key: string, value: string) => {
          stored = value;
        }),
      },
    });
    const settings = { ...DEFAULT_APPEARANCE, theme: 'paper' as const, density: 'comfort' as const, showTime: false };
    saveAppearance({ organizationId: 'org-7', id: 'user-3' }, settings);
    expect(loadAppearance({ organizationId: 'org-7', id: 'user-3' })).toEqual(settings);
  });

  it('rejects malformed settings instead of leaking invalid UI state', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() => JSON.stringify({ theme: 'unknown' })),
        setItem: vi.fn(),
      },
    });
    expect(loadAppearance({ organizationId: 'org-7', id: 'user-3' })).toEqual(DEFAULT_APPEARANCE);
  });
});

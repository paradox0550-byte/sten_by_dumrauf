import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

export type AnalyticsSettings = {
  financial: boolean;
  labor: boolean;
  forecast: boolean;
  laborTarget: number;
  foodTarget: number;
  updated_at?: string;
};

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  financial: true,
  labor: true,
  forecast: true,
  laborTarget: 25,
  foodTarget: 30,
};

const LS_KEY = 'sten_analytics_settings_v1';
const EVT = 'sten-analytics-settings';

function clampPct(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 100) / 100;
}

function sanitize(raw: unknown): AnalyticsSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    financial: Boolean(o.financial),
    labor: Boolean(o.labor),
    forecast: Boolean(o.forecast),
    laborTarget: clampPct(o.laborTarget, DEFAULT_ANALYTICS_SETTINGS.laborTarget),
    foodTarget: clampPct(o.foodTarget, DEFAULT_ANALYTICS_SETTINGS.foodTarget),
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : undefined,
  };
}

function readCache(): AnalyticsSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCache(s: AnalyticsSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

function broadcast(s: AnalyticsSettings) {
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: s })); } catch {}
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export function useAnalyticsSettings() {
  const [settings, setSettings] = useState<AnalyticsSettings>(
    () => readCache() ?? DEFAULT_ANALYTICS_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const alive = useRef(true);

  const apply = useCallback((next: AnalyticsSettings) => {
    setSettings(next);
    writeCache(next);
    broadcast(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ settings: AnalyticsSettings | null }>('/api/analytics/settings');
      const remote = data && 'settings' in data ? sanitize(data.settings) : null;
      apply(remote ?? DEFAULT_ANALYTICS_SETTINGS);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось загрузить настройки аналитики.';
      if (alive.current) setError(msg);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [apply]);

  const save = useCallback(
    async (patch: Partial<AnalyticsSettings>): Promise<SaveResult> => {
      const prev = settings;
      const merged: AnalyticsSettings = { ...settings, ...patch };
      setSaving(true);
      setError('');
      apply(merged);
      try {
        const res = await api.put<{ saved: boolean; confirmed: boolean; settings: AnalyticsSettings }>(
          '/api/analytics/settings',
          {
            foodTarget: merged.foodTarget,
            laborTarget: merged.laborTarget,
            financial: merged.financial,
            labor: merged.labor,
            forecast: merged.forecast,
          }
        );
        const confirmed = res?.settings ? sanitize(res.settings) : null;
        apply(confirmed ?? merged);
        if (alive.current) setSavedAt(new Date().toISOString());
        return { ok: true };
      } catch (e) {
        apply(prev);
        const msg = e instanceof ApiError ? e.message : 'Не удалось сохранить настройки аналитики.';
        if (alive.current) setError(msg);
        return { ok: false, error: msg };
      } finally {
        if (alive.current) setSaving(false);
      }
    },
    [settings, apply]
  );

  useEffect(() => {
    alive.current = true;
    void reload();
    const onEvt = (e: Event) => {
      const s = sanitize((e as CustomEvent).detail);
      setSettings(s ?? readCache() ?? DEFAULT_ANALYTICS_SETTINGS);
    };
    window.addEventListener(EVT, onEvt as EventListener);
    return () => {
      alive.current = false;
      window.removeEventListener(EVT, onEvt as EventListener);
    };
  }, [reload]);

  return { settings, loading, saving, error, savedAt, save, reload };
}

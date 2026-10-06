import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_APPEARANCE } from './defaults';
import { loadAppearance, saveAppearance } from './storage';
import type { AppearanceSettings, AppearanceUser } from './types';

export function useAppearance(user: AppearanceUser | null | undefined) {
  const [settings, setSettings] = useState<AppearanceSettings>(() => loadAppearance(user));

  useEffect(() => {
    setSettings(loadAppearance(user));
  }, [user?.id, user?.organizationId]);

  const update = useCallback(<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setSettings(current => {
      const next = { ...current, [key]: value };
      saveAppearance(user, next);
      return next;
    });
  }, [user?.id, user?.organizationId]);

  const reset = useCallback(() => {
    setSettings(DEFAULT_APPEARANCE);
    saveAppearance(user, DEFAULT_APPEARANCE);
  }, [user?.id, user?.organizationId]);

  return { settings, update, setSettings, reset };
}

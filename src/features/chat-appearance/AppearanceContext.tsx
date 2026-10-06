import { createContext, useContext, useMemo } from 'react';
import { useAppearance } from './useAppearance';
import type { AppearanceSettings, AppearanceUser } from './types';

type AppearanceContextValue = {
  settings: AppearanceSettings;
  update: <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => void;
  reset: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ user, children }: { user: AppearanceUser | null | undefined; children: React.ReactNode }) {
  const appearance = useAppearance(user);
  const value = useMemo(
    () => ({ settings: appearance.settings, update: appearance.update, reset: appearance.reset }),
    [appearance.settings, appearance.update, appearance.reset],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearanceContext() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('AppearanceProvider is missing');
  return value;
}

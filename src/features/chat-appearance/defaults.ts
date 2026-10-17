import type { AppearanceSettings, DensityId, ThemeId } from './types';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'graphite',
  background: 'none',
  density: 'compact',
  showAvatars: true,
  showTime: true,
  showSources: true,
  showActions: true,
};

// Keep only the two useful, distinct choices. Global app theme remains in Settings.
export const THEME_OPTIONS: Array<{ id: ThemeId; label: string; description: string }> = [
  { id: 'graphite', label: 'Тёмная', description: 'Фирменная тема STEN' },
  { id: 'paper', label: 'Светлая', description: 'Светлый фон и контрастный текст' },
];

export const DENSITY_OPTIONS: Array<{ id: DensityId; label: string }> = [
  { id: 'compact', label: 'Компактно' },
  { id: 'comfort', label: 'Свободно' },
];

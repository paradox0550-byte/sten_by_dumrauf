import type { AppearanceSettings, BackgroundId, DensityId, ThemeId } from './types';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'graphite',
  background: 'geometry',
  density: 'minimal',
  showAvatars: true,
  showTime: true,
  showSources: true,
  showActions: true,
};

export const THEME_OPTIONS: Array<{ id: ThemeId; label: string; description: string }> = [
  { id: 'graphite', label: 'Graphite', description: 'STEN Dark · строгий тёмный' },
  { id: 'midnight', label: 'Midnight', description: 'почти чёрный · глубокий' },
  { id: 'slate', label: 'Slate', description: 'холодный серо-синий' },
  { id: 'paper', label: 'Paper', description: 'светлый · чистый' },
  { id: 'sten', label: 'STEN', description: 'фирменный · акцентный' },
  { id: 'system', label: 'System', description: 'следует теме устройства' },
];

export const BACKGROUND_OPTIONS: Array<{ id: BackgroundId; label: string }> = [
  { id: 'none', label: 'Без фона' },
  { id: 'geometry', label: 'STEN Geometry' },
];

export const DENSITY_OPTIONS: Array<{ id: DensityId; label: string }> = [
  { id: 'minimal', label: 'Минимальные' },
  { id: 'compact', label: 'Compact' },
  { id: 'comfort', label: 'Comfort' },
];

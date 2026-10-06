export type ThemeId = 'graphite' | 'midnight' | 'slate' | 'paper' | 'sten' | 'system';
export type BackgroundId = 'none' | 'geometry';
export type DensityId = 'minimal' | 'compact' | 'comfort';

export type AppearanceSettings = {
  theme: ThemeId;
  background: BackgroundId;
  density: DensityId;
  showAvatars: boolean;
  showTime: boolean;
  showSources: boolean;
  showActions: boolean;
};

export type AppearanceUser = {
  id: string;
  organizationId?: string | null;
};

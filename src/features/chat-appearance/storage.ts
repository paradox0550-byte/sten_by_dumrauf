import { DEFAULT_APPEARANCE } from './defaults';
import type { AppearanceSettings, AppearanceUser } from './types';

const PREFIX = 'sten_chat_appearance_v1';

export function appearanceKey(user: AppearanceUser | null | undefined): string | null {
  if (!user?.id) return null;
  return `${PREFIX}:${user.organizationId || 'no-org'}:${user.id}`;
}

function isAppearanceSettings(value: unknown): value is AppearanceSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    ['graphite', 'midnight', 'slate', 'paper', 'sten', 'system'].includes(String(v.theme)) &&
    ['none', 'geometry'].includes(String(v.background)) &&
    ['minimal', 'compact', 'comfort'].includes(String(v.density)) &&
    typeof v.showAvatars === 'boolean' &&
    typeof v.showTime === 'boolean' &&
    typeof v.showSources === 'boolean' &&
    typeof v.showActions === 'boolean'
  );
}

export function loadAppearance(user: AppearanceUser | null | undefined): AppearanceSettings {
  const key = appearanceKey(user);
  if (!key || typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed: unknown = JSON.parse(raw);
    return isAppearanceSettings(parsed) ? parsed : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(user: AppearanceUser | null | undefined, settings: AppearanceSettings): void {
  const key = appearanceKey(user);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Preferences are best-effort and must never break the chat.
  }
}

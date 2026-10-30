import type { ZoneId } from './schema';

export const DEFAULT_ZONE_MAP: Readonly<Record<string, Exclude<ZoneId, 'unknown'>>> = {
  'Горячие блюда': 'hot', 'Горячие закуски': 'hot', 'Супы': 'hot', 'Паста': 'hot', 'Гриль': 'hot',
  'Холодные блюда': 'cold', 'Холодные закуски': 'cold', 'Салаты': 'cold',
  'Напитки': 'bar', 'Алкогольные напитки': 'bar', 'Коктейли': 'bar', 'Кофе': 'bar', 'Чай': 'bar',
  'Заготовки': 'prep', 'Полуфабрикаты': 'prep', 'Десерты': 'dessert', 'Выпечка': 'dessert',
};

export function normalizeCategory(category: string): string {
  return category.normalize('NFKC').replace(/[\\s\\u00a0]+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

const defaults = new Map(Object.entries(DEFAULT_ZONE_MAP).map(([name, zone]) => [normalizeCategory(name), zone]));

export function mapCategoryToZone(category: string, customMap: Readonly<Record<string, ZoneId>> = {}): ZoneId {
  const key = normalizeCategory(category);
  const custom = Object.entries(customMap).find(([name]) => normalizeCategory(name) === key)?.[1];
  return custom ?? defaults.get(key) ?? 'unknown';
}

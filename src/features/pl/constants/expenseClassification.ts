import { z } from 'zod';

export const ExpenseControlTypeSchema = z.enum(['controllable', 'uncontrollable', 'unknown']);
export type ExpenseControlType = z.infer<typeof ExpenseControlTypeSchema>;

export const LocalClassificationOverrideSchema = z.record(z.string(), ExpenseControlTypeSchema);
export type LocalClassificationOverride = z.infer<typeof LocalClassificationOverrideSchema>;

const KEYWORD_MAPPING: ReadonlyArray<readonly [string, ExpenseControlType]> = [
  ['амортизац', 'uncontrollable'],
  ['depreciation', 'uncontrollable'],
  ['rent', 'uncontrollable'],
  ['lease', 'uncontrollable'],
  ['royalty', 'uncontrollable'],
  ['tax', 'uncontrollable'],
  ['коммунальн', 'controllable'],
  ['food cost', 'controllable'],
  ['food cogs', 'controllable'],
  ['packaging', 'controllable'],
  ['marketing', 'controllable'],
  ['advertising', 'controllable'],
  ['repair', 'controllable'],
  ['utilities', 'controllable'],
  ['продукт', 'controllable'],
  ['себестоимость кухни', 'controllable'],
  ['упаковк', 'controllable'],
  ['маркетинг', 'controllable'],
  ['реклам', 'controllable'],
  ['ремонт', 'controllable'],
  ['хоз', 'controllable'],
  ['бонус', 'controllable'],
  ['преми', 'controllable'],
  ['аренд', 'uncontrollable'],
  ['лизинг', 'uncontrollable'],
  ['роялти', 'uncontrollable'],
  ['налог', 'uncontrollable'],
  ['усн', 'uncontrollable'],
];

export function normalizeExpenseKey(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('ru-RU').replace(/[–—-]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Keyword classification is a suggestion, not an accounting fact.
 * Explicit local overrides win. Unknown is retained when evidence is insufficient.
 */
export function classifyExpense(
  articleName: string,
  articleId?: string,
  overrides?: LocalClassificationOverride,
): ExpenseControlType {
  const id = articleId ? normalizeExpenseKey(articleId) : undefined;
  const name = normalizeExpenseKey(articleName);

  if (overrides) {
    const parsed = LocalClassificationOverrideSchema.safeParse(overrides);
    if (parsed.success) {
      if (id && Object.prototype.hasOwnProperty.call(parsed.data, id)) return parsed.data[id];
      if (Object.prototype.hasOwnProperty.call(parsed.data, name)) return parsed.data[name];
    }
  }

  for (const [keyword, type] of KEYWORD_MAPPING) {
    if (name.includes(keyword) || (id && id.includes(keyword))) return type;
  }
  return 'unknown';
}

export const EXPENSE_CLASSIFICATION_STORAGE_KEY = 'sten:pnl:expense-classification:v1';

export function readLocalClassificationOverrides(storage?: Pick<Storage, 'getItem'>): LocalClassificationOverride {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = target?.getItem(EXPENSE_CLASSIFICATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const result = LocalClassificationOverrideSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export function writeLocalClassificationOverrides(
  overrides: LocalClassificationOverride,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  const parsed = LocalClassificationOverrideSchema.safeParse(overrides);
  if (!parsed.success) return false;
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    target?.setItem(EXPENSE_CLASSIFICATION_STORAGE_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

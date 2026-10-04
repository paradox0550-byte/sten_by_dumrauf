
// Единый шаблон P&L. Используется для рендера дерева, расчёта computed-строк,
// KPI-панели, точки безубыточности и миграции старых статей.
// ВАЖНО: canonical keys не переименовывать без миграции данных.

/* ────────────────────────────── Типы ────────────────────────────── */

export type RowKind = 'input' | 'computed' | 'subtotal';
export type CostBehavior = 'fix' | 'var' | 'mix';
export type NormUnit =
  | 'pct_revenue'
  | 'pct_cogs'
  | 'pct_payroll'
  | 'pct_markup'
  | 'rub'
  | 'pct_points';

export interface Norm {
  min?: number;
  max?: number;
  unit: NormUnit;
  note?: string;
}

export type FormulaOp =
  | { op: 'sum';   of: string[] }
  | { op: 'sub';   of: string[] }
  | { op: 'mul';   ref: string; factor: number }
  | { op: 'div';   num: string; den: string }
  | { op: 'pct';   num: string | string[]; den: string }
  | { op: 'ratio'; num: string; den: string };

export interface TemplateRow {
  code: string;
  key: string;
  name: string;
  parent: string | null;
  kind: RowKind;
  behavior?: CostBehavior;
  formula?: FormulaOp;
  formulaLabel?: string;
  norm?: Norm;
  supportsRate?: boolean;
  aliases?: string[];
}

export function formulaRefs(f: FormulaOp): string[] {
  switch (f.op) {
    case 'sum':
    case 'sub':   return [...f.of];
    case 'mul':   return [f.ref];
    case 'div':
    case 'ratio': return [f.num, f.den];
    case 'pct':   return [...(Array.isArray(f.num) ? f.num : [f.num]), f.den];
  }
}

/* ─────────────────────── Шаблон: 44 строки ─────────────────────── */

export const PNL_TEMPLATE: TemplateRow[] = [

  /* ── 1. ВЫРУЧКА ─────────────────────────────────────────────── */
  { code: '1', key: 'revenue', name: 'Выручка итого', parent: null,
    kind: 'subtotal',
    formula: { op: 'sum', of: ['revenue_hall','revenue_takeaway','revenue_delivery','revenue_banquet','revenue_other'] },
    formulaLabel: '=СУММ(1.1:1.5)',
    aliases: ['выруч','revenue','доход'] },

  { code: '1.1', key: 'revenue_hall',     name: 'Зал',       parent: '1', kind: 'input' },
  { code: '1.2', key: 'revenue_takeaway', name: 'На вынос',  parent: '1', kind: 'input' },
  { code: '1.3', key: 'revenue_delivery', name: 'Доставка',  parent: '1', kind: 'input' },
  { code: '1.4', key: 'revenue_banquet',  name: 'Банкет',    parent: '1', kind: 'input' },
  { code: '1.5', key: 'revenue_other',    name: 'Прочая',    parent: '1', kind: 'input' },

  { code: '1.K', key: 'avg_check', name: 'Средний чек, ₽', parent: '1',
    kind: 'computed', formula: { op: 'div', num: 'revenue', den: 'checks' },
    formulaLabel: '=C3/Кол-во чеков' },

  { code: '1.L', key: 'checks', name: 'Кол-во чеков', parent: '1', kind: 'input' },

  /* ── 2. СЕБЕСТОИМОСТЬ ───────────────────────────────────────── */
  { code: '2', key: 'cogs', name: 'Себестоимость итого', parent: null,
    kind: 'subtotal', behavior: 'var',
    formula: { op: 'sum', of: ['cogs_recipe','cogs_kitchen_waste','cogs_bar_waste','cogs_finished_goods_writeoff','cogs_staff_meals','cogs_compliments','cogs_inventory_shortage','cogs_other_losses'] },
    formulaLabel: '=СУММ(2.1:2.8)',
    norm: { min: 25, max: 35, unit: 'pct_revenue' },
    aliases: ['себестоим','cogs','фудкост','food cost'] },

  { code: '2.1', key: 'cogs_recipe',                  name: 'По рецепту',                 parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.2', key: 'cogs_kitchen_waste',           name: 'Брак кухни',                 parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.3', key: 'cogs_bar_waste',               name: 'Брак бара',                  parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.4', key: 'cogs_finished_goods_writeoff', name: 'Списание ГП',                parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.5', key: 'cogs_staff_meals',             name: 'Питание персонала',          parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.6', key: 'cogs_compliments',             name: 'Комплименты',                parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.7', key: 'cogs_inventory_shortage',      name: 'Инвентаризация (недостача)', parent: '2', kind: 'input', behavior: 'var' },
  { code: '2.8', key: 'cogs_other_losses',            name: 'Прочие потери',              parent: '2', kind: 'input', behavior: 'var' },

  /* ── 3. ВАЛОВАЯ МАРЖА ───────────────────────────────────────── */
  { code: '3', key: 'gross_profit', name: 'Маржа валовая ₽', parent: null,
    kind: 'computed', formula: { op: 'sub', of: ['revenue','cogs'] },
    formulaLabel: '=C3-C7' },

  { code: '3.1', key: 'gross_margin_pct', name: 'Маржа валовая %', parent: '3',
    kind: 'computed', formula: { op: 'pct', num: 'gross_profit', den: 'revenue' },
    formulaLabel: '=C26/C3',
    norm: { min: 65, max: 75, unit: 'pct_revenue' } },

  { code: '3.2', key: 'markup_coefficient', name: 'Коэффициент наценки', parent: '3',
    kind: 'computed', formula: { op: 'pct', num: 'gross_profit', den: 'cogs' },
    formulaLabel: '=(C3-C7)/C7',
    norm: { min: 200, max: 400, unit: 'pct_markup' } },

  /* ── 4. КОНТРОЛИРУЕМЫЕ РАСХОДЫ ──────────────────────────────── */
  { code: '4', key: 'controllable_costs', name: 'Контролируемые расходы', parent: null,
    kind: 'subtotal', behavior: 'mix',
    formula: { op: 'sum', of: ['opex_utilities','opex_security','opex_marketing','opex_general','opex_personnel_nonpayroll','payroll','payroll_tax','opex_admin','opex_repair','opex_transport','opex_acquiring','opex_other'] },
    formulaLabel: '=СУММ(4.1:4.12)',
    norm: { min: 15, max: 25, unit: 'pct_revenue' } },

  { code: '4.1',  key: 'opex_utilities',            name: 'Коммунальные',                 parent: '4', kind: 'input', behavior: 'fix' },
  { code: '4.2',  key: 'opex_security',             name: 'Безопасность',                 parent: '4', kind: 'input', behavior: 'fix' },
  { code: '4.3',  key: 'opex_marketing',            name: 'Маркетинг',                    parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 2, max: 4, unit: 'pct_revenue' }, formulaLabel: '=D3*C36' },
  { code: '4.4',  key: 'opex_general',              name: 'Общехозяйственные',            parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 3, max: 5, unit: 'pct_revenue' }, formulaLabel: '=D3*C51' },
  { code: '4.5',  key: 'opex_personnel_nonpayroll', name: 'Расходы на персонал (не ФОТ)', parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 1, max: 3, unit: 'pct_revenue' }, formulaLabel: '=D3*C72' },
  { code: '4.6',  key: 'payroll',                   name: 'ФОТ (оклад + премии + отпуск)', parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 20, max: 25, unit: 'pct_revenue' }, formulaLabel: '=D3*C83',
    aliases: ['фот','зарплат','персонал','payroll'] },
  { code: '4.7',  key: 'payroll_tax',               name: 'Страховые взносы с ФОТ',       parent: '4', kind: 'computed', behavior: 'mix',
    formula: { op: 'mul', ref: 'payroll', factor: 0.30 },
    formulaLabel: '=C83*0.30',
    norm: { min: 30, max: 30, unit: 'pct_payroll', note: '30 % от 4.6' } },
  { code: '4.8',  key: 'opex_admin',                name: 'Прочие административные',      parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 3, max: 5, unit: 'pct_revenue' }, formulaLabel: '=D3*C99' },
  { code: '4.9',  key: 'opex_repair',               name: 'Ремонт и ТО',                  parent: '4', kind: 'input', behavior: 'mix', supportsRate: true,
    norm: { min: 0.5, max: 1, unit: 'pct_revenue' }, formulaLabel: '=D3*C109' },
  { code: '4.10', key: 'opex_transport',            name: 'Транспортные',                 parent: '4', kind: 'input', behavior: 'var', supportsRate: true,
    norm: { min: 1, max: 2, unit: 'pct_revenue' }, formulaLabel: '=D3*C120' },
  { code: '4.11', key: 'opex_acquiring',            name: 'Эквайринг',                    parent: '4', kind: 'input', behavior: 'var', supportsRate: true,
    norm: { min: 1.5, max: 2.5, unit: 'pct_revenue' }, formulaLabel: '=D3*0.018' },
  { code: '4.12', key: 'opex_other',                name: 'Прочие операционные',          parent: '4', kind: 'input', behavior: 'mix' },

  /* ── 4.OPEX — совместимость со старым API ───────────────────── */
  // Старое API отдавало opex как «расходы без ФОТ и страховых».
  // Новый шаблон включает их в controllable_costs. Этот computed-ключ
  // сохраняет обратную совместимость для Finances.tsx и Analytics.tsx.
  { code: '4.OPEX', key: 'opex_excl_payroll', name: 'OPEX (без ФОТ)', parent: '4',
    kind: 'computed',
    formula: { op: 'sub', of: ['controllable_costs','payroll','payroll_tax'] },
    formulaLabel: '=C27-C83-C93',
    aliases: ['opex','операцион'] },

  /* ── 5. ПРИБЫЛЬ КОНТРОЛИРУЕМАЯ ──────────────────────────────── */
  { code: '5', key: 'controllable_profit', name: 'Прибыль контролируемая ₽', parent: null,
    kind: 'computed', formula: { op: 'sub', of: ['revenue','cogs','controllable_costs'] },
    formulaLabel: '=C3-C7-C27' },

  { code: '5.1', key: 'controllable_profit_pct', name: 'Прибыль контролируемая %', parent: '5',
    kind: 'computed', formula: { op: 'pct', num: 'controllable_profit', den: 'revenue' },
    formulaLabel: '=C123/C3',
    norm: { min: 40, max: 55, unit: 'pct_revenue' } },

  /* ── 6. НЕКОНТРОЛИРУЕМЫЕ РАСХОДЫ ────────────────────────────── */
  { code: '6', key: 'noncontrollable_costs', name: 'Неконтролируемые расходы', parent: null,
    kind: 'subtotal', behavior: 'fix',
    formula: { op: 'sum', of: ['rent','taxes','depreciation','interest'] },
    formulaLabel: '=СУММ(6.1:6.4)' },

  { code: '6.1', key: 'rent',         name: 'Аренда',                parent: '6', kind: 'input', behavior: 'fix',
    norm: { min: 10, max: 15, unit: 'pct_revenue' } },
  { code: '6.2', key: 'taxes',        name: 'Налоги (без штрафов!)', parent: '6', kind: 'input', behavior: 'var',
    norm: { unit: 'pct_revenue', note: 'зависит от режима' },
    aliases: ['налог','tax'] },
  { code: '6.3', key: 'depreciation', name: 'Амортизация',           parent: '6', kind: 'input', behavior: 'fix',
    norm: { min: 1, max: 3, unit: 'pct_revenue' },
    aliases: ['амортиза','depreciation'] },
  { code: '6.4', key: 'interest',     name: 'Проценты по кредитам',  parent: '6', kind: 'input', behavior: 'fix',
    norm: { min: 0, max: 2, unit: 'pct_revenue' },
    aliases: ['процент','interest'] },

  /* ── 7. EBITDA ──────────────────────────────────────────────── */
  { code: '7', key: 'ebitda', name: 'EBITDA ₽', parent: null,
    kind: 'computed',
    formula: { op: 'sub', of: ['controllable_profit','noncontrollable_costs'] },
    formulaLabel: '=C123-C125' },

  { code: '7.1', key: 'ebitda_margin', name: 'EBITDA Margin %', parent: '7',
    kind: 'computed', formula: { op: 'pct', num: 'ebitda', den: 'revenue' },
    formulaLabel: '=C130/C3',
    norm: { min: 12, unit: 'pct_revenue', note: '> 12 %' } },

  /* ── 8. NET PROFIT ──────────────────────────────────────────── */
  { code: '8', key: 'net_profit', name: 'Net Profit ₽', parent: null,
    kind: 'computed', formula: { op: 'sub', of: ['ebitda'] },
    formulaLabel: '=C130' },

  { code: '8.1', key: 'net_margin', name: 'Net Margin %', parent: '8',
    kind: 'computed', formula: { op: 'pct', num: 'net_profit', den: 'revenue' },
    formulaLabel: '=C134/C3',
    norm: { min: 5, unit: 'pct_revenue', note: '> 5 %' } },
];

/* ───────────────────────── KPI-панель ────────────────────────── */

export interface KpiDef {
  key: string;
  label: string;
  formula: FormulaOp;
  formulaLabel: string;
  norm: Norm;
}

export const PNL_KPI: KpiDef[] = [
  { key: 'kpi_food_cost',    label: 'Food Cost %',    formula: { op: 'pct', num: 'cogs', den: 'revenue' },
    formulaLabel: '=C7/C3*100',          norm: { min: 25, max: 35, unit: 'pct_revenue' } },
  { key: 'kpi_labor_cost',   label: 'Labor Cost %',   formula: { op: 'pct', num: ['payroll','payroll_tax'], den: 'revenue' },
    formulaLabel: '=(C83+C93)/C3*100',   norm: { min: 20, max: 30, unit: 'pct_revenue' } },
  { key: 'kpi_prime_cost',   label: 'Prime Cost %',   formula: { op: 'pct', num: ['cogs','payroll','payroll_tax'], den: 'revenue' },
    formulaLabel: '=(C7+C83+C93)/C3*100', norm: { min: 55, max: 65, unit: 'pct_revenue' } },
  { key: 'kpi_opex',         label: 'OPEX %',         formula: { op: 'pct', num: 'controllable_costs', den: 'revenue' },
    formulaLabel: '=C27/C3*100',         norm: { min: 15, max: 25, unit: 'pct_revenue' } },
  { key: 'kpi_ebitda_margin',label: 'EBITDA Margin',  formula: { op: 'pct', num: 'ebitda', den: 'revenue' },
    formulaLabel: '=C130/C3*100',        norm: { min: 12, unit: 'pct_revenue', note: '> 12 %' } },
  { key: 'kpi_net_margin',   label: 'Net Margin',     formula: { op: 'pct', num: 'net_profit', den: 'revenue' },
    formulaLabel: '=C134/C3*100',        norm: { min: 5,  unit: 'pct_revenue', note: '> 5 %' } },
];

/* ───────────────────── Точка безубыточности ──────────────────── */

export const BREAK_EVEN_DEF = {
  key: 'break_even',
  label: 'Точка безубыточности, ₽',
  formulaLabel: '=Fix/(1-Var%)',
} as const;

/* ───────────────────── Индексы и хелперы ─────────────────────── */

export const templateByKey  = new Map(PNL_TEMPLATE.map(r => [r.key, r]));
export const templateByCode = new Map(PNL_TEMPLATE.map(r => [r.code, r]));

export const childrenOf = (code: string | null): TemplateRow[] =>
  PNL_TEMPLATE.filter(r => r.parent === code);

export const templateKeyOf = (code: string): string | undefined =>
  templateByCode.get(code)?.key;

export const PNL_COLUMNS = [
  { key: 'article',  label: 'Статья' },
  { key: 'rate',     label: 'Rate план, %' },
  { key: 'plan',     label: 'План, ₽' },
  { key: 'fact',     label: 'Факт, ₽' },
  { key: 'factPct',  label: 'Факт % к выручке' },
  { key: 'deltaRub', label: 'Δ ₽' },
  { key: 'deltaPct', label: 'Δ %' },
] as const;

export function validateTemplate(): string[] {
  const errors: string[] = [];
  const seenKey = new Set<string>();
  const seenCode = new Set<string>();
  for (const r of PNL_TEMPLATE) {
    if (seenKey.has(r.key))   errors.push(`Дублирующийся key: ${r.key}`);
    if (seenCode.has(r.code)) errors.push(`Дублирующийся code: ${r.code}`);
    seenKey.add(r.key);
    seenCode.add(r.code);
    if (r.parent && !templateByCode.has(r.parent))
      errors.push(`Родитель не найден: ${r.code} → ${r.parent}`);
  }
  for (const r of PNL_TEMPLATE) {
    if (!r.formula) continue;
    for (const ref of formulaRefs(r.formula)) {
      if (!seenKey.has(ref))
        errors.push(`Ссылка не найдена: ${r.code} → ${ref}`);
    }
  }
  return errors;
}

/* ─────────── Пользовательский шаблон и интеграция с PnL ─────────── */

export const TEMPLATE_SOURCE = 'Шаблон';
export const USER_TEMPLATE_SOURCE = 'Мой шаблон';
const USER_TEMPLATE_KEY = 'sten.pnl.userTemplate';

export interface TemplateForUi {
  id: string;
  article: string;
  source: string;
}

/**
 * Готовый список строк P&L для таблицы ввода.
 * Источник помечается как «Шаблон · <код>», чтобы пользователь видел,
 * откуда пришла строка, и мог её переименовать или удалить.
 */
export function getTemplateForPnL(): TemplateForUi[] {
  return PNL_TEMPLATE.map(r => ({
    id: `tpl-${r.key}`,
    article: r.name,
    source: `${TEMPLATE_SOURCE} · ${r.code}`,
  }));
}

export function saveUserTemplate(articles: string[]): void {
  const clean = articles.map(a => String(a || '').trim()).filter(Boolean);
  if(!clean.length) throw new Error('Нет статей для сохранения в шаблон.');
  try {
    localStorage.setItem(USER_TEMPLATE_KEY, JSON.stringify(clean));
  } catch {
    throw new Error('Не удалось сохранить шаблон в браузере.');
  }
}

export function loadUserTemplate(): string[] | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(USER_TEMPLATE_KEY); } catch { return null; }
  if(!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed as string[];
  } catch { /* ignore */ }
  return null;
}

export function hasUserTemplate(): boolean {
  try { return localStorage.getItem(USER_TEMPLATE_KEY) !== null; } catch { return false; }
}
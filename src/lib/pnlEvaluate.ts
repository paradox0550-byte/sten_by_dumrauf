import {
  PNL_TEMPLATE, PNL_KPI,
  formulaRefs,
  type TemplateRow, type FormulaOp,
} from './pnlTemplate';

/* ───────────────────────────── Типы ───────────────────────────── */

export type PnlValues = Record<string, number | undefined>;

export interface BreakEvenResult {
  revenue: number | undefined;
  fixed: number | undefined;
  variable: number | undefined;
  variablePct: number | undefined;
  breakEven: number | undefined;
  missing: string[];
  mixExcluded: string[];
  complete: boolean;
}

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/* ──────────────────────── Вычисление формул ───────────────────── */

/**
 * sum   — терпимая агрегация: undefined только если ВСЕ слагаемые undefined.
 * sub   — строгая: undefined, если хотя бы один операнд неизвестен.
 * mul   — строгая.
 * div   — строгая, знаменатель ≠ 0.
 * ratio — как div, без ×100.
 * pct   — строгая, массив num суммируется, знаменатель ≠ 0.
 */
function evalFormula(f: FormulaOp, v: PnlValues): number | undefined {
  switch (f.op) {
    case 'sum': {
      const parts = f.of.map(k => v[k]).filter(isFiniteNum);
      return parts.length === 0 ? undefined : parts.reduce((s, x) => s + x, 0);
    }
    case 'sub': {
      if (f.of.length === 0) return undefined;
      const [head, ...rest] = f.of.map(k => v[k]);
      if (!isFiniteNum(head)) return undefined;
      let acc = head;
      for (const x of rest) {
        if (!isFiniteNum(x)) return undefined;
        acc -= x;
      }
      return acc;
    }
    case 'mul': {
      const base = v[f.ref];
      return isFiniteNum(base) ? base * f.factor : undefined;
    }
    case 'div':
    case 'ratio': {
      const n = v[f.num], d = v[f.den];
      return isFiniteNum(n) && isFiniteNum(d) && d !== 0 ? n / d : undefined;
    }
    case 'pct': {
      const d = v[f.den];
      if (!isFiniteNum(d) || d === 0) return undefined;
      const keys = Array.isArray(f.num) ? f.num : [f.num];
      const nums = keys.map(k => v[k]);
      if (nums.some(x => !isFiniteNum(x))) return undefined;
      const n = (nums as number[]).reduce((s, x) => s + x, 0);
      return (n / d) * 100;
    }
  }
}

/* ──────────────── Топологический порядок формул ───────────────── */

let _order: TemplateRow[] | null = null;

function templateOrder(): TemplateRow[] {
  if (_order) return _order;

  const rows = PNL_TEMPLATE.filter(
    r => r.kind === 'computed' || r.kind === 'subtotal',
  );
  const byKey = new Map(rows.map(r => [r.key, r]));
  const computedKeys = new Set(byKey.keys());

  const visited  = new Set<string>();
  const visiting = new Set<string>();
  const out: TemplateRow[] = [];

  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key))
      throw new Error(`[pnlTemplate] циклическая зависимость: ${key}`);
    visiting.add(key);
    const row = byKey.get(key);
    if (row?.formula) {
      for (const ref of formulaRefs(row.formula)) {
        if (computedKeys.has(ref)) visit(ref);
      }
    }
    visiting.delete(key);
    visited.add(key);
    if (row) out.push(row);
  };

  for (const r of rows) visit(r.key);
  _order = out;
  return out;
}

/* ───────────────────────── Публичный API ──────────────────────── */

/**
 * Вычисляет все computed и subtotal строки в топологическом порядке.
 *
 * Правило: если формула вычислима — результат перезаписывает значение,
 * пришедшее в values. Если невычислима — fallback из values сохраняется.
 * Это даёт бесплатную миграцию: старое API, отдающее revenue одной
 * строкой без разбивки, продолжит работать; как только появится
 * разбивка — она победит.
 */
export function evaluateTemplate(values: PnlValues): PnlValues {
  const result: PnlValues = { ...values };
  for (const row of templateOrder()) {
    if (!row.formula) continue;
    const computed = evalFormula(row.formula, result);
    if (computed !== undefined) result[row.key] = computed;
  }
  return result;
}

export function computeKpi(
  values: PnlValues,
): Record<string, number | undefined> {
  const evaluated = evaluateTemplate(values);
  const out: Record<string, number | undefined> = {};
  for (const kpi of PNL_KPI) {
    out[kpi.key] = evalFormula(kpi.formula, evaluated);
  }
  return out;
}

/**
 * Точка безубыточности: Fixed / (1 − Var%).
 * Строки behavior='mix' без явного split в mixSplit исключаются и
 * попадают в mixExcluded. Без них fixed занижается, а значит breakEven
 * получается оптимистично низким.
 */
export function breakEven(
  values: PnlValues,
  mixSplit: Record<string, number> = {},
): BreakEvenResult {
  const evaluated = evaluateTemplate(values);
  const revenue = evaluated.revenue;

  // Строки выручки (code 1.*) не участвуют в fix/var-разложении,
  // даже если у них в шаблоне ошибочно проставлен behavior.
  const costInputs = PNL_TEMPLATE.filter(
    r => r.kind === 'input' && !r.code.startsWith('1'),
  );

  const missing: string[] = [];
  const mixExcluded: string[] = [];

  let fixed = 0, variable = 0;
  let fixedAny = false, varAny = false;

  for (const r of costInputs) {
    const v = evaluated[r.key];

    if (r.behavior === 'fix') {
      if (!isFiniteNum(v)) { missing.push(r.key); continue; }
      fixed += v; fixedAny = true;
    } else if (r.behavior === 'var') {
      if (!isFiniteNum(v)) { missing.push(r.key); continue; }
      variable += v; varAny = true;
    } else if (r.behavior === 'mix') {
      const split = mixSplit[r.key];
      if (typeof split !== 'number' || split < 0 || split > 1) {
        mixExcluded.push(r.key);
        continue;
      }
      if (!isFiniteNum(v)) { missing.push(r.key); continue; }
      fixed    += v * split;
      variable += v * (1 - split);
      fixedAny = true; varAny = true;
    }
  }

  const fixedTotal    = fixedAny ? fixed    : undefined;
  const variableTotal = varAny  ? variable : undefined;

  const variablePct =
    isFiniteNum(variableTotal) && isFiniteNum(revenue) && revenue !== 0
      ? (variableTotal / revenue) * 100
      : undefined;

  const be =
    isFiniteNum(fixedTotal) &&
    isFiniteNum(variablePct) &&
    variablePct < 100
      ? fixedTotal / (1 - variablePct / 100)
      : undefined;

  return {
    revenue,
    fixed: fixedTotal,
    variable: variableTotal,
    variablePct,
    breakEven: be,
    missing,
    mixExcluded,
    complete: missing.length === 0 && be !== undefined,
  };
}
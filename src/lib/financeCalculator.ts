// ============================================================================
// STEN Finance Calculator — HoReCa-first
// Prime Cost is the King Metric. EBITDA is secondary.
// ============================================================================

export type FactStatus = 'PLAN' | 'FACT' | 'CONFIRMED' | 'DERIVED';
export type MetricStatus = 'ok' | 'warning' | 'critical' | 'unknown';

// --- Thresholds (HoReCa industry standards) ---
export const PRIME_COST_THRESHOLDS = { ok: 60, warning: 65 } as const;
export const FOOD_COST_THRESHOLDS = { ok: 30, warning: 35 } as const;
export const LABOR_COST_THRESHOLDS = { ok: 30, warning: 35 } as const;
export const OTHER_EXPENSES_THRESHOLD = 5; // % of revenue

// --- Input types ---
export interface CogsBreakdown {
  food?: number;
  beverage?: number;
  packaging?: number;
  total?: number;
}

export interface LaborBreakdown {
  kitchen?: number;
  service?: number;
  management?: number;
  backOffice?: number;
  overtime?: number;
  taxesContributions?: number;
  total?: number;
}

export interface OperatingExpenses {
  rent?: number;
  utilities?: number;
  marketing?: number;
  supplies?: number;
  equipment?: number;
  insurance?: number;
  licenses?: number;
  bankFees?: number;
  otherOperating?: number;
  total?: number;
}

export interface FinanceInput {
  revenue?: number;
  cogs?: number;
  cogsBreakdown?: CogsBreakdown;
  payroll?: number;
  laborBreakdown?: LaborBreakdown;
  opex?: number;
  opexBreakdown?: OperatingExpenses;
  depreciation?: number;
  interest?: number;
  tax?: number;
  other?: number;
}

export interface FinanceResult extends FinanceInput {
  // Core P&L
  grossProfit?: number;
  primeCost?: number;
  ebitda?: number;
  netProfit?: number;

  // Percentages
  foodCostPct?: number;
  laborCostPct?: number;
  primeCostPct?: number;
  opexPct?: number;
  ebitdaMargin?: number;
  netMargin?: number;
  otherExpensesPct?: number;

  // Statuses (threshold-based)
  primeCostStatus?: MetricStatus;
  foodCostStatus?: MetricStatus;
  laborCostStatus?: MetricStatus;

  // Validation flags
  primeCostMathValid?: boolean;
  primeCostLogicValid?: boolean;
  otherExceedsThreshold?: boolean;
  overtimeFlagged?: boolean;
  validationIssues: ValidationIssue[];
}

export interface ValidationIssue {
  type: 'prime_cost_mismatch' | 'prime_cost_anomaly' | 'other_exceeds_threshold' | 'overtime_detected' | 'missing_data';
  severity: 'warning' | 'critical';
  message: string;
}

// --- Utility functions ---
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const safeSub = (a: number | undefined, ...xs: (number | undefined)[]): number | undefined => {
  if (!finite(a) || xs.some(x => !finite(x))) return undefined;
  return a - xs.reduce<number>((s, x) => s + (x as number), 0);
};

const safePct = (part: number | undefined, total: number | undefined): number | undefined => {
  if (!finite(part) || !finite(total) || total === 0) return undefined;
  return (part / total) * 100;
};

const getStatus = (value: number | undefined, thresholds: { ok: number; warning: number }): MetricStatus => {
  if (!finite(value)) return 'unknown';
  if (value <= thresholds.ok) return 'ok';
  if (value <= thresholds.warning) return 'warning';
  return 'critical';
};

// --- Main calculator ---
export function calculateFinance(input: FinanceInput): FinanceResult {
  const issues: ValidationIssue[] = [];

  // 1. Core P&L calculations
  const grossProfit = safeSub(input.revenue, input.cogs);
  const primeCost = safeSub(input.cogs, undefined) !== undefined && input.payroll !== undefined
    ? (input.cogs as number) + (input.payroll as number)
    : undefined;
  const ebitda = safeSub(input.revenue, input.cogs, input.payroll, input.opex);
  const netProfit = safeSub(ebitda, input.depreciation, input.interest, input.tax, input.other);

  // 2. Percentages
  const foodCostPct = safePct(input.cogs, input.revenue);
  const laborCostPct = safePct(input.payroll, input.revenue);
  const primeCostPct = safePct(primeCost, input.revenue);
  const opexPct = safePct(input.opex, input.revenue);
  const otherExpensesPct = safePct(input.other, input.revenue);
  const ebitdaMargin = safePct(ebitda, input.revenue);
  const netMargin = safePct(netProfit, input.revenue);

  // 3. Statuses
  const primeCostStatus = getStatus(primeCostPct, PRIME_COST_THRESHOLDS);
  const foodCostStatus = getStatus(foodCostPct, FOOD_COST_THRESHOLDS);
  const laborCostStatus = getStatus(laborCostPct, LABOR_COST_THRESHOLDS);

  // 4. Validation: Prime Cost double-check (mathematical)
  let primeCostMathValid = true;
  if (finite(primeCostPct) && finite(foodCostPct) && finite(laborCostPct)) {
    const calculated = foodCostPct + laborCostPct;
    if (Math.abs(calculated - primeCostPct) > 0.01) {
      primeCostMathValid = false;
      issues.push({
        type: 'prime_cost_mismatch',
        severity: 'critical',
        message: `Расхождение в расчёте Prime Cost: рассчитано ${calculated.toFixed(2)}%, указано ${primeCostPct.toFixed(2)}%`,
      });
    }
  }

  // 5. Validation: Prime Cost logic (anomaly detection)
  let primeCostLogicValid = true;
  if (finite(primeCostPct)) {
    if (primeCostPct < 30) {
      primeCostLogicValid = false;
      issues.push({
        type: 'prime_cost_anomaly',
        severity: 'warning',
        message: `Prime Cost ${primeCostPct.toFixed(1)}% — возможно, не учтены некоторые расходы`,
      });
    } else if (primeCostPct > 80) {
      primeCostLogicValid = false;
      issues.push({
        type: 'prime_cost_anomaly',
        severity: 'critical',
        message: `Prime Cost ${primeCostPct.toFixed(1)}% — ресторан убыточен, проверьте данные`,
      });
    }
  }

  // 6. Validation: Other expenses > 5%
  const otherExceedsThreshold = finite(otherExpensesPct) && otherExpensesPct > OTHER_EXPENSES_THRESHOLD;
  if (otherExceedsThreshold) {
    issues.push({
      type: 'other_exceeds_threshold',
      severity: 'critical',
      message: `Прочие расходы составляют ${otherExpensesPct.toFixed(1)}% от выручки (лимит 5%). Требуется детализация.`,
    });
  }

  // 7. Validation: Overtime flag
  const overtimeFlagged = finite(input.laborBreakdown?.overtime) && (input.laborBreakdown?.overtime as number) > 0;
  if (overtimeFlagged) {
    issues.push({
      type: 'overtime_detected',
      severity: 'warning',
      message: `Обнаружены переработки: ${(input.laborBreakdown?.overtime as number).toLocaleString('ru-RU')} ₽`,
    });
  }

  // 8. Validation: Missing critical data
  if (!finite(input.revenue)) {
    issues.push({ type: 'missing_data', severity: 'critical', message: 'Отсутствует выручка' });
  }
  if (!finite(input.cogs)) {
    issues.push({ type: 'missing_data', severity: 'warning', message: 'Отсутствует себестоимость (COGS)' });
  }
  if (!finite(input.payroll)) {
    issues.push({ type: 'missing_data', severity: 'warning', message: 'Отсутствует ФОТ' });
  }

  return {
    ...input,
    grossProfit,
    primeCost,
    ebitda,
    netProfit,
    foodCostPct,
    laborCostPct,
    primeCostPct,
    opexPct,
    otherExpensesPct,
    ebitdaMargin,
    netMargin,
    primeCostStatus,
    foodCostStatus,
    laborCostStatus,
    primeCostMathValid,
    primeCostLogicValid,
    otherExceedsThreshold,
    overtimeFlagged,
    validationIssues: issues,
  };
}

// --- Aggregation (for multi-restaurant rollup) ---
export function aggregateFinance(rows: FinanceInput[]): FinanceInput {
  const numericKeys: (keyof FinanceInput)[] = [
    'revenue', 'cogs', 'payroll', 'opex', 'depreciation', 'interest', 'tax', 'other',
  ];

  const out: FinanceInput = {};

  // Sum numeric fields (skip undefined — don't break aggregation)
  for (const key of numericKeys) {
    const values = rows.map(r => r[key]).filter(finite) as number[];
    if (values.length > 0) {
      out[key] = values.reduce((s, v) => s + v, 0);
    }
  }

  // Aggregate breakdowns
  if (rows.some(r => r.cogsBreakdown)) {
    out.cogsBreakdown = aggregateBreakdown<CogsBreakdown>(rows.map(r => r.cogsBreakdown), ['food', 'beverage', 'packaging']);
  }
  if (rows.some(r => r.laborBreakdown)) {
    out.laborBreakdown = aggregateBreakdown<LaborBreakdown>(rows.map(r => r.laborBreakdown), [
      'kitchen', 'service', 'management', 'backOffice', 'overtime', 'taxesContributions',
    ]);
  }
  if (rows.some(r => r.opexBreakdown)) {
    out.opexBreakdown = aggregateBreakdown<OperatingExpenses>(rows.map(r => r.opexBreakdown), [
      'rent', 'utilities', 'marketing', 'supplies', 'equipment', 'insurance', 'licenses', 'bankFees', 'otherOperating',
    ]);
  }

  return out;
}

// Helper for aggregating breakdown objects
function aggregateBreakdown<T extends Record<string, number | undefined>>(
  breakdowns: (T | undefined)[],
  keys: (keyof T)[]
): T {
  const result: Record<string, number> = {};
  for (const key of keys) {
    const values = breakdowns.map(b => b?.[key]).filter(finite) as number[];
    if (values.length > 0) {
      result[key as string] = values.reduce((s, v) => s + v, 0);
    }
  }
  return result as T;
}

// --- Validation helper (for P&L status determination) ---
export function determinePnlStatus(result: FinanceResult): 'draft' | 'requires_review' | 'validated' | 'locked' {
  const hasCriticalIssues = result.validationIssues.some(i => i.severity === 'critical');
  const hasWarningIssues = result.validationIssues.some(i => i.severity === 'warning');

  if (hasCriticalIssues) return 'requires_review';
  if (hasWarningIssues) return 'validated'; // warnings don't block, but should be visible
  return 'validated';
}
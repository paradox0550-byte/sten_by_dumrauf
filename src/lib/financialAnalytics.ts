export type LaborRecord = {
  period?: unknown;
  department?: unknown;
  hours?: unknown;
  amount?: unknown;
};

export type LaborGroup = {
  hours: number;
  amount: number;
};

export type LaborAggregation = {
  groups: Array<[string, LaborGroup]>;
  totalHours: number | undefined;
  totalAmount: number | undefined;
  incompleteCount: number;
  validRecordCount: number;
};

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Ratios are only meaningful when the denominator is strictly positive.
 * A zero/negative denominator must not become Infinity, NaN, or a misleading KPI.
 */
export function safeRatioPercent(numerator: unknown, denominator: unknown): number | undefined {
  const n = finiteNumber(numerator);
  const d = finiteNumber(denominator);
  if (n === undefined || d === undefined || d <= 0) return undefined;
  const result = n / d * 100;
  return Number.isFinite(result) ? result : undefined;
}

/**
 * Aggregate only records with both finite hours and amount. Partial rows are
 * counted separately instead of silently treating missing fields as zero.
 */
export function aggregateLaborRecords(records: LaborRecord[]): LaborAggregation {
  const grouped = new Map<string, LaborGroup>();
  let incompleteCount = 0;
  let validRecordCount = 0;
  let totalHours = 0;
  let totalAmount = 0;

  for (const record of records) {
    const hours = finiteNumber(record.hours);
    const amount = finiteNumber(record.amount);
    if (hours === undefined || amount === undefined || hours < 0) {
      incompleteCount += 1;
      continue;
    }

    const department = typeof record.department === 'string' && record.department.trim()
      ? record.department.trim()
      : 'Без отдела';
    const group = grouped.get(department) ?? { hours: 0, amount: 0 };
    group.hours += hours;
    group.amount += amount;
    grouped.set(department, group);
    totalHours += hours;
    totalAmount += amount;
    validRecordCount += 1;
  }

  const groups = [...grouped.entries()].sort((a, b) => b[1].amount - a[1].amount);
  return {
    groups,
    totalHours: validRecordCount > 0 ? totalHours : undefined,
    totalAmount: validRecordCount > 0 ? totalAmount : undefined,
    incompleteCount,
    validRecordCount,
  };
}

/**
 * STEN P&L convention: expense articles are stored as negative values.
 * EBITDA is therefore the signed sum of revenue, COGS, payroll and OPEX.
 * Do not subtract negative expenses a second time.
 */
export function calculateSignedEbitda(
  revenue: unknown,
  cogs: unknown,
  payroll: unknown,
  opex: unknown,
): number | undefined {
  const values = [revenue, cogs, payroll, opex].map(finiteNumber);
  if (values.some((value) => value === undefined)) return undefined;
  const total = (values as number[]).reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? total : undefined;
}

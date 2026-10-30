import { LaborPlanRowSchema, type LaborBudgetSummary, type LaborPlanRow, type MetricValue } from './schema';

type Total = { value: number | null; complete: boolean; reasons: string[] };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function hoursOf(row: LaborPlanRow): number | null {
  if (row.recordType === 'period_salary') return null;
  if (row.hours != null) return row.hours;
  if (!row.startTime || !row.endTime) return null;
  const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  let end = minutes(row.endTime); const start = minutes(row.startTime);
  if (end <= start) end += 1440;
  const hours = (end - start) / 60;
  return hours > 0 && Number.isFinite(hours) ? hours : null;
}

function costOf(row: LaborPlanRow): { value: number | null; reason?: string } {
  const h = hoursOf(row); const p = row.pay;
  if (row.recordType === 'period_salary') {
    if (p.model !== 'monthly_salary' || p.monthlySalary == null) return { value: null, reason: 'Для строки оклада за период нужна подтверждённая месячная зарплата.' };
    return { value: p.monthlySalary + (p.approvedAllowances ?? 0) };
  }
  if (p.model === 'hourly') {
    if (h == null) return { value: null, reason: 'Не определены часы смены.' };
    if (p.hourlyRate == null) return { value: null, reason: 'Не указана подтверждённая почасовая ставка.' };
    return { value: h * p.hourlyRate + (p.approvedAllowances ?? 0) };
  }
  if (p.model === 'per_shift') {
    if (p.shiftRate == null) return { value: null, reason: 'Не указана подтверждённая ставка за смену.' };
    return { value: p.shiftRate + (p.approvedAllowances ?? 0) };
  }
  if (p.monthlySalary == null) return { value: null, reason: 'Не указана подтверждённая месячная зарплата.' };
  return { value: null, reason: 'Месячный оклад нельзя распределить по сменам без утверждённого правила или отдельной строки оклада за период.' };
}

function sumHours(rows: LaborPlanRow[]): Total {
  const shiftRows = rows.filter(row => row.recordType !== 'period_salary');
  if (!shiftRows.length) return { value: null, complete: false, reasons: ['Нет смен за выбранный период.'] };
  let sum = 0; const reasons: string[] = [];
  for (const row of shiftRows) { const h = hoursOf(row); if (h == null) reasons.push(`Не определены часы: ${row.positionName}, ${row.businessDate}.`); else sum += h; }
  return { value: reasons.length ? null : sum, complete: reasons.length === 0, reasons };
}
function sumCost(rows: LaborPlanRow[]): Total {
  if (!rows.length) return { value: null, complete: false, reasons: ['Нет строк за выбранный период.'] };
  let sum = 0; const reasons: string[] = [];
  for (const row of rows) { const result = costOf(row); if (result.value == null) reasons.push(result.reason ?? 'Стоимость не определена.'); else sum += result.value; }
  return { value: reasons.length ? null : sum, complete: reasons.length === 0, reasons };
}
function metric(value: number | null, complete: boolean, reasons: string[], currency?: string): MetricValue {
  return { value: value == null ? null : round(value), status: value == null ? 'unavailable' : complete ? 'complete' : 'partial', reasons: [...new Set(reasons)], ...(currency ? { currency } : {}) };
}
function variance(plan: Total, actual: Total, currency?: string): MetricValue {
  if (plan.value == null || actual.value == null) return metric(null, false, [...plan.reasons, ...actual.reasons, 'Отклонение не рассчитывается без полного плана и факта.'], currency);
  return metric(actual.value - plan.value, plan.complete && actual.complete, [...plan.reasons, ...actual.reasons], currency);
}

/** Budget-first calculation: does not require sales or a POS-specific report. */
export function calculateLaborBudget(input: { rows: unknown[]; periodStart: string; periodEnd: string; currency?: string }): LaborBudgetSummary {
  const currency = input.currency ?? 'RUB';
  const parsed = input.rows.map(row => LaborPlanRowSchema.safeParse(row));
  const valid = parsed.flatMap(result => result.success ? [result.data] : []);
  const inPeriod = valid.filter(row => row.businessDate >= input.periodStart && row.businessDate <= input.periodEnd);
  const excludedRows = input.rows.length - inPeriod.length;
  const plan = inPeriod.filter(row => row.status === 'budget' || row.status === 'planned');
  const actual = inPeriod.filter(row => row.status === 'actual');
  const ph = sumHours(plan), ah = sumHours(actual), pc = sumCost(plan), ac = sumCost(actual);
  const positions = [...new Set(inPeriod.map(row => row.positionName))].sort((a, b) => a.localeCompare(b, 'ru'));
  const byPosition = positions.map(positionName => {
    const p = plan.filter(row => row.positionName === positionName), a = actual.filter(row => row.positionName === positionName);
    const pHours = sumHours(p), aHours = sumHours(a), pCost = sumCost(p), aCost = sumCost(a);
    return { positionName, plannedHours: metric(pHours.value, pHours.complete, pHours.reasons), actualHours: metric(aHours.value, aHours.complete, aHours.reasons), plannedCost: metric(pCost.value, pCost.complete, pCost.reasons, currency), actualCost: metric(aCost.value, aCost.complete, aCost.reasons, currency) };
  });
  return {
    periodStart: input.periodStart, periodEnd: input.periodEnd, currency,
    plannedHours: metric(ph.value, ph.complete, ph.reasons), actualHours: metric(ah.value, ah.complete, ah.reasons),
    hoursVariance: variance(ph, ah), plannedCost: metric(pc.value, pc.complete, pc.reasons, currency), actualCost: metric(ac.value, ac.complete, ac.reasons, currency),
    costVariance: variance(pc, ac, currency), includedRows: inPeriod.length, excludedRows, byPosition,
  };
}

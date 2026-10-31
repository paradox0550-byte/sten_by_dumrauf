import type { SalesLine, ShiftLine } from '../imports/schema';
import type { LaborConfiguration } from '../roles/schema';

export type LaborCalcResult = {
  status: 'complete' | 'partial' | 'unavailable';
  reasons: string[];
  actualHours: number;
  requiredHours: number | null;
  excessHours: number | null;
  actualLaborCost: number | null;
  excessLaborCost: number | null;
  byZone: Array<{ zoneId: string; actualHours: number; requiredHours: number | null; excessHours: number | null }>;
  byHourZone: Array<{ date: string; hour: number; zoneId: string; actualHours: number | null; requiredHours: number | null; excessHours: number | null }>;
  byRole: Array<{ positionName: string; actualHours: number; minimumHours: number; coverageGapHours: number }>;
};

export function calculateLabor(input: {
  sales: SalesLine[];
  shifts: ShiftLine[];
  config: LaborConfiguration;
}): LaborCalcResult {
  const reasons: string[] = [];
  if (!input.sales.length) reasons.push('Нет подтверждённых почасовых продаж.');
  if (!input.shifts.length) reasons.push('Нет подтверждённого табеля или графика.');
  if (!input.config.roles.length) reasons.push('Не настроены паспорта должностей.');
  if (!input.sales.every(line => line.effortUnits != null)) reasons.push('Не заданы коэффициенты трудоёмкости блюд или групп.');
  if (!input.config.zoneDemandNorms.length || input.config.zoneDemandNorms.some(norm => norm.unitsPerLaborHour == null)) {
    reasons.push('Не заданы нормы производительности по зонам.');
  }
  if (reasons.length && (!input.sales.length || !input.shifts.length)) return emptyResult(reasons);

  const demandNorms = new Map(input.config.zoneDemandNorms.map(norm => [norm.zoneId, norm.unitsPerLaborHour]));
  const requiredByZone = new Map<string, number>();
  const requiredByHourZone = new Map<string, { date: string; hour: number; zoneId: string; hours: number }>();
  for (const sale of input.sales) {
    if (!sale.zoneId || sale.effortUnits == null) continue;
    const unitsPerHour = demandNorms.get(sale.zoneId);
    if (unitsPerHour == null) continue;
    const required = sale.effortUnits / unitsPerHour;
    requiredByZone.set(sale.zoneId, (requiredByZone.get(sale.zoneId) ?? 0) + required);
    const key = [sale.businessDate, sale.hour, sale.zoneId].join('|');
    const bucket = requiredByHourZone.get(key) ?? { date: sale.businessDate, hour: sale.hour, zoneId: sale.zoneId, hours: 0 };
    bucket.hours += required;
    requiredByHourZone.set(key, bucket);
  }

  const actualByZone = new Map<string, number>();
  const actualByHourZone = new Map<string, number>();
  const actualByRole = new Map<string, number>();
  let actualHours = 0;
  let knownCost = 0;
  let costKnown = true;
  let hourlyActualComplete = true;

  for (const shift of input.shifts) {
    actualHours += shift.hours;
    const role = input.config.roles.find(item => item.positionName.toLocaleLowerCase('ru-RU') === shift.positionName.toLocaleLowerCase('ru-RU'));
    const zone = shift.zoneId ?? role?.zoneIds[0];
    if (zone) actualByZone.set(zone, (actualByZone.get(zone) ?? 0) + shift.hours);
    actualByRole.set(shift.positionName, (actualByRole.get(shift.positionName) ?? 0) + shift.hours);
    const rate = shift.hourlyRate ?? role?.hourlyRate ?? null;
    if (rate == null) costKnown = false;
    else knownCost += shift.hours * rate;

    if (!zone || !shift.startTime || !shift.endTime) {
      hourlyActualComplete = false;
      continue;
    }
    const start = toMinutes(shift.startTime);
    let end = toMinutes(shift.endTime);
    if (end <= start) end += 24 * 60;
    const interval = end - start;
    if (interval <= 0) { hourlyActualComplete = false; continue; }
    const scale = shift.hours / interval;
    for (let minute = start; minute < end;) {
      const hourIndex = Math.floor(minute / 60);
      const nextBoundary = (hourIndex + 1) * 60;
      const overlap = Math.min(end, nextBoundary) - minute;
      const date = addDays(shift.businessDate, Math.floor(hourIndex / 24));
      const hour = hourIndex % 24;
      const key = [date, hour, zone].join('|');
      actualByHourZone.set(key, (actualByHourZone.get(key) ?? 0) + overlap * scale);
      minute += overlap;
    }
  }

  const byZone = [...new Set([...actualByZone.keys(), ...requiredByZone.keys()])].sort().map(zoneId => {
    const actual = actualByZone.get(zoneId) ?? 0;
    const required = requiredByZone.get(zoneId);
    return { zoneId, actualHours: round(actual), requiredHours: required == null ? null : round(required),
      excessHours: required == null ? null : round(Math.max(0, actual - required)) };
  });
  const hourlyKeys = new Set([...requiredByHourZone.keys(), ...actualByHourZone.keys()]);
  const byHourZone = [...hourlyKeys].sort((left, right) => {
    const [leftDate, leftHour, leftZone] = left.split('|');
    const [rightDate, rightHour, rightZone] = right.split('|');
    return leftDate.localeCompare(rightDate) || Number(leftHour) - Number(rightHour) || leftZone.localeCompare(rightZone);
  }).map(key => {
    const [date, hourText, zoneId] = key.split('|');
    const actual = hourlyActualComplete ? actualByHourZone.get(key) ?? 0 : null;
    const required = requiredByHourZone.get(key)?.hours;
    return { date, hour: Number(hourText), zoneId, actualHours: actual == null ? null : round(actual),
      requiredHours: required == null ? null : round(required),
      excessHours: actual == null || required == null ? null : round(Math.max(0, actual - required)) };
  });
  const byRole = [...actualByRole.entries()].map(([positionName, hours]) => {
    const minimumHours = input.config.coverageMinHoursByRole[positionName] ?? 0;
    return { positionName, actualHours: round(hours), minimumHours: round(minimumHours),
      coverageGapHours: round(Math.max(0, minimumHours - hours)) };
  });

  const allNormsKnown = input.sales.every(line => line.zoneId != null && line.effortUnits != null && demandNorms.get(line.zoneId) != null);
  const requiredHours = allNormsKnown ? round([...requiredByZone.values()].reduce((sum, value) => sum + value, 0)) : null;
  const excessHours = requiredHours == null ? null : round(byZone.reduce((sum, zone) => sum + (zone.excessHours ?? 0), 0));
  const actualLaborCost = costKnown ? round(knownCost) : null;
  const knownRates = input.shifts.map(shift => shift.hourlyRate ?? input.config.roles.find(item =>
    item.positionName.toLocaleLowerCase('ru-RU') === shift.positionName.toLocaleLowerCase('ru-RU'))?.hourlyRate ?? null);
  const uniformKnownRate = knownRates.length > 0 && knownRates.every(rate => rate != null && rate === knownRates[0]);
  const excessLaborCost = uniformKnownRate && excessHours != null ? round(excessHours * knownRates[0]!) : null;
  if (!hourlyActualComplete) reasons.push('Нет времени начала и окончания у всех смен: почасовое сравнение факта недоступно.');
  return {
    status: reasons.length ? 'partial' : 'complete', reasons, actualHours: round(actualHours), requiredHours,
    excessHours, actualLaborCost, excessLaborCost, byZone, byHourZone, byRole,
  };
}

function emptyResult(reasons: string[]): LaborCalcResult {
  return { status: 'unavailable', reasons, actualHours: 0, requiredHours: null, excessHours: null,
    actualLaborCost: null, excessLaborCost: null, byZone: [], byHourZone: [], byRole: [] };
}
function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

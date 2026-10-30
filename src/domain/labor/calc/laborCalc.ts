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
  byRole: Array<{ positionName: string; actualHours: number; minimumHours: number; excessHours: number }>;
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
  if (reasons.length && (!input.sales.length || !input.shifts.length)) {
    return emptyResult('unavailable', reasons);
  }

  const demandNorms = new Map(input.config.zoneDemandNorms.map(norm => [norm.zoneId, norm.unitsPerLaborHour]));
  const requiredByZone = new Map<string, number>();
  for (const sale of input.sales) {
    if (!sale.zoneId || sale.effortUnits == null) continue;
    const unitsPerHour = demandNorms.get(sale.zoneId);
    if (unitsPerHour == null) continue;
    requiredByZone.set(sale.zoneId, (requiredByZone.get(sale.zoneId) ?? 0) + sale.effortUnits / unitsPerHour);
  }

  const actualByZone = new Map<string, number>();
  const actualByRole = new Map<string, number>();
  let actualHours = 0;
  let knownCost = 0;
  let costKnown = true;
  for (const shift of input.shifts) {
    actualHours += shift.hours;
    const role = input.config.roles.find(item => item.positionName.toLocaleLowerCase('ru-RU') === shift.positionName.toLocaleLowerCase('ru-RU'));
    const zone = shift.zoneId ?? role?.zoneIds[0];
    if (zone) actualByZone.set(zone, (actualByZone.get(zone) ?? 0) + shift.hours);
    actualByRole.set(shift.positionName, (actualByRole.get(shift.positionName) ?? 0) + shift.hours);
    const rate = shift.hourlyRate ?? role?.hourlyRate ?? null;
    if (rate == null) costKnown = false;
    else knownCost += shift.hours * rate;
  }

  const byZone = [...new Set([...actualByZone.keys(), ...requiredByZone.keys()])].sort().map(zoneId => {
    const actual = actualByZone.get(zoneId) ?? 0;
    const required = requiredByZone.get(zoneId);
    return { zoneId, actualHours: round(actual), requiredHours: required == null ? null : round(required),
      excessHours: required == null ? null : round(Math.max(0, actual - required)) };
  });
  const byRole = [...actualByRole.entries()].map(([positionName, hours]) => {
    const minimumHours = input.config.coverageMinHoursByRole[positionName] ?? 0;
    return { positionName, actualHours: round(hours), minimumHours: round(minimumHours), excessHours: round(Math.max(0, hours - minimumHours)) };
  });
  const allNormsKnown = input.sales.every(line => line.zoneId != null && line.effortUnits != null && demandNorms.get(line.zoneId) != null);
  const requiredHours = allNormsKnown ? round([...requiredByZone.values()].reduce((sum, value) => sum + value, 0)) : null;
  const excessHours = requiredHours == null ? null : round(byZone.reduce((sum, zone) => sum + (zone.excessHours ?? 0), 0));
  const actualLaborCost = costKnown ? round(knownCost) : null;
  const excessLaborCost = actualLaborCost == null || excessHours == null || actualHours === 0
    ? null : round(actualLaborCost * excessHours / actualHours);
  return {
    status: reasons.length ? 'partial' : 'complete', reasons, actualHours: round(actualHours), requiredHours,
    excessHours, actualLaborCost, excessLaborCost, byZone, byRole,
  };
}

function emptyResult(status: 'unavailable', reasons: string[]): LaborCalcResult {
  return { status, reasons, actualHours: 0, requiredHours: null, excessHours: null, actualLaborCost: null,
    excessLaborCost: null, byZone: [], byRole: [] };
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

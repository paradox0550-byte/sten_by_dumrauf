import type { ForecastCell } from './demandForecast';

export type StaffingDemandSlot = {
  weekday: number;
  hour: number;
  zoneId: string;
  workloadUnits: number;
  requiredLaborHours: number | null;
  requiredPeople: number | null;
  status: 'calculated' | 'missing_productivity_norm';
};

/**
 * This is a demand draft, not an employee roster. It intentionally does not assign
 * named employees or override minimum coverage / availability constraints.
 */
export function recommendHourlyStaffing(
  forecast: ForecastCell[],
  productivityUnitsPerHourByZone: Readonly<Record<string, number | null>>,
): StaffingDemandSlot[] {
  return forecast.map(cell => {
    const productivity = productivityUnitsPerHourByZone[cell.zoneId];
    if (productivity == null || !Number.isFinite(productivity) || productivity <= 0) {
      return { weekday: cell.weekday, hour: cell.hour, zoneId: cell.zoneId, workloadUnits: cell.units,
        requiredLaborHours: null, requiredPeople: null, status: 'missing_productivity_norm' };
    }
    const requiredLaborHours = cell.units / productivity;
    return { weekday: cell.weekday, hour: cell.hour, zoneId: cell.zoneId, workloadUnits: cell.units,
      requiredLaborHours: round(requiredLaborHours), requiredPeople: Math.ceil(requiredLaborHours),
      status: 'calculated' };
  });
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

import type { SalesLine } from '../imports/schema';

export type HourlyDemand = { weekday: number; hour: number; zoneId: string; units: number };
export type ForecastCell = HourlyDemand & { confidence: 'sufficient' | 'limited' };

export function forecastHourlyDemand(
  sales: SalesLine[],
  options: { asOf?: string; minimumWeeks?: number; historyWeeks?: number } = {},
): { status: 'ready' | 'insufficient_data'; reason: string | null; cells: ForecastCell[] } {
  const minimumWeeks = options.minimumWeeks ?? 4;
  const historyWeeks = options.historyWeeks ?? 8;
  const dates = [...new Set(sales.map(line => line.businessDate))].sort();
  if (!dates.length) return { status: 'insufficient_data', reason: 'Нет истории продаж для прогноза.', cells: [] };
  const latest = options.asOf ?? dates[dates.length - 1];
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - historyWeeks * 7);
  const from = cutoff.toISOString().slice(0, 10);
  const history = sales.filter(line => line.businessDate >= from && line.businessDate <= latest && line.zoneId && line.effortUnits != null);
  const uniqueWeeks = new Set(history.map(line => {
    const date = new Date(`${line.businessDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }));
  if (uniqueWeeks.size < minimumWeeks) {
    return { status: 'insufficient_data', reason: `Для прогноза нужно минимум ${minimumWeeks} календарных недель истории с трудоёмкостью блюд по зонам.`, cells: [] };
  }

  // First sum all items for each actual trading date and hour, then take the median
  // of comparable weekday/hour/zone observations. This prevents a busy outlier day
  // from dominating the schedule forecast.
  const daily = new Map<string, { weekday: number; hour: number; zoneId: string; units: number }>();
  for (const line of history) {
    const weekday = new Date(`${line.businessDate}T00:00:00Z`).getUTCDay();
    const key = [line.businessDate, line.hour, line.zoneId].join('|');
    const bucket = daily.get(key) ?? { weekday, hour: line.hour, zoneId: line.zoneId!, units: 0 };
    bucket.units += line.effortUnits!;
    daily.set(key, bucket);
  }
  const observations = new Map<string, { weekday: number; hour: number; zoneId: string; values: number[] }>();
  for (const bucket of daily.values()) {
    const key = [bucket.weekday, bucket.hour, bucket.zoneId].join('|');
    const target = observations.get(key) ?? { weekday: bucket.weekday, hour: bucket.hour, zoneId: bucket.zoneId, values: [] };
    target.values.push(bucket.units);
    observations.set(key, target);
  }
  const cells = [...observations.values()].map(bucket => ({
    weekday: bucket.weekday,
    hour: bucket.hour,
    zoneId: bucket.zoneId,
    units: median(bucket.values),
    confidence: bucket.values.length >= 4 ? 'sufficient' as const : 'limited' as const,
  })).sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.zoneId.localeCompare(b.zoneId));
  return { status: 'ready', reason: null, cells };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

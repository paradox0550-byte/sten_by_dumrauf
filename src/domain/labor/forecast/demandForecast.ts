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
    return { status: 'insufficient_data', reason: `Для прогноза нужно минимум ${minimumWeeks} полных недель истории с трудоёмкостью блюд по зонам.`, cells: [] };
  }
  const buckets = new Map<string, { total: number; days: Set<string> }>();
  for (const line of history) {
    const date = new Date(`${line.businessDate}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const key = [weekday, line.hour, line.zoneId].join('|');
    const bucket = buckets.get(key) ?? { total: 0, days: new Set<string>() };
    bucket.total += line.effortUnits!;
    bucket.days.add(line.businessDate);
    buckets.set(key, bucket);
  }
  const cells = [...buckets.entries()].map(([key, bucket]) => {
    const [weekday, hour, zoneId] = key.split('|');
    return { weekday: Number(weekday), hour: Number(hour), zoneId, units: round(bucket.total / bucket.days.size),
      confidence: bucket.days.size >= 4 ? 'sufficient' as const : 'limited' as const };
  }).sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.zoneId.localeCompare(b.zoneId));
  return { status: 'ready', reason: null, cells };
}
function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

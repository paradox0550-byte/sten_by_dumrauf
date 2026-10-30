import type { IikoParsedSales, ZoneId } from './schema';

export type HourlyZone = {
  date: string;
  hour: number;
  zone: Exclude<ZoneId, 'unknown'>;
  dishes: number;
  revenue: number;
};

export function aggregateByHourZone(sales: IikoParsedSales): HourlyZone[] {
  const buckets = new Map<string, HourlyZone>();
  for (const row of sales) {
    if (row.zone === 'unknown') continue;
    const key = [row.date, row.hour, row.zone].join('|');
    const bucket = buckets.get(key) ?? { date: row.date, hour: row.hour, zone: row.zone, dishes: 0, revenue: 0 };
    bucket.dishes += row.qty;
    bucket.revenue += row.revenue;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map(bucket => ({ ...bucket, dishes: round(bucket.dishes, 3), revenue: round(bucket.revenue, 2) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour || a.zone.localeCompare(b.zone));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

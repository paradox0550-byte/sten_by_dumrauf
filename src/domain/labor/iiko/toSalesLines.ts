import type { IikoParsedSales } from './schema';
import type { SalesLine } from '../imports/schema';
import { SalesLineSchema } from '../imports/schema';

export type IikoEffortMap = Readonly<Record<string, number>>;

/**
 * Converts the first supported source format into STEN's canonical sales contract.
 * Effort coefficients are explicit user configuration; quantity is never silently
 * treated as labor effort.
 */
export function iikoRowsToSalesLines(rows: IikoParsedSales, effortByDishOrCategory: IikoEffortMap = {}): SalesLine[] {
  return rows.map((row, index) => {
    const effortCoefficient = effortByDishOrCategory[row.dish] ?? effortByDishOrCategory[row.category] ?? null;
    return SalesLineSchema.parse({
      businessDate: row.date,
      hour: row.hour,
      itemName: row.dish,
      categoryName: row.category,
      zoneId: row.zone === 'unknown' ? null : row.zone,
      quantity: row.qty,
      revenue: row.revenue,
      effortUnits: effortCoefficient == null ? null : row.qty * effortCoefficient,
      sourceRow: index + 2,
    });
  });
}

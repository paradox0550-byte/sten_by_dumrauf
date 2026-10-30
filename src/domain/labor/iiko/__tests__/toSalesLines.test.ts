import { describe, expect, it } from 'vitest';
import { iikoRowsToSalesLines } from '../toSalesLines';
import type { IikoParsedSales } from '../schema';

const rows: IikoParsedSales = [{
  date: '2026-10-27', hour: 19, dish: 'Паста', category: 'Паста', qty: 2, revenue: 1200, zone: 'hot',
}];

describe('iikoRowsToSalesLines', () => {
  it('converts to the canonical contract without treating quantity as labor effort', () => {
    const result = iikoRowsToSalesLines(rows);
    expect(result[0]).toMatchObject({ businessDate: '2026-10-27', quantity: 2, revenue: 1200, zoneId: 'hot', effortUnits: null });
  });

  it('applies explicit dish-level effort before category-level effort', () => {
    const result = iikoRowsToSalesLines(rows, { Паста: 1.5 });
    expect(result[0].effortUnits).toBe(3);
  });
});

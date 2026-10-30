import { describe, expect, it } from 'vitest';
import { forecastHourlyDemand } from '../demandForecast';
import { recommendHourlyStaffing } from '../recommendSchedule';
import type { SalesLine } from '../../imports/schema';

function weeklySales(): SalesLine[] {
  const rows: SalesLine[] = [];
  for (let week = 0; week < 5; week += 1) {
    const date = new Date(Date.UTC(2026, 8, 28 + week * 7));
    const businessDate = date.toISOString().slice(0, 10);
    rows.push({ businessDate, hour: 19, itemName: 'Паста', categoryName: 'Паста', zoneId: 'hot',
      quantity: 10, revenue: 5000, effortUnits: 20 });
  }
  return rows;
}

describe('forecastHourlyDemand', () => {
  it('requires enough history and forecasts weekday/hour/zone averages', () => {
    expect(forecastHourlyDemand(weeklySales().slice(0, 2)).status).toBe('insufficient_data');
    const result = forecastHourlyDemand(weeklySales(), { asOf: '2026-10-26', minimumWeeks: 4 });
    expect(result.status).toBe('ready');
    expect(result.cells[0]).toMatchObject({ hour: 19, zoneId: 'hot', units: 20 });
  });

  it('does not invent headcount without a productivity norm', () => {
    const result = forecastHourlyDemand(weeklySales(), { asOf: '2026-10-26', minimumWeeks: 4 });
    const slots = recommendHourlyStaffing(result.cells, { hot: null });
    expect(slots[0].requiredPeople).toBeNull();
    expect(slots[0].status).toBe('missing_productivity_norm');
  });
});

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePowerBiHourlyFile } from '../actualReports';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Power BI');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parsePowerBiHourlyFile', () => {
  it('reads hourly rows with blank repeated date cells and skips daily/payment totals', async () => {
    const result = await parsePowerBiHourlyFile(workbookBuffer([
      ['Название ресторана: Тестовый ресторан'],
      ['Период: с 01.10.2026 по 31.10.2026'],
      [],
      [],
      ['Учетный день', 'Час открытия', 'Сумма со скидкой, р.', 'Количество блюд', 'Чеков', 'Себестоимость, р.'],
      [new Date(2026, 9, 1), '12', 1200, 4, 3, 350],
      [null, '13', 2400, 7, 5, 700],
      ['01.10.2026 всего', null, 3600, 11, 8, 1050],
      ['Оплата Сбербанк всего', null, 3600, 11, 8, 1050],
      ['Тестовый ресторан всего', null, 3600, 11, 8, 1050],
    ]));
    expect(result.restaurant).toBe('Тестовый ресторан');
    expect(result.periodStart).toBe('2026-10-01');
    expect(result.periodEnd).toBe('2026-10-31');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(row => row.hour)).toEqual([12, 13]);
    expect(result.rows[1]).toMatchObject({ date: '2026-10-01', revenue: 2400, dishes: 7, checks: 5 });
    expect(result.skippedRows).toBe(3);
  });

  it('rejects unrelated spreadsheets with a clear error', async () => {
    await expect(parsePowerBiHourlyFile(workbookBuffer([['Name', 'Amount'], ['Dish', 100]])))
      .rejects.toThrow('не поддерживаемый Power BI');
  });
});

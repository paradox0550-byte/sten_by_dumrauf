import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { aggregateByHourZone } from '../aggregate';
import { parseIikoSalesFile } from '../parse';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Продажи');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
const headers = ['Дата', 'Час', 'Наименование', 'Категория', 'Количество', 'Сумма'];

describe('parseIikoSalesFile', () => {
  it('validates and aggregates by date, hour and zone', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      headers,
      ['2026-10-27', 19, 'Паста', 'Паста', 2, 1200],
      ['2026-10-27', 19, 'Суп', 'Супы', 1, 500],
    ]));
    expect(result.report.invalidRows).toBe(0);
    expect(result.data).toHaveLength(2);
    expect(aggregateByHourZone(result.data)).toEqual([
      { date: '2026-10-27', hour: 19, zone: 'hot', dishes: 3, revenue: 1700 },
    ]);
  });

  it('keeps unknown categories outside calculation data', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      headers, ['2026-10-27', 19, 'Новое блюдо', 'Новая категория', 2, 900],
    ]));
    expect(result.data).toHaveLength(0);
    expect(result.unmappedData).toHaveLength(1);
    expect(result.report.unmappedCategories[0]).toMatchObject({ rows: 1, revenue: 900 });
  });

  it('reports invalid rows and continues parsing', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      headers,
      ['2026-10-27', 19, 'Паста', 'Паста', 1, 500],
      ['не дата', 29, '', 'Паста', -1, 'ошибка'],
    ]));
    expect(result.report.invalidRows).toBe(1);
    expect(result.report.errors[0].row).toBe(3);
    expect(result.data).toHaveLength(1);
  });

  it('gives custom mappings priority over defaults', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      headers, ['2026-10-27', 19, 'Десерт', 'Десерты', 1, 300],
    ]), { customZoneMap: { 'Десерты': 'hot' } });
    expect(result.data[0].zone).toBe('hot');
  });

  it('supports iiko OLAP aliases and Russian date and numeric formats', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      ['Учетный день', 'Час закрытия', 'Блюдо', 'Категория номенклатуры', 'Количество блюд', 'Сумма со скидкой, р.'],
      ['27.10.2026', '19', 'Паста', 'Паста', '2,5', '1 200,50'],
    ]));
    expect(result.data[0]).toMatchObject({ date: '2026-10-27', hour: 19, qty: 2.5, revenue: 1200.5 });
  });

  it('skips modifier rows and subtotal rows', async () => {
    const result = await parseIikoSalesFile(workbookBuffer([
      [...headers, 'Модификатор'],
      ['2026-10-27', 19, 'Паста', 'Паста', 1, 500, 'Без лука'],
      ['Итого', null, null, null, 1, 500, null],
      ['2026-10-27', 20, 'Суп', 'Супы', 1, 300, null],
    ]));
    expect(result.data).toHaveLength(1);
    expect(result.report.skippedRows).toBe(2);
  });
});

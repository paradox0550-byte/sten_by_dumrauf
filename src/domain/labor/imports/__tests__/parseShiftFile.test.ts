import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseShiftFile } from '../parseShiftFile';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Табель');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseShiftFile', () => {
  it('parses Russian headers, dates, hours and optional rates', async () => {
    const result = await parseShiftFile(workbookBuffer([
      ['Дата смены', 'Сотрудник', 'Должность', 'Отработано часов', 'Ставка в час', 'Зона'],
      ['27.10.2026', 'Иванов И.И.', 'Повар', '12,5', '450', 'hot'],
    ]));
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ businessDate: '2026-10-27', hours: 12.5, hourlyRate: 450, zoneId: 'hot' });
    expect(result.report.rejectedRows).toBe(0);
  });

  it('rejects incomplete rows instead of converting missing hours to zero', async () => {
    const result = await parseShiftFile(workbookBuffer([
      ['Дата', 'Сотрудник', 'Должность', 'Часы'],
      ['27.10.2026', 'Иванов И.И.', 'Повар', null],
    ]));
    expect(result.data).toHaveLength(0);
    expect(result.report.rejectedRows).toBe(1);
  });

  it('fails clearly when required columns are missing', async () => {
    await expect(parseShiftFile(workbookBuffer([['Сотрудник', 'Часы']]))).rejects.toThrow('Не найдены обязательные поля');
  });
});

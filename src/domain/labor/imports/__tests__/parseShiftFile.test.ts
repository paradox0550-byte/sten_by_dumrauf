import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseShiftFile } from '../parseShiftFile';
import { parseScheduleCell } from '../parseScheduleMatrix';

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

  it('imports matrix schedules through the same canonical shift parser', async () => {
    const result = await parseShiftFile(workbookBuffer([
      ['Сотрудник', 'Должность', '01.10.2026', '02.10.2026'],
      ['Иванов И.И.', 'Повар', 8, '20:00–04:00'],
    ]));
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ businessDate: '2026-10-01', hours: 8, positionName: 'Повар' });
    expect(result.data[1]).toMatchObject({ businessDate: '2026-10-02', hours: 8, startTime: '20:00', endTime: '04:00' });
  });

  it('uses one shared cell parser for hours, shifts, days off and salary markers', () => {
    expect(parseScheduleCell('12 ч')).toMatchObject({ kind: 'hours', hours: 12 });
    expect(parseScheduleCell('Смена')).toMatchObject({ kind: 'shift', hours: 12 });
    expect(parseScheduleCell('В')).toMatchObject({ kind: 'dayOff' });
    expect(parseScheduleCell('Оклад')).toMatchObject({ kind: 'salary' });
    expect(parseScheduleCell('непонятно')).toMatchObject({ kind: 'unknown', raw: 'непонятно' });
  });

  it('keeps matrix shift markers as standard shift hours and skips day-off/salary markers in shift-line export', async () => {
    const result = await parseShiftFile(workbookBuffer([
      ['Сотрудник', 'Должность', '01.10.2026', '02.10.2026', '03.10.2026'],
      ['Иванов И.И.', 'Повар', 'Смена', 'В', 'Оклад'],
    ]));
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ businessDate: '2026-10-01', hours: 12, positionName: 'Повар' });
  });

  it('fails clearly when required columns are missing', async () => {
    await expect(parseShiftFile(workbookBuffer([['Сотрудник', 'Часы']]))).rejects.toThrow('Не найдены обязательные поля');
  });
});

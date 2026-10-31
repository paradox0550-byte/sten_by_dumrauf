import { describe, expect, it } from 'vitest';
import {
  buildPnlImportRows,
  detectPnlHeaderRow,
  guessPnlColumns,
  parsePnlAmount,
  parsePnlWorkbook,
  type PnlExcelSheet,
} from './pnlExcelImport';

describe('P&L Excel import', () => {
  it.each([
    ['1 234,56 ₽', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['(2 500,00)', -2500],
    ['−150,5', -150.5],
    [0, 0],
    ['—', null],
    ['#VALUE!', null],
  ])('parses financial amount %s', (input, expected) => {
    expect(parsePnlAmount(input)).toBe(expected);
  });

  it('detects a header after report metadata and guesses columns without assuming their order', () => {
    const matrix = [
      ['Отчёт по ресторану'],
      ['Период', 'Октябрь 2026'],
      ['Факт, руб.', 'Статья затрат', 'План, руб.'],
      [120000, 'Выручка', 150000],
    ];
    expect(detectPnlHeaderRow(matrix)).toBe(2);
    expect(guessPnlColumns(matrix[2])).toEqual({ article: 1, plan: 2, fact: 0 });
  });

  it('preserves original article labels and excludes totals to prevent double counting', () => {
    const sheet: PnlExcelSheet = {
      name: 'P&L',
      headerRow: 0,
      formulaCells: {},
      rows: [
        ['Статья', 'План', 'Факт'],
        ['Аренда помещения', '120 000,00', 125000],
        ['Коммунальные услуги', 18000, 19500],
        ['Итого расходы', 138000, 144500],
      ],
    };
    const rows = buildPnlImportRows(sheet, 0, { article: 0, plan: 1, fact: 2 });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ article: 'Аренда помещения', plan: 120000, fact: 125000, skipped: false });
    expect(rows[1].article).toBe('Коммунальные услуги');
    expect(rows[2]).toMatchObject({ article: 'Итого расходы', skipped: true });
    expect(rows[2].warnings).toContain('Похоже на итоговую строку — исключена из импорта во избежание двойного счёта');
  });

  it('warns when a formula has no cached result instead of turning it into zero', () => {
    const sheet: PnlExcelSheet = {
      name: 'P&L',
      headerRow: 0,
      rows: [['Статья', 'План', 'Факт'], ['Аренда', null, 5000]],
      formulaCells: { B2: { formula: 'SUM(B3:B8)', hasCachedValue: false } },
    };
    const rows = buildPnlImportRows(sheet, 0, { article: 0, plan: 1, fact: 2 });
    expect(rows[0].plan).toBeNull();
    expect(rows[0].warnings).toContain('Формула План не содержит сохранённого результата');
  });

  it('reads all workbook sheets and records formula metadata', () => {
    const XLSX = require('xlsx') as typeof import('xlsx');
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Статья', 'План', 'Факт'],
      ['Выручка', 100, 90],
      ['Аренда', { t: 'n', f: 'B2*0.1' }, 10],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'P&L');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Комментарий'], ['Пример']]), 'Notes');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const parsed = parsePnlWorkbook(data);
    expect(parsed.sheets.map(sheet => sheet.name)).toEqual(['P&L', 'Notes']);
    expect(parsed.sheets[0].formulaCells.B3).toMatchObject({ formula: 'B2*0.1', hasCachedValue: false });
  });
});

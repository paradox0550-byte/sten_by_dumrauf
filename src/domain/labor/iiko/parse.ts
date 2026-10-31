import * as XLSX from 'xlsx';
import { IikoParsedRow, type IikoParsedSales, type IikoUnmappedRow, type ZoneId } from './schema';
import { mapCategoryToZone, normalizeCategory } from './zoneMap';
import { parseLocalizedNumber } from '../imports/normalize';

export type ParseOptions = { customZoneMap?: Readonly<Record<string, ZoneId>>; sheetName?: string };
export type ParseReport = {
  sheetName: string; totalRows: number; validRows: number; unmappedRows: number;
  invalidRows: number; skippedRows: number;
  errors: Array<{ row: number; reason: string }>;
  unmappedCategories: Array<{ category: string; rows: number; revenue: number }>;
  mappedRevenue: number; unmappedRevenue: number;
};
export type ParseResult = { data: IikoParsedSales; unmappedData: IikoUnmappedRow[]; report: ParseReport };

const ALIASES = {
  date: ['дата', 'учетный день', 'учётный день', 'день учета', 'день учёта'],
  hour: ['час', 'час закрытия', 'час чека', 'часовой интервал'],
  dish: ['наименование', 'блюдо', 'название блюда', 'номенклатура'],
  category: ['категория', 'категория номенклатуры', 'группа', 'группа блюд', 'категория блюда'],
  qty: ['количество', 'количество блюд', 'кол-во', 'количество, шт'],
  revenue: ['сумма', 'сумма со скидкой', 'сумма со скидкой, р.', 'выручка', 'сумма, р.'],
  cost: ['себестоимость', 'сумма себестоимости'],
  modifier: ['модификатор'], modifierCategory: ['категория модификатора'],
  orderNumber: ['заказ', 'номер заказа'],
} as const;
const normalizeHeader = (value: unknown) => String(value ?? '').replace(/^\uFEFF/, '')
  .normalize('NFKC').replace(/[\s\u00a0]+/g, ' ').trim().toLocaleLowerCase('ru-RU');
function findColumn(headers: unknown[], key: keyof typeof ALIASES): number {
  return headers.findIndex(header => ALIASES[key].map(normalizeHeader).includes(normalizeHeader(header)));
}
function parseNumber(value: unknown): number | null {
  return parseLocalizedNumber(value);
}
function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
}
function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDate([value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-'));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts?.y && parts?.m && parts?.d) return validDate([parts.y, String(parts.m).padStart(2, '0'), String(parts.d).padStart(2, '0')].join('-'));
  }
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validDate([iso[1], iso[2].padStart(2, '0'), iso[3].padStart(2, '0')].join('-'));
  const ru = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ru) return validDate([ru[3], ru[2].padStart(2, '0'), ru[1].padStart(2, '0')].join('-'));
  return null;
}
function parseHour(value: unknown): number | null {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2})(?::00)?$/);
    if (match) value = Number(match[1]);
  }
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}
function isTotalRow(row: unknown[]): boolean {
  return row.some(value => typeof value === 'string' && /^(итого|всего|общий итог)$/i.test(value.trim()));
}
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function parseIikoSalesFile(buffer: ArrayBuffer, options: ParseOptions = {}): Promise<ParseResult> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error('В книге не найден лист с данными продаж.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
  if (!matrix.length) throw new Error('Лист Excel пустой.');
  const headers = matrix[0];
  const columns = {
    date: findColumn(headers, 'date'), hour: findColumn(headers, 'hour'), dish: findColumn(headers, 'dish'),
    category: findColumn(headers, 'category'), qty: findColumn(headers, 'qty'), revenue: findColumn(headers, 'revenue'),
    cost: findColumn(headers, 'cost'), modifier: findColumn(headers, 'modifier'),
    modifierCategory: findColumn(headers, 'modifierCategory'), orderNumber: findColumn(headers, 'orderNumber'),
  };
  const required: Array<keyof typeof ALIASES> = ['date', 'hour', 'dish', 'category', 'qty', 'revenue'];
  const missing = required.filter(key => columns[key] < 0);
  if (missing.length) throw new Error('Не найдены обязательные колонки: ' + missing.map(key => ALIASES[key][0]).join(', '));

  const data: IikoParsedSales = [];
  const unmappedData: IikoUnmappedRow[] = [];
  const errors: ParseReport['errors'] = [];
  const unmapped = new Map<string, { category: string; rows: number; revenue: number }>();
  let totalRows = 0;
  let skippedRows = 0;
  matrix.slice(1).forEach((row, index) => {
    const excelRow = index + 2;
    if (!row.some(value => value != null && String(value).trim() !== '') || isTotalRow(row)) { skippedRows++; return; }
    totalRows++;
    const modifier = columns.modifier >= 0 ? String(row[columns.modifier] ?? '').trim() : '';
    const modifierCategory = columns.modifierCategory >= 0 ? String(row[columns.modifierCategory] ?? '').trim() : '';
    // A populated modifier column can describe a modifier attached to a valid dish row.
    // Skip only modifier-only rows that do not carry a dish name; never discard a base dish.
    const dishValue = String(row[columns.dish] ?? '').trim();
    if ((modifier || modifierCategory) && !dishValue) { skippedRows++; return; }
    const date = parseDate(row[columns.date]);
    const hour = parseHour(row[columns.hour]);
    const dish = String(row[columns.dish] ?? '').trim();
    const category = String(row[columns.category] ?? '').trim();
    const qty = parseNumber(row[columns.qty]);
    const revenue = parseNumber(row[columns.revenue]);
    const reasons: string[] = [];
    if (!date) reasons.push('Некорректная дата');
    if (hour == null) reasons.push('Час должен быть целым числом от 0 до 23');
    if (!dish || dish.length > 200) reasons.push('Наименование блюда обязательно и не длиннее 200 символов');
    if (!category || category.length > 200) reasons.push('Категория обязательна и не длиннее 200 символов');
    if (qty == null || qty < 0) reasons.push('Количество должно быть неотрицательным числом');
    if (revenue == null) reasons.push('Сумма должна быть числом');
    if (reasons.length) { errors.push({ row: excelRow, reason: reasons.join('; ') }); return; }
    const cost = columns.cost >= 0 ? parseNumber(row[columns.cost]) : null;
    const base = {
      date: date!, hour: hour!, dish, category, qty: qty!, revenue: revenue!,
      ...(cost == null ? {} : { cost }),
      ...(columns.orderNumber < 0 || row[columns.orderNumber] == null ? {} : { orderNumber: String(row[columns.orderNumber]).trim() }),
    };
    const zone = mapCategoryToZone(category, options.customZoneMap);
    if (zone === 'unknown') {
      unmappedData.push({ ...base, zone: 'unknown' });
      const key = normalizeCategory(category);
      const previous = unmapped.get(key) ?? { category, rows: 0, revenue: 0 };
      unmapped.set(key, { ...previous, rows: previous.rows + 1, revenue: roundMoney(previous.revenue + base.revenue) });
      return;
    }
    const parsed = IikoParsedRow.safeParse({ ...base, zone });
    if (!parsed.success) {
      errors.push({ row: excelRow, reason: parsed.error.issues.map(issue => issue.message).join('; ') });
      return;
    }
    data.push(parsed.data);
  });
  const unmappedCategories = [...unmapped.values()].sort((a, b) => b.revenue - a.revenue);
  const sumRevenue = (rows: Array<{ revenue: number }>) => roundMoney(rows.reduce((sum, row) => sum + row.revenue, 0));
  return {
    data, unmappedData,
    report: {
      sheetName, totalRows, validRows: data.length, unmappedRows: unmappedData.length,
      invalidRows: errors.length, skippedRows, errors: errors.slice(0, 50), unmappedCategories,
      mappedRevenue: sumRevenue(data), unmappedRevenue: sumRevenue(unmappedData),
    },
  };
}

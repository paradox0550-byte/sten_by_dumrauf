import * as XLSX from 'xlsx';
import { parseLocalizedNumber, normalizeHeader } from '../imports/normalize';

export type HourlySalesObservation = {
  date: string;
  hour: number;
  revenue: number | null;
  dishes: number | null;
  checks: number | null;
  cost: number | null;
};
export type ProductMixObservation = {
  category: string | null;
  dish: string;
  quantity: number | null;
  costPerUnit: number | null;
  pricePerUnit: number | null;
  revenue: number | null;
  revenueBeforeDiscount: number | null;
  discountPercent: number | null;
};
export type ActualReportResult<T> = {
  restaurant: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  rows: T[];
  skippedRows: number;
  errors: string[];
};
const headerAliases = {
  date: ['учетный день', 'учётный день', 'дата'],
  hour: ['час открытия', 'час', 'час чека'],
  revenue: ['сумма со скидкой, р.', 'сумма со скидкой', 'выручка'],
  dishes: ['количество блюд', 'количество'],
  checks: ['чеков', 'количество чеков'],
  cost: ['себестоимость, р.', 'себестоимость'],
  dish: ['название блюда', 'наименование блюда', 'название номенклатуры', 'номенклатура'],
  category: ['группа', 'группа блюд', 'категория'],
  quantity: ['количество', 'количество блюд'],
  costPerUnit: ['себестоимость на 1-ый блюдо', 'себестоимость на 1-ое блюдо', 'себестоимость блюда', 'себестоимость'],
  pricePerUnit: ['цена без скидки, р.', 'цена без скидки', 'цена'],
  revenueBeforeDiscount: ['сумма без скидки, р.', 'сумма без скидки'],
  discountPercent: ['скидка(%)', 'скидка (%)', 'скидка'],
} as const;
function findHeader(headers: unknown[], aliases: readonly string[]): number {
  return headers.findIndex(value => aliases.some(alias => normalizeHeader(value).includes(normalizeHeader(alias))));
}
function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const p = XLSX.SSF.parse_date_code(value);
    return p?.y && p?.m && p?.d ? [p.y, String(p.m).padStart(2, '0'), String(p.d).padStart(2, '0')].join('-') : null;
  }
  const text = String(value ?? '').trim();
  const ru = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ru) return [ru[3], ru[2].padStart(2, '0'), ru[1].padStart(2, '0')].join('-');
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return iso ? [iso[1], iso[2].padStart(2, '0'), iso[3].padStart(2, '0')].join('-') : null;
}
function dateRange(text: string): [string | null, string | null] {
  const match = text.match(/с\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*по\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i);
  return match ? [parseDate(match[1]), parseDate(match[2])] : [null, null];
}
function isSummary(value: unknown): boolean {
  return typeof value === 'string' && /(?:^|\s)(?:всего|итого|общий итог)(?:$|\s)/i.test(value.trim());
}
function metaValue(rows: unknown[][], prefix: RegExp): string | null {
  for (const row of rows.slice(0, 6)) {
    const text = row.map(v => String(v ?? '')).join(' ');
    const match = text.match(prefix);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}
/** Parses the Power BI hourly report. Its grouped date cells are forward-filled; subtotal/payment rows are never added as sales. */
export async function parsePowerBiHourlyFile(buffer: ArrayBuffer): Promise<ActualReportResult<HourlySalesObservation>> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('В книге Power BI нет листа с данными.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
  const meta = matrix.slice(0, 5).map(row => row.map(v => String(v ?? '')).join(' ')).join(' ');
  const restaurant = meta.match(/Название ресторана:\s*(.+?)(?:\s+Период:|$)/i)?.[1]?.trim() ?? null;
  const [periodStart, periodEnd] = dateRange(meta);
  let headerIndex = matrix.findIndex(row => row.some(v => normalizeHeader(v) === 'учетный день' || normalizeHeader(v) === 'учётный день')
    && row.some(v => normalizeHeader(v) === 'час открытия')
    && row.some(v => normalizeHeader(v).includes('сумма со скидкой')));
  if (headerIndex < 0) throw new Error('Это не поддерживаемый Power BI почасовой отчёт: не найдены заголовки «Учетный день», «Час открытия» и «Сумма со скидкой».');
  const headers = matrix[headerIndex];
  const cols = {
    date: findHeader(headers, headerAliases.date), hour: findHeader(headers, headerAliases.hour),
    revenue: findHeader(headers, headerAliases.revenue), dishes: findHeader(headers, headerAliases.dishes),
    checks: findHeader(headers, headerAliases.checks), cost: findHeader(headers, headerAliases.cost),
  };
  const rows: HourlySalesObservation[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  let currentDate: string | null = null;
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const row = matrix[index];
    if (!row.some(v => v != null && String(v).trim() !== '')) { skippedRows++; continue; }
    const dateCell = row[cols.date];
    if (isSummary(dateCell) || row.some(isSummary)) { skippedRows++; continue; }
    const parsedDate = parseDate(dateCell);
    if (parsedDate) currentDate = parsedDate;
    const hourText = String(row[cols.hour] ?? '').trim();
    const hourMatch = hourText.match(/^(\d{1,2})(?::00)?$/);
    const hour = hourMatch ? Number(hourMatch[1]) : null;
    // Payment summaries and grand totals have no hour; never count them as hourly observations.
    if (!currentDate || hour == null || hour < 0 || hour > 23) { skippedRows++; continue; }
    const revenue = parseLocalizedNumber(row[cols.revenue]);
    if (revenue == null) { errors.push(`Строка Excel ${index + 1}: не распознана выручка.`); continue; }
    rows.push({
      date: currentDate, hour, revenue,
      dishes: cols.dishes >= 0 ? parseLocalizedNumber(row[cols.dishes]) : null,
      checks: cols.checks >= 0 ? parseLocalizedNumber(row[cols.checks]) : null,
      cost: cols.cost >= 0 ? parseLocalizedNumber(row[cols.cost]) : null,
    });
  }
  if (!rows.length) throw new Error('В Power BI файле не найдено ни одной строки с датой, часом и выручкой.');
  return { restaurant, periodStart, periodEnd, rows, skippedRows, errors };
}

/** Parses the legacy tab-separated iiko OLAP product-mix export (including Windows-1251 text files). */
export function parseIikoProductMixText(buffer: ArrayBuffer): ActualReportResult<ProductMixObservation> {
  let text: string;
  try { text = new TextDecoder('windows-1251').decode(buffer); }
  catch { text = new TextDecoder().decode(buffer); }
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const restaurant = lines.slice(0, 5).map(line => line.match(/Название предприятия:\s*(.+)/i)?.[1]).find(Boolean)?.trim() ?? null;
  const periodLine = lines.slice(0, 5).find(line => /Период:/i.test(line)) ?? '';
  const [periodStart, periodEnd] = dateRange(periodLine);
  const delimiter = lines.some(line => line.includes('\t')) ? '\t' : ';';
  const table = lines.map(line => line.split(delimiter));
  const headerIndex = table.findIndex(row => row.some(v => /название блюда|наименование блюда|название номенклатуры/i.test(normalizeHeader(v)))
    && row.some(v => /количество/i.test(normalizeHeader(v))));
  if (headerIndex < 0) throw new Error('Не распознана шапка OLAP-отчёта: ожидаются название блюда и количество.');
  const headers = table[headerIndex];
  const cols = {
    dish: findHeader(headers, headerAliases.dish), category: findHeader(headers, headerAliases.category),
    quantity: findHeader(headers, headerAliases.quantity), costPerUnit: findHeader(headers, headerAliases.costPerUnit),
    pricePerUnit: findHeader(headers, headerAliases.pricePerUnit), revenue: findHeader(headers, headerAliases.revenue),
    revenueBeforeDiscount: findHeader(headers, headerAliases.revenueBeforeDiscount),
    discountPercent: findHeader(headers, headerAliases.discountPercent),
  };
  const rows: ProductMixObservation[] = [];
  let skippedRows = 0;
  const errors: string[] = [];
  for (let index = headerIndex + 1; index < table.length; index++) {
    const row = table[index];
    const dish = String(row[cols.dish] ?? '').trim();
    if (!dish || /^_/.test(dish) || isSummary(dish)) { skippedRows++; continue; }
    const quantity = cols.quantity >= 0 ? parseLocalizedNumber(row[cols.quantity]) : null;
    if (quantity == null) { skippedRows++; continue; }
    rows.push({
      category: cols.category >= 0 ? (String(row[cols.category] ?? '').trim() || null) : null,
      dish, quantity,
      costPerUnit: cols.costPerUnit >= 0 ? parseLocalizedNumber(row[cols.costPerUnit]) : null,
      pricePerUnit: cols.pricePerUnit >= 0 ? parseLocalizedNumber(row[cols.pricePerUnit]) : null,
      revenue: cols.revenue >= 0 ? parseLocalizedNumber(row[cols.revenue]) : null,
      revenueBeforeDiscount: cols.revenueBeforeDiscount >= 0 ? parseLocalizedNumber(row[cols.revenueBeforeDiscount]) : null,
      discountPercent: cols.discountPercent >= 0 ? parseLocalizedNumber(String(row[cols.discountPercent] ?? '').replace('%', '')) : null,
    });
  }
  if (!rows.length) throw new Error('В OLAP-отчёте не найдено строк блюд с количеством.');
  return { restaurant, periodStart, periodEnd, rows, skippedRows, errors };
}

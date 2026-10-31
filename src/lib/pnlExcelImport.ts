import * as XLSX from 'xlsx';

export type PnlCellValue = string | number | boolean | Date | null;
export type PnlExcelSheet = {
  name: string;
  rows: PnlCellValue[][];
  headerRow: number;
  startRow: number;
  startColumn: number;
  formulaCells: Record<string, { formula: string; hasCachedValue: boolean }>;
};
export type PnlExcelWorkbook = { sheets: PnlExcelSheet[] };
export type PnlCategory = 'revenue' | 'cogs' | 'payroll' | 'overtime' | 'opex' | 'other_operating' | 'depreciation' | 'interest' | 'tax' | 'other' | 'unclassified';
export type PnlColumnMap = { article: number; plan: number | null; fact: number | null };
export type PnlImportedRow = {
  id: string;
  article: string;
  category: PnlCategory;
  plan: number | null;
  fact: number | null;
  source: string;
  sheet: string;
  sourceRow: number;
  sourceCellPlan: string | null;
  sourceCellFact: string | null;
  warnings: string[];
  skipped: boolean;
};

const HEADER_ALIASES = {
  article: ['статья', 'статья затрат', 'наименование статьи', 'показатель', 'расходы', 'статьи', 'article', 'account', 'description', 'наименование', 'пункт'],
  plan: ['план', 'план руб', 'план сумма', 'budget', 'planned', 'plan'],
  fact: ['факт', 'факт руб', 'фактическая сумма', 'actual', 'fact', 'сумма факт'],
};
const TOTAL_LABEL = /^(?:итого|всего|общий итог|итог|total|grand total|subtotal|промежуточный итог)(?:\s|$|[:—-])/iu;
export const PNL_CATEGORY_LABELS: Record<PnlCategory, string> = {
  revenue: 'Выручка',
  cogs: 'Себестоимость',
  payroll: 'ФОТ',
  overtime: 'Переработки',
  opex: 'OPEX',
  other_operating: 'Прочие операционные',
  depreciation: 'Амортизация',
  interest: 'Проценты',
  tax: 'Налоги',
  other: 'Прочее',
  unclassified: 'Не распределено',
};
const CATEGORY_ALIASES: Record<Exclude<PnlCategory, 'unclassified'>, string[]> = {
  revenue: ['выручка', 'выручка итого', 'доход', 'оборот', 'revenue', 'sales'],
  cogs: ['себестоимость', 'себестоимость итого', 'cogs', 'фудкост', 'food cost'],
  payroll: ['фот', 'фонд оплаты труда', 'зарплата', 'payroll', 'personnel'],
  overtime: ['переработки', 'сверхурочные', 'overtime'],
  opex: ['opex', 'операционные расходы', 'операционные затраты', 'аренда', 'аренда помещения', 'коммунальные услуги', 'эквайринг', 'ремонт', 'хозрасходы'],
  other_operating: ['прочие операционные', 'прочее операционные', 'other operating'],
  depreciation: ['амортизация', 'depreciation'],
  interest: ['проценты', 'процентные расходы', 'interest'],
  tax: ['налоги', 'налог', 'tax'],
  other: ['прочее', 'другое', 'other'],
};
export function suggestPnlCategory(article: string): PnlCategory {
  const normalized = normalizePnlText(article);
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as [Exclude<PnlCategory, 'unclassified'>, string[]][]) {
    if (aliases.some(alias => normalized === normalizePnlText(alias))) return category;
  }
  return 'unclassified';
}

export function normalizePnlText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ').trim().toLocaleLowerCase('ru-RU')
    .replace(/[ё]/g, 'е').replace(/[.,:;()]+/g, ' ').replace(/[\s_/-]+/g, ' ');
}

export function parsePnlAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let source = value.normalize('NFKC').replace(/[\u00a0\u202f\s]/g, '').replace(/[₽€$%]/g, '').replace(/[−–—]/g, '-');
  if (!source || /^(?:-|—|–|n\/a|нет данных)$/iu.test(source)) return null;
  const parenthesized = /^\(.*\)$/.test(source);
  if (parenthesized) source = source.slice(1, -1);
  source = source.replace(/[^0-9,.'+-]/g, '');
  if (!source || !/[0-9]/.test(source)) return null;
  const comma = source.lastIndexOf(',');
  const dot = source.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    source = comma > dot ? source.replace(/\./g, '').replace(',', '.') : source.replace(/,/g, '');
  } else if (comma >= 0) {
    const parts = source.split(',');
    source = parts.length === 2 && parts[1].length !== 3 ? source.replace(',', '.') : source.replace(/,/g, '');
  } else if ((source.match(/\./g) ?? []).length > 1) {
    const parts = source.split('.');
    source = parts.slice(0, -1).join('') + '.' + parts.at(-1);
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(source)) return null;
  const parsed = Number(source) * (parenthesized ? -1 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectPnlHeaderRow(rows: PnlCellValue[][]): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const cells = (rows[index] ?? []).map(normalizePnlText);
    const matches = (cell: string, aliases: string[]) => aliases.some(alias => {
      const normalized = normalizePnlText(alias);
      return cell === normalized || cell.startsWith(normalized + ' ');
    });
    const hasArticle = HEADER_ALIASES.article.some(alias => cells.some(cell => matches(cell, [alias])));
    const hasPlan = HEADER_ALIASES.plan.some(alias => cells.some(cell => matches(cell, [alias])));
    const hasFact = HEADER_ALIASES.fact.some(alias => cells.some(cell => matches(cell, [alias])));
    const hasAmount = cells.some(cell => /^(сумма|amount|значение|value|руб|рубли|amount rub)$/.test(cell));
    const score = Number(hasArticle) * 3 + Number(hasPlan) * 2 + Number(hasFact) * 2 + Number(hasAmount);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function guessPnlColumns(header: PnlCellValue[]): PnlColumnMap {
  const labels = header.map(normalizePnlText);
  const find = (aliases: string[]) => labels.findIndex(label => aliases.some(alias => {
    const normalized = normalizePnlText(alias);
    return label === normalized || label.startsWith(normalized + ' ');
  }));
  const article = find(HEADER_ALIASES.article);
  const plan = find(HEADER_ALIASES.plan);
  let fact = find(HEADER_ALIASES.fact);
  if (fact < 0) fact = find(['сумма', 'amount', 'значение', 'value', 'факт сумма', 'итого']);
  return { article: article >= 0 ? article : labels.findIndex(Boolean), plan: plan >= 0 ? plan : null, fact: fact >= 0 ? fact : null };
}

export function parsePnlWorkbook(data: ArrayBuffer): PnlExcelWorkbook {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true, cellText: true, cellFormula: true });
  if (!workbook.SheetNames.length) throw new Error('В Excel нет листов с данными.');
  const sheets = workbook.SheetNames.map(name => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet || !worksheet['!ref']) return { name, rows: [], headerRow: -1, startRow: 0, startColumn: 0, formulaCells: {} };
    const rows = XLSX.utils.sheet_to_json<PnlCellValue[]>(worksheet, { header: 1, defval: null, raw: true, blankrows: true });
    const formulaCells: PnlExcelSheet['formulaCells'] = {};
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[address];
        if (cell && typeof cell.f === 'string') {
          formulaCells[address] = { formula: cell.f, hasCachedValue: cell.v !== undefined && cell.v !== null && cell.v !== '' };
        }
      }
    }
    return { name, rows, headerRow: detectPnlHeaderRow(rows), startRow: range.s.r, startColumn: range.s.c, formulaCells };
  });
  return { sheets };
}

export function buildPnlImportRows(
  sheet: PnlExcelSheet,
  headerRow: number,
  columns: PnlColumnMap,
): PnlImportedRow[] {
  if (headerRow < 0 || headerRow >= sheet.rows.length) throw new Error('Выберите строку с заголовками столбцов.');
  if (columns.article < 0) throw new Error('Не выбран столбец с названием статьи.');
  if (columns.plan === null && columns.fact === null) throw new Error('Не выбраны столбцы План и/или Факт.');
  const result: PnlImportedRow[] = [];
  for (let rowIndex = headerRow + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] ?? [];
    const article = String(row[columns.article] ?? '').trim();
    const planAddress = columns.plan === null ? null : XLSX.utils.encode_cell({ r: rowIndex + sheet.startRow, c: columns.plan + sheet.startColumn });
    const factAddress = columns.fact === null ? null : XLSX.utils.encode_cell({ r: rowIndex + sheet.startRow, c: columns.fact + sheet.startColumn });
    const planCell = planAddress ? sheet.formulaCells[planAddress] : undefined;
    const factCell = factAddress ? sheet.formulaCells[factAddress] : undefined;
    const plan = columns.plan === null ? null : parsePnlAmount(row[columns.plan]);
    const fact = columns.fact === null ? null : parsePnlAmount(row[columns.fact]);
    const hasAnyData = article || plan !== null || fact !== null || planCell || factCell;
    if (!hasAnyData) continue;
    const warnings: string[] = [];
    if (!article) warnings.push('Нет названия статьи');
    if (planCell && !planCell.hasCachedValue) warnings.push('Формула План не содержит сохранённого результата');
    if (factCell && !factCell.hasCachedValue) warnings.push('Формула Факт не содержит сохранённого результата');
    if (plan === null && fact === null && !(planCell && !planCell.hasCachedValue) && !(factCell && !factCell.hasCachedValue)) {
      warnings.push('Не удалось прочитать сумму План/Факт');
    }
    const category = suggestPnlCategory(article);\n    if (!category || category === 'unclassified') warnings.push('Требует выбора категории P&L');\n    if (TOTAL_LABEL.test(normalizePnlText(article))) warnings.push('Похоже на итоговую строку — исключена из импорта во избежание двойного счёта');
    const skip = TOTAL_LABEL.test(normalizePnlText(article));
    result.push({
      id: `${sheet.name}-${rowIndex + 1}`,
      article,
      category,
      plan,
      fact,
      source: `Excel: ${sheet.name}, строка ${rowIndex + sheet.startRow + 1}`,
      sheet: sheet.name,
      sourceRow: rowIndex + sheet.startRow + 1,
      sourceCellPlan: planAddress,
      sourceCellFact: factAddress,
      warnings,
      skipped: skip,
    });
  }
  return result;
}

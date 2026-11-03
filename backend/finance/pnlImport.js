'use strict';

const crypto = require('node:crypto');
const XLSX = require('@e965/xlsx');

const ARTICLE_ALIASES = {
  revenue: ['выручка', 'доход', 'revenue', 'оборот', 'выручка всего'],
  cogs: ['себестоимость', 'sebestoimost', 'cogs', 'фудкост', 'food cost', 'закупки', 'продукты'],
  payroll: ['фот', 'personnel', 'payroll', 'зарплата', 'персонал', 'фонд оплаты', 'страховые взносы с фот', 'страховые взносы'],
  overtime: ['переработки', 'сверхурочные', 'overtime', 'overtime hours'],
  opex: ['opex', 'операционные расходы', 'операционные затраты', 'аренда', 'коммунальные', 'коммунальные услуги', 'безопасность', 'маркетинг', 'общехозяйственные', 'расходы на персонал (не фот)', 'административные', 'ремонт', 'транспортные', 'эквайринг', 'прочие операционные'],
  depreciation: ['амортизация', 'depreciation'],
  interest: ['проценты', 'interest', 'кредиты'],
  tax: ['налоги', 'tax', 'налог'],
  other: ['прочее', 'other', 'другое'],
  other_operating: ['прочее операционные', 'прочие операционные', 'прочие операционные расходы', 'other operating'],
};

function normalizeKey(value) {
  return String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ru-RU').replace(/[–—-]+/g, ' ').replace(/\s+/g, ' ');
}

function classifyArticle(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  for (const [category, aliases] of Object.entries(ARTICLE_ALIASES)) {
    if (aliases.some(alias => normalizeKey(alias) === key)) return category;
  }
  for (const [category, aliases] of Object.entries(ARTICLE_ALIASES)) {
    if (aliases.some(alias => { const normalized = normalizeKey(alias); return normalized.length > 2 && key.includes(normalized); })) return category;
  }
  return null;
}

function parseNumberCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  let text = value.replace(/\u00a0/g, '').replace(/\s+/g, '').replace(/₽/gu, '').replace(/%$/u, '').replace(/[−–—]/g, '-');
  if (!text) return null;
  const parenthesized = /^\(.*\)$/.test(text);
  if (parenthesized) text = text.slice(1, -1);
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasComma) {
    const parts = text.split(',');
    text = parts.length === 2 && parts[1].length !== 3 ? text.replace(',', '.') : text.replace(/,/g, '');
  } else if (hasDot) {
    const parts = text.split('.');
    if (parts.length === 2 && parts[1].length === 3) text = text.replace('.', '');
  }
  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) return null;
  const parsed = Number(text) * (parenthesized ? -1 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFormulaCell(cell) {
  const formula = typeof cell?.f === 'string' ? cell.f : null;
  const hasCachedValue = cell?.v !== undefined && cell?.v !== null && cell?.v !== '';
  return { formula, hasCachedValue, missingCachedValue: Boolean(formula && !hasCachedValue) };
}
function headerIndex(headers, words) {
  return headers.findIndex(value => {
    const key = normalizeKey(value);
    return words.some(word => key === normalizeKey(word) || key.includes(normalizeKey(word)));
  });
}

function xlsxToRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: false, cellText: false });
  const output = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (!Array.isArray(grid) || !grid.length) continue;
    let labelColumn = 0, planColumn = -1, factColumn = -1, headerRow = -1;
    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 12); rowIndex++) {
      const row = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      const headers = row.map(value => String(value ?? ''));
      const plan = headerIndex(headers, ['план', 'plan', 'бюджет']);
      const fact = headerIndex(headers, ['факт', 'fact', 'actual']);
      if (plan >= 0 || fact >= 0) {
        headerRow = rowIndex; planColumn = plan; factColumn = fact;
        const label = headerIndex(headers, ['статья', 'наименование', 'показатель', 'article', 'name']);
        if (label >= 0) labelColumn = label;
        break;
      }
    }
    const startRow = headerRow >= 0 ? headerRow + 1 : 0;
    for (let rowIndex = startRow; rowIndex < grid.length; rowIndex++) {
      const line = Array.isArray(grid[rowIndex]) ? grid[rowIndex] : [];
      if (!line.length) continue;
      let foundLabelColumn = labelColumn;
      if (typeof line[foundLabelColumn] !== 'string' || !String(line[foundLabelColumn]).trim()) {
        foundLabelColumn = line.findIndex(value => typeof value === 'string' && String(value).trim().length);
      }
      if (foundLabelColumn < 0) continue;
      const label = String(line[foundLabelColumn] ?? '').trim();
      if (!label || ['статья', 'наименование', 'показатель', 'article', 'name'].includes(normalizeKey(label))) continue;
      const category = classifyArticle(label);
      const article = label;
      let plan = planColumn >= 0 ? parseNumberCell(line[planColumn]) : null;
      let fact = factColumn >= 0 ? parseNumberCell(line[factColumn]) : null;
      // Never copy one detected amount into both Plan and Fact when a column is absent.
      const planCell = planColumn >= 0 ? XLSX.utils.encode_cell({ r: rowIndex, c: planColumn }) : null;
      const factCell = factColumn >= 0 ? XLSX.utils.encode_cell({ r: rowIndex, c: factColumn }) : null;
      const planFormulaInfo = planCell ? readFormulaCell(sheet[planCell]) : readFormulaCell(null);
      const factFormulaInfo = factCell ? readFormulaCell(sheet[factCell]) : readFormulaCell(null);
      const planFormula = planFormulaInfo.formula;
      const factFormula = factFormulaInfo.formula;
      const warnings = [];
      if (!category) warnings.push('Статья не сопоставлена с категорией P&L; требуется ручное распределение.');
      if (planColumn < 0 || factColumn < 0) warnings.push('Не все заголовки «План» и «Факт» найдены: отсутствующее значение оставлено пустым.');
      if (planFormulaInfo.missingCachedValue && plan === null) warnings.push('Формула в плане не содержит сохранённого результата Excel.');
      if (factFormulaInfo.missingCachedValue && fact === null) warnings.push('Формула в факте не содержит сохранённого результата Excel.');
      output.push({
        id: crypto.randomUUID(), article, key: category || 'unmapped', label, plan, fact,
        source: `xlsx:${sheetName}`, sheet: sheetName, sourceRow: rowIndex + 1,
        sourceCellPlan: planCell, sourceCellFact: factCell,
        sourceFormulaPlan: planFormula, sourceFormulaFact: factFormula,
        requiresReview: !category || warnings.length > 0, warnings,
      });
    }
  }
  return output;
}

module.exports = { classifyArticle, parseNumberCell, readFormulaCell, xlsxToRows };

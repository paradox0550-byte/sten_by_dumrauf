'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { classifyArticle, parseNumberCell, xlsxToRows } = require('../finance/pnlImport');

function workbookBuffer(rows, mutate) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (mutate) mutate(sheet);
  XLSX.utils.book_append_sheet(workbook, sheet, 'P&L');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('maps known categories and leaves unknown article names unmapped', () => {
  assert.equal(classifyArticle('Выручка'), 'revenue');
  assert.equal(classifyArticle('Коммунальные услуги'), 'opex');
  assert.equal(classifyArticle('Курьерская доставка'), null);
  assert.equal(classifyArticle(''), null);
});

test('preserves each unknown P&L article instead of merging it into other operating costs', () => {
  const rows = xlsxToRows(workbookBuffer([
    ['Статья', 'План', 'Факт'],
    ['Выручка', 1000, 900],
    ['Курьерская доставка', 50, 60],
    ['Банковская комиссия', 20, 25],
  ]));
  assert.equal(rows.length, 3);
  assert.equal(rows[0].article, 'Выручка');
  assert.equal(rows[0].key, 'revenue');
  assert.equal(rows[1].article, 'Курьерская доставка');
  assert.equal(rows[1].key, 'unmapped');
  assert.equal(rows[2].article, 'Банковская комиссия');
  assert.equal(rows[2].key, 'unmapped');
  assert.equal(rows[1].requiresReview, true);
});

test('does not copy a single detected amount into both plan and fact', () => {
  const rows = xlsxToRows(workbookBuffer([
    ['Статья', 'План'],
    ['Выручка', 1000],
  ]));
  assert.equal(rows[0].plan, 1000);
  assert.equal(rows[0].fact, null);
  assert.equal(rows[0].requiresReview, true);
  assert.match(rows[0].warnings[0], /отсутствующее значение оставлено пустым/u);
});

test('does not infer plan or fact when neither column is labelled', () => {
  const rows = xlsxToRows(workbookBuffer([
    ['Статья', 'Сумма'],
    ['Выручка', 1000],
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plan, null);
  assert.equal(rows[0].fact, null);
  assert.equal(rows[0].requiresReview, true);
});

test('retains formula provenance and warns when Excel has not stored a formula result', () => {
  const rows = xlsxToRows(workbookBuffer([
    ['Статья', 'План', 'Факт'],
    ['Выручка', null, 900],
  ], sheet => {
    sheet.B2 = { t: 'n', f: 'SUM(B3:B4)' };
  }));
  assert.equal(rows[0].plan, null);
  assert.equal(rows[0].sourceFormulaPlan, 'SUM(B3:B4)');
  assert.equal(rows[0].fact, 900);
  assert.equal(rows[0].requiresReview, true);
  assert.match(rows[0].warnings[0], /не содержит сохранённого результата/u);
});

test('parses Russian and European thousands separators', () => {
  assert.equal(parseNumberCell('1 234,50'), 1234.5);
  assert.equal(parseNumberCell('1.234,50'), 1234.5);
  assert.equal(parseNumberCell('1.234'), 1234);
  assert.equal(parseNumberCell('не число'), null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { xlsxRows } = require('../documentProcessor');

test('Excel P&L import returns candidates and source cells without writing data', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Статья', 'План', 'Факт'],
    ['Выручка', 1000000, 900000],
    ['Себестоимость', 300000, 290000],
    ['ФОТ', 200000, 210000],
    ['OPEX', 100000, 105000],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'P&L');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  const rows = xlsxRows(buf);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].article, 'revenue');
  assert.equal(rows[0].plan, 1000000);
  assert.equal(rows[0].fact, 900000);
  assert.equal(rows[0].sourceCellPlan, 'B2');
  assert.equal(rows[0].sourceCellFact, 'C2');
});

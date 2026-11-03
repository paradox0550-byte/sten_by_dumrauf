'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePnl } = require('../finance/pnlCalculator');

test('calculates EBITDA and net profit when every required input is explicit', () => {
  const result = calculatePnl({
    revenue: 1000, cogs: -250, personnel: -200, overtime: -20, opex: -100,
    other_operating: -10, other: -5, depreciation: -10, interest: -5, tax: -5,
  });
  assert.equal(result.ebitda, 415);
  assert.equal(result.ebitdaPartial, false);
  assert.equal(result.netProfit, 395);
  assert.equal(result.netProfitPartial, false);
  assert.equal(result.formulaVersion, 'pnl-v5-complete-inputs-only');
});

test('does not publish partial EBITDA when a required cost block is missing', () => {
  const result = calculatePnl({ revenue: 1000, cogs: -250, personnel: -200, overtime: -20 });
  assert.equal(result.ebitda, null);
  assert.equal(result.ebitdaPartial, true);
  assert.ok(result.ebitdaMissingBlocks.includes('opex'));
  assert.equal(result.ebitdaMargin, null);
});

test('does not publish EBITDA when revenue is missing', () => {
  const result = calculatePnl({ cogs: -250, personnel: -200, overtime: -20, opex: -100 });
  assert.equal(result.ebitda, null);
  assert.equal(result.ebitdaPartial, true);
  assert.ok(result.ebitdaMissingBlocks.includes('revenue'));
});

test('does not publish net profit when depreciation, interest or tax is missing', () => {
  const result = calculatePnl({
    revenue: 1000, cogs: -250, personnel: -200, overtime: -20, opex: -100,
    depreciation: -10, interest: 0,
  });
  assert.equal(result.ebitda, 430);
  assert.equal(result.netProfit, null);
  assert.equal(result.netProfitPartial, true);
  assert.deepEqual(result.netProfitMissingBlocks, ['tax']);
});

test('normalizes positive and negative expense inputs without double subtraction', () => {
  const signed = calculatePnl({ revenue: 1000, cogs: -250, personnel: -200, overtime: -20, opex: -100, depreciation: 0, interest: 0, tax: 0 });
  const positive = calculatePnl({ revenue: 1000, cogs: 250, personnel: 200, overtime: 20, opex: 100, depreciation: 0, interest: 0, tax: 0 });
  assert.equal(signed.ebitda, positive.ebitda);
  assert.equal(signed.netProfit, positive.netProfit);
  assert.equal(signed.primeCostPercent, 47);
});

test('keeps percentage metrics unavailable when revenue is zero', () => {
  const result = calculatePnl({ revenue: 0, cogs: 0, personnel: 0, overtime: 0, opex: 0, depreciation: 0, interest: 0, tax: 0 });
  assert.equal(result.ebitda, 0);
  assert.equal(result.foodCostPercent, null);
  assert.equal(result.primeCostPercent, null);
  assert.equal(result.ebitdaMargin, null);
});

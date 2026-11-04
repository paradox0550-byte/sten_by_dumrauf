'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('schema bootstrap never deletes P&L entries', () => {
  assert.doesNotMatch(source, /DELETE\s+FROM\s+pnl_entries/i);
});

test('schema bootstrap does not drop the legacy daily_reports date column', () => {
  assert.doesNotMatch(source, /ALTER\s+TABLE\s+daily_reports\s+DROP\s+COLUMN\s+date/i);
});

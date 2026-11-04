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

test('financial report reads do not convert database failures into empty datasets', () => {
  const transactionRead = source.slice(
    source.indexOf("app.get('/api/pnl/transactions'"),
    source.indexOf("app.post('/api/pnl/transactions'"),
  );
  const reportRead = source.slice(
    source.indexOf("app.get('/reports'"),
    source.indexOf("app.post('/reports'"),
  );
  const reportMetrics = source.slice(
    source.indexOf('async function loadReportMetrics'),
    source.indexOf("app.get('/api/ai/skills'"),
  );

  assert.match(transactionRead, /strictQuery\(/u);
  assert.match(reportRead, /strictQuery\(/u);
  assert.match(reportMetrics, /strictQuery\(/u);
  assert.doesNotMatch(reportMetrics, /safeQuery\(/u);
});

test('Yandex Cloud Functions PostgreSQL TLS uses the platform CA with verification enabled', () => {
  assert.match(source, /fs\.readFileSync\('\/usr\/local\/share\/ca-certificates\/yandex-internal-ca\.crt'\)/u);
  assert.doesNotMatch(source, /DB_SSL_CA_BASE64/u);
  const resolver = source.slice(source.indexOf('function resolveDbSsl()'), source.indexOf('let _pool = null;'));
  assert.match(resolver, /return \{[\s\S]*?ca,[\s\S]*?rejectUnauthorized:\s*true/u);
});

test('PostgreSQL TLS never silently disables verification in production', () => {
  const resolver = source.slice(
    source.indexOf('function resolveDbSsl()'),
    source.indexOf('let _pool = null;'),
  );
  assert.match(resolver, /process\.env\.DB_SSL_MODE === 'disable'/u);
  assert.match(resolver, /ENV\.NODE_ENV === 'production'/u);
  assert.match(resolver, /production запрещён/u);
  assert.doesNotMatch(resolver, /allowInsecure|DB_SSL_ALLOW_INSECURE/u);
});

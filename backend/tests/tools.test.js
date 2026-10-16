'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, findTool } = require('../core/tools');

test('findTool returns get_pnl and find_deviations', () => {
  assert.ok(findTool('get_pnl'));
  assert.ok(findTool('find_deviations'));
});

test('findTool returns null for unknown tool', () => {
  assert.equal(findTool('nonexistent'), null);
});

test('every tool has required contract fields', () => {
  for (const tool of TOOLS) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.parameters, 'object');
    assert.ok(Array.isArray(tool.policy));
    assert.equal(typeof tool.handler, 'function');
  }
});

test('v2 exposes document search alongside existing tools', () => {
  assert.equal(TOOLS.length, 8);
  assert.deepEqual(TOOLS.map(tool => tool.name), [
    'get_pnl','find_deviations','get_fot','get_sales','get_documents','search_documents','get_memory','get_secretary_context',
  ]);
});


test('find_deviations returns empty state for empty period', async () => {
  const tool = findTool('find_deviations');
  const ctx = {
    queryWithRetry: async () => ({ rows: [] }),
    aggregateRows: rows => rows,
    canonicalArticleKey: value => String(value).toLowerCase(),
  };
  const result = await tool.handler({ organizationId:'00000000-0000-0000-0000-000000000001' }, { period:'2026-10' }, ctx);
  assert.equal(result.has_data, false);
  assert.deepEqual(result.critical, []);
});

test('find_deviations returns critical payroll overrun', async () => {
  const tool = findTool('find_deviations');
  const ctx = {
    queryWithRetry: async (sql) => ({ rows: sql.includes('pnl_entries') ? [{ rows: JSON.stringify([{ article:'ФОТ', plan:2610000, fact:2840000, source:'manual' }]) }] : [] }),
    aggregateRows: rows => rows,
    canonicalArticleKey: value => String(value).toLowerCase() === 'фот' ? 'payroll' : String(value).toLowerCase(),
  };
  const result = await tool.handler({ organizationId:'00000000-0000-0000-0000-000000000001' }, { period:'2026-10' }, ctx);
  assert.equal(result.has_data, true);
  assert.equal(result.critical[0].key, 'payroll');
  assert.equal(result.critical[0].delta_abs, 230000);
  assert.equal(result.critical[0].severity, 'high');
  assert.equal(result.critical[0].favorable, false);
});

test('find_deviations returns favorable OPEX saving', async () => {
  const tool = findTool('find_deviations');
  const ctx = {
    queryWithRetry: async (sql) => ({ rows: sql.includes('pnl_entries') ? [{ rows: JSON.stringify([{ article:'OPEX', plan:100000, fact:50000, source:'manual' }]) }] : [] }),
    aggregateRows: rows => rows,
    canonicalArticleKey: value => String(value).toLowerCase() === 'opex' ? 'opex' : String(value).toLowerCase(),
  };
  const result = await tool.handler({ organizationId:'00000000-0000-0000-0000-000000000001' }, { period:'2026-10' }, ctx);
  assert.equal(result.positive[0].key, 'opex');
  assert.equal(result.positive[0].delta_abs, -50000);
  assert.equal(result.positive[0].favorable, true);
});

test('find_deviations reports missing plan', async () => {
  const tool = findTool('find_deviations');
  const ctx = {
    queryWithRetry: async (sql) => ({ rows: sql.includes('pnl_entries') ? [{ rows: JSON.stringify([{ article:'OPEX', plan:null, fact:500000 }]) }] : [] }),
    aggregateRows: rows => rows,
    canonicalArticleKey: value => String(value).toLowerCase(),
  };
  const result = await tool.handler({ organizationId:'00000000-0000-0000-0000-000000000001' }, { period:'2026-10' }, ctx);
  assert.equal(result.missing[0].article, 'OPEX');
  assert.equal(result.missing[0].plan, null);
  assert.equal(result.missing[0].fact, 500000);
});

test('find_deviations sorts larger absolute deviation first', async () => {
  const tool = findTool('find_deviations');
  const ctx = {
    queryWithRetry: async (sql) => ({ rows: sql.includes('pnl_entries') ? [{ rows: JSON.stringify([
      { article:'OPEX', plan:100000, fact:150000, source:'manual' },
      { article:'COGS', plan:100000, fact:250000, source:'manual' }
    ]) }] : [] }),
    aggregateRows: rows => rows,
    canonicalArticleKey: value => String(value).toLowerCase(),
  };
  const result = await tool.handler({ organizationId:'00000000-0000-0000-0000-000000000001' }, { period:'2026-10' }, ctx);
  assert.deepEqual(result.critical.map(item => item.article), ['COGS','OPEX']);
});

test('search_documents searches only ready documents in the authenticated organization and returns source excerpts', async () => {
  const tool = findTool('search_documents');
  let captured;
  const ctx = {
    queryWithRetry: async (sql, params, options) => {
      captured = { sql, params, options };
      return { rows: [{
        id: 'doc-1',
        name: 'МОТИВАЦИЯ МЕНЕДЖЕРА.xlsx',
        created_at: '2026-10-16T10:00:00.000Z',
        extracted_text: 'Лист: Менеджер. Строка 10: Выполнение плана — коэффициент 1.2. Премия = оклад × коэффициент.',
        extraction_json: { sheetNames: ['Менеджер'] },
      }] };
    },
  };
  const result = await tool.handler(
    { organizationId: '00000000-0000-0000-0000-000000000001' },
    { query: 'мотивация менеджера', limit: 5 },
    ctx,
  );
  assert.match(captured.sql, /organization_id=\$1::uuid/u);
  assert.match(captured.sql, /status='ready'/u);
  assert.match(captured.sql, /position\(lower\(\$3\)/u);
  assert.equal(captured.params[0], '00000000-0000-0000-0000-000000000001');
  assert.deepEqual(captured.options, { orgId: '00000000-0000-0000-0000-000000000001' });
  assert.equal(result.found, 1);
  assert.equal(result.documents[0].name, 'МОТИВАЦИЯ МЕНЕДЖЕРА.xlsx');
  assert.match(result.documents[0].excerpts[0].excerpt, /коэффициент 1\.2/u);
});

test('search_documents refuses to query without a trusted organization id', async () => {
  const tool = findTool('search_documents');
  await assert.rejects(
    () => tool.handler({}, { query: 'зарплата' }, { queryWithRetry: async () => { throw new Error('must not run'); } }),
    error => error.code === 'NO_ORG_SCOPE',
  );
});

test('get_documents supports status=all for a complete inventory', async () => {
  const tool = findTool('get_documents');
  let captured;
  const result = await tool.handler(
    { organizationId: '00000000-0000-0000-0000-000000000001' },
    { status: 'all', limit: 30 },
    { queryWithRetry: async (sql, params) => {
      captured = { sql, params };
      return { rows: [{ id:'1', name:'file.xlsx', status:'ready', chars:10, preview:'data' }] };
    } },
  );
  assert.match(captured.sql, /\(\$2='all' OR status=\$2\)/u);
  assert.equal(captured.params[1], 'all');
  assert.equal(result.documents[0].name, 'file.xlsx');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findTool } = require('../core/tools');

const org = '11111111-1111-4111-8111-111111111111';

test('document search adds Russian stems so inflected questions find document text', async () => {
  const tool = findTool('search_documents');
  let captured;
  await tool.handler(
    { organizationId: org },
    { query: 'мотивация управляющего', limit: 5 },
    { queryWithRetry: async (sql, params) => { captured = { sql, params }; return { rows: [] }; } },
  );
  assert.ok(captured.params.includes('управляющ'));
  assert.ok(captured.params.includes('мотивац'));
  assert.match(captured.sql, /status='ready'/u);
  assert.match(captured.sql, /organization_id=\$1::uuid/u);
});

test('read_document restores an older truncated extraction before reading deep offsets', async () => {
  const tool = findTool('read_document');
  const fullText = 'x'.repeat(100000) + 'FORMULA: manager bonus = salary * coefficient';
  let reprocessed = false;
  const result = await tool.handler(
    { organizationId: org },
    { name: 'bonus.xlsx', start_char: 100000, max_chars: 12000 },
    {
      queryWithRetry: async () => ({ rows: [{
        id: 'doc-id',
        name: 'bonus.xlsx',
        created_at: '2026-10-16T10:00:00.000Z',
        extracted_text: 'x'.repeat(100000),
        extraction_json: { type: 'spreadsheet' },
      }] }),
      reprocessDocument: async (_user, id) => {
        reprocessed = true;
        assert.equal(id, 'doc-id');
        return { text: fullText, meta: { type: 'spreadsheet', fullTextComplete: true } };
      },
    },
  );
  assert.equal(reprocessed, true);
  assert.match(result.text, /FORMULA: manager bonus/u);
  assert.equal(result.source_text_truncated, false);
  assert.equal(result.has_more, false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, findTool } = require('../core/tools');

test('findTool returns get_pnl', () => {
  assert.ok(findTool('get_pnl'));
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

test('v1 exposes exactly six tools', () => {
  assert.equal(TOOLS.length, 6);
  assert.deepEqual(TOOLS.map(tool => tool.name), [
    'get_pnl','get_fot','get_sales','get_documents','get_memory','get_secretary_context',
  ]);
});

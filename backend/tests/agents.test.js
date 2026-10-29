'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AGENTS, isFinanceQuestion, resolveAgent, toolsForAgent, agentAllowsTool } = require('../core/agents');

test('financial intent routes to the financial diagnostics agent', () => {
  for (const question of [
    'Разбери P&L за октябрь',
    'Где мы теряем деньги?',
    'Покажи перерасход по бюджету',
    'Почему упала прибыль?',
    'Проверь food cost и prime cost',
  ]) {
    assert.equal(resolveAgent(question).id, 'finance_diagnostics', question);
  }
});

test('non-financial questions remain with the general STEN assistant', () => {
  for (const question of ['Привет', 'Составь план на сегодня', 'Подготовь чек-лист открытия кухни']) {
    assert.equal(resolveAgent(question).id, 'sten', question);
  }
  assert.equal(isFinanceQuestion(''), false);
});

test('financial agent receives only explicitly allowed tools', () => {
  const tools = [
    { name: 'get_pnl' },
    { name: 'find_deviations' },
    { name: 'get_secretary_context' },
    { name: 'get_fot' },
    { name: 'search_documents' },
  ];
  assert.deepEqual(
    toolsForAgent(tools, AGENTS.finance_diagnostics).map(tool => tool.name),
    ['get_pnl', 'find_deviations', 'search_documents'],
  );
  assert.equal(agentAllowsTool(AGENTS.finance_diagnostics, 'get_pnl'), true);
  assert.equal(agentAllowsTool(AGENTS.finance_diagnostics, 'get_secretary_context'), false);
});

test('general STEN retains the existing tool set', () => {
  const tools = [{ name: 'get_pnl' }, { name: 'get_secretary_context' }];
  assert.deepEqual(toolsForAgent(tools, AGENTS.sten), tools);
  assert.equal(agentAllowsTool(AGENTS.sten, 'get_secretary_context'), true);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AGENTS,
  isFinanceQuestion,
  isOperationsQuestion,
  isSecretaryQuestion,
  resolveAgent,
  toolsForAgent,
  agentAllowsTool,
} = require('../core/agents');

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
  assert.equal(isFinanceQuestion(''), false);
});

test('operational questions route to the operations analyst', () => {
  for (const question of [
    'Подготовь чек-лист открытия кухни',
    'Разбери жалобы гостей',
    'Что проверить на смене?',
  ]) {
    assert.equal(resolveAgent(question).id, 'operations_analyst', question);
  }
  assert.equal(isOperationsQuestion(''), false);
});

test('meeting and reminder questions route to the secretary', () => {
  for (const question of [
    'Напомни о встрече завтра',
    'Покажи мои задачи',
    'Создай заметку по договорённостям',
  ]) {
    assert.equal(resolveAgent(question).id, 'secretary', question);
  }
  assert.equal(isSecretaryQuestion(''), false);
});

test('general questions remain with the general STEN assistant', () => {
  for (const question of ['Привет', 'Составь план на сегодня']) {
    assert.equal(resolveAgent(question).id, 'sten', question);
  }
});

test('each specialist receives only explicitly allowed tools', () => {
  const tools = [
    { name: 'get_pnl' },
    { name: 'find_deviations' },
    { name: 'get_sales' },
    { name: 'get_secretary_context' },
    { name: 'get_fot' },
    { name: 'search_documents' },
    { name: 'get_memory' },
  ];
  assert.deepEqual(
    toolsForAgent(tools, AGENTS.finance_diagnostics).map(tool => tool.name),
    ['get_pnl', 'find_deviations', 'search_documents', 'get_memory'],
  );
  assert.deepEqual(
    toolsForAgent(tools, AGENTS.operations_analyst).map(tool => tool.name),
    ['get_pnl', 'find_deviations', 'get_sales', 'search_documents', 'get_memory'],
  );
  assert.deepEqual(
    toolsForAgent(tools, AGENTS.secretary).map(tool => tool.name),
    ['get_secretary_context', 'search_documents', 'get_memory'],
  );
  assert.equal(agentAllowsTool(AGENTS.finance_diagnostics, 'get_secretary_context'), false);
  assert.equal(agentAllowsTool(AGENTS.operations_analyst, 'get_secretary_context'), false);
  assert.equal(agentAllowsTool(AGENTS.secretary, 'get_pnl'), false);
});

test('general STEN retains the existing tool set', () => {
  const tools = [{ name: 'get_pnl' }, { name: 'get_secretary_context' }];
  assert.deepEqual(toolsForAgent(tools, AGENTS.sten), tools);
  assert.equal(agentAllowsTool(AGENTS.sten, 'get_secretary_context'), true);
});

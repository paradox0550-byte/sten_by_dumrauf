'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processTelegramMessageBatch } = require('../telegramSecretaryWorker');

test('worker analyzes only messages from chats bound to a restaurant and stores source-linked result', async () => {
  const calls = [];
  const queryWithRetry = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('LEFT JOIN telegram_message_analyses')) return { rows: [{
      chat_id: '-1001', message_id: '55', sender_id: '7001', sender_name: 'Анна',
      message_text: 'Иван, проверь холодильник до 18:00', message_date: '2026-11-03T12:00:00.000Z',
      organization_id: 'org-1', restaurant_id: 'rest-1', restaurant_name: 'Тверская',
    }] };
    if (sql.includes('SELECT sender_name, message_text')) return { rows: [{ sender_name: 'Менеджер', message_text: 'Проверяем кухню', message_date: '2026-11-03T11:00:00.000Z' }] };
    if (sql.includes('INSERT INTO telegram_message_analyses')) return { rows: [{ message_id: '55' }] };
    throw new Error('Unexpected query');
  };
  let promptSeen = '';
  const result = await processTelegramMessageBatch({
    queryWithRetry,
    analyze: async prompt => {
      promptSeen = prompt;
      return { intent: 'task', severity: 'medium', confidence: 0.9, summary: 'Проверить холодильник', title: 'Проверить холодильник', assignee_mention: 'Иван', due_at: '2026-11-03T18:00:00.000Z' };
    },
  });
  assert.deepEqual(result, { scanned: 1, analyzed: 1, skipped: 0, failed: 0 });
  assert.match(promptSeen, /Тверская/u);
  assert.match(calls[0].sql, /telegram_chat_bindings/u);
  assert.match(calls[2].sql, /ON CONFLICT\(chat_id,message_id\) DO NOTHING/u);
  assert.equal(calls[2].params[4], '7001');
});

test('worker does not store malformed model output and continues safely', async () => {
  let inserts = 0;
  const queryWithRetry = async sql => {
    if (sql.includes('LEFT JOIN telegram_message_analyses')) return { rows: [{
      chat_id: '-1001', message_id: '56', sender_id: '7002', sender_name: 'Пётр',
      message_text: 'Поставка задерживается', message_date: null,
      organization_id: 'org-1', restaurant_id: 'rest-1', restaurant_name: 'Арбат',
    }] };
    if (sql.includes('SELECT sender_name, message_text')) return { rows: [] };
    if (sql.includes('INSERT INTO telegram_message_analyses')) inserts += 1;
    return { rows: [] };
  };
  const result = await processTelegramMessageBatch({ queryWithRetry, analyze: async () => 'bad json' });
  assert.equal(result.skipped, 1);
  assert.equal(inserts, 0);
});

test('worker scopes manual analysis to the authenticated organization', async () => {
  let firstCall;
  const queryWithRetry = async (sql, params, options) => {
    if (!firstCall) firstCall = { sql, params, options };
    return { rows: [] };
  };
  const result = await processTelegramMessageBatch({
    queryWithRetry,
    analyze: async () => { throw new Error('No pending messages should be analyzed'); },
    limit: 20,
    orgId: 'org-123',
  });
  assert.deepEqual(result, { scanned: 0, analyzed: 0, skipped: 0, failed: 0 });
  assert.match(firstCall.sql, /b\.organization_id=\$1::uuid/u);
  assert.deepEqual(firstCall.params, ['org-123', 20]);
  assert.equal(firstCall.options.orgId, 'org-123');
});

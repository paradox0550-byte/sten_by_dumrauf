'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEscalationMessage, buildOperationalDigest, processTelegramAutomationJobs } = require('../telegramControl');

test('digest uses persisted finding and action counts without fabricating financial values', () => {
  const text = buildOperationalDigest({
    restaurantName: 'Тверская',
    kind: 'morning',
    dateLabel: '2026-11-06',
    findings: [{ status: 'pending', analysis_json: { severity: 'high', summary: 'Стоп-лист не обновлён' } }],
    actions: [{ status: 'open', title: 'Проверить стоп-лист', assignee_name: 'Иван', due_at: '2026-11-06T12:00:00Z' }],
  });
  assert.match(text, /AI-находки без решения: 1/u);
  assert.match(text, /Активные задачи: 1/u);
  assert.match(text, /Стоп-лист не обновлён/u);
  assert.match(text, /Отсутствующие данные не заменяются нулями/u);
  assert.doesNotMatch(text, /Выручка: 0/u);
});

test('escalation message identifies assignee, deadline and sequence', () => {
  const text = buildEscalationMessage({
    title: 'Проверить холодильник',
    assignee_name: 'Иван',
    due_at: '2026-11-06T10:00:00Z',
    restaurant_name: 'Арбат',
  }, 2);
  assert.match(text, /Проверить холодильник/u);
  assert.match(text, /Иван/u);
  assert.match(text, /Эскалация №2/u);
});

test('automation worker requires adapters', async () => {
  await assert.rejects(() => processTelegramAutomationJobs({}), /requires database and Telegram adapters/u);
});

test('automation worker enqueues and sends one scheduled summary exactly once', async () => {
  const statements = [];
  const sent = [];
  const queryWithRetry = async (sql, params) => {
    statements.push(sql);
    if (sql.includes('WITH due AS')) return { rows: [] };
    if (sql.includes('SELECT s.chat_id')) return { rows: [{
      chat_id: '-1001', organization_id: 'org-1', restaurant_id: 'rest-1',
      restaurant_name: 'Тверская', local_date: '2026-11-06', timezone: 'Europe/Moscow',
      digest_kind: 'morning',
    }] };
    if (sql.includes('INSERT INTO telegram_outbox') && sql.includes("'building'")) return { rows: [{ id: 'outbox-1' }] };
    if (sql.includes('SELECT analysis_json')) return { rows: [{ status: 'pending', analysis_json: { severity: 'high', summary: 'Проверить стоп-лист' } }] };
    if (sql.includes('SELECT title, assignee_name')) return { rows: [{ title: 'Проверить стоп-лист', assignee_name: 'Иван', due_at: '2026-11-06T12:00:00Z', status: 'open' }] };
    if (sql.includes('UPDATE telegram_outbox SET message_text')) return { rows: [] };
    if (sql.includes('WITH claimable')) return { rows: [{
      id: 'outbox-1', organization_id: 'org-1', restaurant_id: 'rest-1',
      chat_id: '-1001', kind: 'morning', message_text: 'Сводка', attempts: 1,
    }] };
    return { rows: [] };
  };
  const result = await processTelegramAutomationJobs({
    queryWithRetry,
    sendMessage: async (chatId, message) => sent.push({ chatId, message }),
    buildFinancialReport: async () => 'Финансовый отчёт',
    now: new Date('2026-11-06T07:00:00.000Z'),
  });
  assert.equal(result.summariesQueued, 1);
  assert.equal(result.sent, 1);
  assert.deepEqual(sent, [{ chatId: '-1001', message: 'Сводка' }]);
  assert.ok(statements.some(sql => sql.includes('FOR UPDATE SKIP LOCKED')));
});

test('automation worker records failed digest construction for retry instead of leaving a building row', async () => {
  const statements = [];
  const queryWithRetry = async (sql) => {
    statements.push(sql);
    if (sql.includes('WITH due AS')) return { rows: [] };
    if (sql.includes('SELECT s.chat_id')) return { rows: [{
      chat_id: '-1001', organization_id: 'org-1', restaurant_id: 'rest-1',
      restaurant_name: 'Тверская', local_date: '2026-11-06', timezone: 'Europe/Moscow',
      digest_kind: 'morning',
    }] };
    if (sql.includes('INSERT INTO telegram_outbox') && sql.includes("'building'")) return { rows: [{ id: 'outbox-failed' }] };
    if (sql.includes('SELECT analysis_json')) throw new Error('temporary database read failure');
    if (sql.includes("SET status='failed',attempts=attempts+1")) return { rows: [] };
    return { rows: [] };
  };
  const result = await processTelegramAutomationJobs({
    queryWithRetry,
    sendMessage: async () => { throw new Error('A digest with missing source data must not be sent'); },
    now: new Date('2026-11-06T07:00:00.000Z'),
  });
  assert.equal(result.failed, 1);
  assert.ok(statements.some(sql => sql.includes("SET status='failed',attempts=attempts+1")));
  assert.ok(statements.some(sql => sql.includes('ON CONFLICT(idempotency_key) DO UPDATE')));
});

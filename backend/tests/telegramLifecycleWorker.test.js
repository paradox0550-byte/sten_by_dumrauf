'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zonedParts, safeTimeZone, processTelegramLifecycleJobs } = require('../telegramLifecycleWorker');

test('zoned clock respects the configured restaurant timezone', () => {
  const value = new Date('2026-11-06T07:00:00.000Z');
  assert.deepEqual(zonedParts(value, 'Europe/Moscow'), { date: '2026-11-06', time: '10:00' });
  assert.equal(safeTimeZone('Not/AZone'), 'Europe/Moscow');
});

test('scheduled report is sent once per local day and logged', async () => {
  const calls = [];
  const sent = [];
  const queryWithRetry = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM telegram_bot_settings s')) return { rows: [{
      chat_id: '-1001', organization_id: '00000000-0000-4000-8000-000000000001',
      restaurant_id: '00000000-0000-4000-8000-000000000002', timezone: 'Europe/Moscow',
      morning_report_time: '10:00:00', evening_report_time: '21:00:00',
      morning_report_enabled: true, evening_report_enabled: false,
    }] };
    if (sql.includes('FROM telegram_message_analyses')) return { rows: [{ total: 4, urgent: 1 }] };
    if (sql.includes('FROM operational_actions')) return { rows: [{ active: 2, verification: 1 }] };
    if (sql.includes('INSERT INTO telegram_delivery_log')) return { rows: [{ id: 'delivery-1' }] };
    return { rows: [] };
  };
  const result = await processTelegramLifecycleJobs({
    queryWithRetry,
    sendMessage: async (chatId, body) => sent.push({ chatId, body }),
    now: new Date('2026-11-06T07:00:00.000Z'),
  });
  assert.equal(result.reportsSent, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Требуют внимания: 1/u);
  assert.ok(calls.some(call => call.sql.includes("status='sent'") || call.sql.includes('UPDATE telegram_delivery_log')));
});

test('overdue tasks are escalated only through a bound Telegram group', async () => {
  const sent = [];
  const queryWithRetry = async (sql) => {
    if (sql.includes('FROM telegram_bot_settings s')) return { rows: [] };
    if (sql.includes('FROM operational_actions a')) return { rows: [{
      id: '00000000-0000-4000-8000-000000000003',
      organization_id: '00000000-0000-4000-8000-000000000001',
      restaurant_id: '00000000-0000-4000-8000-000000000002',
      title: 'Проверить холодильник', due_at: '2026-11-06T05:00:00.000Z',
      status: 'open', chat_id: '-1001', escalation_minutes: 60,
    }] };
    if (sql.includes('INSERT INTO telegram_delivery_log')) return { rows: [{ id: 'delivery-2' }] };
    return { rows: [] };
  };
  const result = await processTelegramLifecycleJobs({
    queryWithRetry,
    sendMessage: async (chatId, body) => sent.push({ chatId, body }),
    now: new Date('2026-11-06T07:00:00.000Z'),
  });
  assert.equal(result.escalationsSent, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Эскалация/u);
});

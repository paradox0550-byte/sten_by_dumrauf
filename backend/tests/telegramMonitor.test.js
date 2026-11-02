'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTelegramUpdate, persistTelegramUpdate } = require('../telegramMonitor');

const callbackUpdate = (updateId = 101) => ({
  update_id: updateId,
  callback_query: {
    id: 'callback-1',
    from: { id: 7001, first_name: 'Иван', last_name: 'Петров' },
    message: { message_id: 55, chat: { id: -100123, type: 'supergroup', title: 'Красная Поляна' } },
    data: 'oc:status:done',
  },
});

test('normalizes group callback queries and enforces Telegram callback data byte limit', () => {
  const normalized = normalizeTelegramUpdate(callbackUpdate());
  assert.equal(normalized.kind, 'callback_query');
  assert.equal(normalized.chatId, '-100123');
  assert.equal(normalized.senderId, '7001');
  assert.equal(normalized.data, 'oc:status:done');

  const oversized = callbackUpdate();
  oversized.callback_query.data = 'я'.repeat(33);
  assert.equal(normalizeTelegramUpdate(oversized).reason, 'callback_data_too_long');
});

test('persists callback update once without writing a chat message', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ update_id: params[0] }] };
  };
  const result = await persistTelegramUpdate(query, callbackUpdate());
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO telegram_updates/);
  assert.doesNotMatch(calls[0].sql, /telegram_messages/);
  assert.equal(result.kind, 'callback_query');
  assert.equal(result.stored, true);
  assert.equal(result.callback.callbackQueryId, 'callback-1');
});

test('duplicate callback update is a no-op and exposes no callback for business processing', async () => {
  let calls = 0;
  const query = async () => { calls += 1; return { rows: [] }; };
  const result = await persistTelegramUpdate(query, callbackUpdate());
  assert.equal(calls, 1);
  assert.equal(result.duplicate, true);
  assert.equal(result.stored, false);
  assert.equal(result.callback, null);
});

test('ordinary group messages retain their existing persistence path', async () => {
  let sqlSeen = '';
  const query = async (sql) => {
    sqlSeen = sql;
    return { rows: [{ is_new: true, message_stored: true }] };
  };
  const result = await persistTelegramUpdate(query, {
    update_id: 202,
    message: {
      message_id: 56,
      date: 1793700000,
      chat: { id: -100123, type: 'group', title: 'Смена' },
      from: { id: 7002, first_name: 'Анна' },
      text: 'Проверка кухни',
    },
  });
  assert.match(sqlSeen, /telegram_messages/);
  assert.equal(result.stored, true);
  assert.equal(result.duplicate, false);
});

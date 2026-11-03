'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTelegramUpdate, persistTelegramUpdate, claimTelegramUpdate, completeTelegramUpdate, failTelegramUpdate } = require('../telegramMonitor');

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

test('failed persisted updates can be claimed again and completed exactly once', async () => {
  const calls = [];
  let state = 'pending';
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('UPDATE telegram_updates') && sql.includes("SET processing_status='processing'")) {
      if (state === 'pending') {
        state = 'processing';
        return { rows: [{ update_id: params[0], processing_attempts: 1 }] };
      }
      return { rows: [] };
    }
    if (sql.includes('SELECT processing_status')) return { rows: [{ processing_status: state }] };
    if (sql.includes("SET processing_status='pending'")) {
      state = 'pending';
      return { rows: [] };
    }
    if (sql.includes("SET processing_status='processed'")) {
      state = 'processed';
      return { rows: [{ update_id: params[0] }] };
    }
    throw new Error('Unexpected query');
  };

  const firstClaim = await claimTelegramUpdate(query, 901);
  assert.equal(firstClaim.claimed, true);
  await failTelegramUpdate(query, 901, firstClaim.attempts, new Error('Telegram upstream timeout'));
  const retryClaim = await claimTelegramUpdate(query, 901);
  assert.equal(retryClaim.claimed, true);
  await completeTelegramUpdate(query, 901, retryClaim.attempts);
  const duplicateClaim = await claimTelegramUpdate(query, 901);
  assert.equal(duplicateClaim.claimed, false);
  assert.equal(duplicateClaim.processed, true);
  assert.equal(state, 'processed');
  assert.equal(calls.filter(call => call.sql.includes('UPDATE telegram_updates') && call.sql.includes("SET processing_status='processing'")).length, 3);
});

test('stale processing attempts cannot complete or release a newer lease', async () => {
  const statements = [];
  const query = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes("SET processing_status='processed'")) return { rows: [] };
    if (sql.includes("SET processing_status='pending'")) return { rows: [] };
    throw new Error('Unexpected query');
  };
  await assert.rejects(() => completeTelegramUpdate(query, 903, 1), /lease was lost/u);
  await failTelegramUpdate(query, 903, 1, new Error('late failure'));
  assert.match(statements[0].sql, /processing_attempts=\$2/u);
  assert.deepEqual(statements[0].params, [903, 1]);
  assert.match(statements[1].sql, /processing_attempts=\$3/u);
  assert.deepEqual(statements[1].params, [903, 'late failure', 1]);
});
test('an active processing lease is not claimed concurrently', async () => {
  const query = async (sql) => {
    if (sql.includes('UPDATE telegram_updates')) return { rows: [] };
    return { rows: [{ processing_status: 'processing' }] };
  };
  const result = await claimTelegramUpdate(query, 902);
  assert.equal(result.claimed, false);
  assert.equal(result.busy, true);
});

test('duplicate message persistence does not mutate chat activity and remains retryable', async () => {
  let sqlSeen = '';
  const query = async (sql) => {
    sqlSeen = sql;
    return { rows: [{ is_new: false, message_stored: false }] };
  };
  const result = await persistTelegramUpdate(query, {
    update_id: 203,
    message: {
      message_id: 57,
      date: 1793700000,
      chat: { id: -100123, type: 'group', title: 'Смена' },
      from: { id: 7002, first_name: 'Анна' },
      text: 'Повторная доставка',
    },
  });
  assert.match(sqlSeen, /FROM inserted_update/);
  assert.equal(result.kind, 'message');
  assert.equal(result.updateId, 203);
  assert.equal(result.duplicate, true);
});

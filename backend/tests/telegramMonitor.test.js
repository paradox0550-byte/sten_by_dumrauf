'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTelegramUpdate, persistTelegramUpdate } = require('../telegramMonitor');

const base = {
  update_id: 101,
  message: {
    message_id: 7,
    date: 1793550000,
    chat: { id: -100123, type: 'supergroup', title: 'Ресторан' },
    from: { id: 42, first_name: 'Анна', username: 'anna', is_bot: false },
    text: 'Поставка задерживается',
  },
};

test('normalizes new group messages with source metadata', () => {
  const result = normalizeTelegramUpdate(base);
  assert.equal(result.kind, 'message');
  assert.equal(result.chatId, '-100123');
  assert.equal(result.chatTitle, 'Ресторан');
  assert.equal(result.senderName, 'Анна');
  assert.equal(result.text, 'Поставка задерживается');
  assert.equal(result.edited, false);
});

test('normalizes edited group messages and captions', () => {
  const result = normalizeTelegramUpdate({
    update_id: 102,
    edited_message: {
      ...base.message,
      caption: 'Исправленный текст',
      edit_date: 1793550100,
    },
  });
  assert.equal(result.edited, true);
  assert.equal(result.text, 'Исправленный текст');
  assert.ok(result.editedAt instanceof Date);
});

test('ignores private chats and messages from bots', () => {
  assert.equal(normalizeTelegramUpdate({
    update_id: 103,
    message: { ...base.message, chat: { id: 42, type: 'private' } },
  }).kind, 'unsupported');
  assert.equal(normalizeTelegramUpdate({
    update_id: 104,
    message: { ...base.message, from: { id: 1, is_bot: true } },
  }).kind, 'unsupported');
});

test('rejects updates without a valid update id', () => {
  assert.equal(normalizeTelegramUpdate({ message: base.message }).kind, 'invalid');
});

test('persists supported updates with one parameterized statement', async () => {
  let captured;
  const query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ is_new: true, message_stored: true }] };
  };
  const result = await persistTelegramUpdate(query, base);
  assert.equal(result.stored, true);
  assert.equal(result.duplicate, false);
  assert.match(captured.sql, /ON CONFLICT \(update_id\) DO NOTHING/);
  assert.equal(captured.params[0], 101);
});

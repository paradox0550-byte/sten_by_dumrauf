'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfilePayload } = require('../core/profile');

test('normalizes profile fields and accepts numeric Telegram chat IDs', () => {
  assert.deepEqual(normalizeProfilePayload({
    firstName: ' Александр ',
    lastName: ' Думрауф ',
    position: ' Владелец ',
    telegramChatId: '123456789',
  }), {
    firstName: 'Александр',
    lastName: 'Думрауф',
    position: 'Владелец',
    telegramChatId: '123456789',
  });
});

test('accepts negative Telegram IDs used by groups', () => {
  assert.equal(normalizeProfilePayload({ telegramChatId: '-1001234567890' }).telegramChatId, '-1001234567890');
});

test('rejects letters and malformed Telegram IDs', () => {
  for (const telegramChatId of ['abcde', '12 345', '1234', '123456789012345678901', '--12345']) {
    assert.throws(
      () => normalizeProfilePayload({ telegramChatId }),
      error => error.code === 'TELEGRAM_ID_INVALID' && error.status === 400,
    );
  }
});

test('enforces profile field length limits', () => {
  assert.throws(
    () => normalizeProfilePayload({ firstName: 'x'.repeat(81) }),
    error => error.code === 'PROFILE_INVALID' && error.status === 400,
  );
  assert.throws(
    () => normalizeProfilePayload({ position: 'x'.repeat(121) }),
    error => error.code === 'PROFILE_INVALID' && error.status === 400,
  );
});

test('empty profile values remain empty strings for the existing API contract', () => {
  assert.deepEqual(normalizeProfilePayload({}), {
    firstName: '',
    lastName: '',
    position: '',
    telegramChatId: '',
  });
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  verifyTelegramWebAppInitData,
} = require('../telegramMiniAppAuth');

const BOT_TOKEN = '123456:telegram-test-token';
const NOW = 1_800_000_000;

function signedInitData(fields, token = BOT_TOKEN) {
  const entries = Object.entries(fields);
  const dataCheckString = entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams([...Object.entries(fields), ['hash', hash]]).toString();
}

function validFields(authDate = NOW - 5) {
  return {
    auth_date: String(authDate),
    query_id: 'AAExampleQuery',
    user: JSON.stringify({ id: 987654321, first_name: 'Test', username: 'test_user' }),
  };
}

test('accepts valid Telegram initData and returns the verified Telegram identity', () => {
  const result = verifyTelegramWebAppInitData(
    signedInitData(validFields()),
    BOT_TOKEN,
    { nowSeconds: NOW },
  );

  assert.equal(result.telegramUserId, '987654321');
  assert.equal(result.user.first_name, 'Test');
  assert.equal(result.authDate, NOW - 5);
  assert.equal(result.queryId, 'AAExampleQuery');
});

test('rejects a modified initData payload', () => {
  const initData = signedInitData(validFields()).replace('test_user', 'attacker');
  assert.throws(
    () => verifyTelegramWebAppInitData(initData, BOT_TOKEN, { nowSeconds: NOW }),
    { code: 'TELEGRAM_INIT_DATA_INVALID', status: 401 },
  );
});

test('rejects stale and future auth_date values', () => {
  assert.throws(
    () => verifyTelegramWebAppInitData(
      signedInitData(validFields(NOW - 601)),
      BOT_TOKEN,
      { nowSeconds: NOW, maxAgeSeconds: 600 },
    ),
    { code: 'TELEGRAM_INIT_DATA_INVALID' },
  );
  assert.throws(
    () => verifyTelegramWebAppInitData(
      signedInitData(validFields(NOW + 31)),
      BOT_TOKEN,
      { nowSeconds: NOW, maxFutureSkewSeconds: 30 },
    ),
    { code: 'TELEGRAM_INIT_DATA_INVALID' },
  );
});

test('rejects duplicate fields and malformed Telegram user payloads', () => {
  const valid = signedInitData(validFields());
  assert.throws(
    () => verifyTelegramWebAppInitData(`${valid}&auth_date=${NOW}`, BOT_TOKEN, { nowSeconds: NOW }),
    { code: 'TELEGRAM_INIT_DATA_INVALID' },
  );

  const malformedUser = signedInitData({
    auth_date: String(NOW),
    user: JSON.stringify({ id: 0 }),
  });
  assert.throws(
    () => verifyTelegramWebAppInitData(malformedUser, BOT_TOKEN, { nowSeconds: NOW }),
    { code: 'TELEGRAM_INIT_DATA_INVALID' },
  );
});

test('fails closed when the bot token is not configured', () => {
  assert.throws(
    () => verifyTelegramWebAppInitData(signedInitData(validFields()), ''),
    { code: 'TELEGRAM_MINI_APP_AUTH_NOT_CONFIGURED', status: 503 },
  );
});

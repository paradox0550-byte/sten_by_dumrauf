'use strict';

const crypto = require('node:crypto');

const DEFAULT_MAX_AGE_SECONDS = 10 * 60;
const DEFAULT_MAX_FUTURE_SKEW_SECONDS = 30;
const MAX_INIT_DATA_LENGTH = 16 * 1024;

function invalidInitData() {
  const error = new Error('Недействительные данные Telegram Mini App');
  error.code = 'TELEGRAM_INIT_DATA_INVALID';
  error.status = 401;
  return error;
}

/**
 * Verify Telegram Web App initData using Telegram's documented WebAppData
 * HMAC-SHA256 derivation. The caller must pass the raw initData string,
 * before parsing or re-serializing it.
 */
function verifyTelegramWebAppInitData(initData, botToken, options = {}) {
  if (typeof initData !== 'string' || !initData || initData.length > MAX_INIT_DATA_LENGTH) {
    throw invalidInitData();
  }
  if (typeof botToken !== 'string' || !botToken.trim()) {
    const error = new Error('Telegram Mini App authentication is not configured');
    error.code = 'TELEGRAM_MINI_APP_AUTH_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const nowSeconds = Number.isInteger(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  const maxAgeSeconds = Number.isInteger(options.maxAgeSeconds) && options.maxAgeSeconds > 0
    ? options.maxAgeSeconds
    : DEFAULT_MAX_AGE_SECONDS;
  const maxFutureSkewSeconds = Number.isInteger(options.maxFutureSkewSeconds) && options.maxFutureSkewSeconds >= 0
    ? options.maxFutureSkewSeconds
    : DEFAULT_MAX_FUTURE_SKEW_SECONDS;

  const params = new URLSearchParams(initData);
  const entries = [...params.entries()];
  const keys = new Set();
  for (const [key] of entries) {
    if (!key || keys.has(key)) throw invalidInitData();
    keys.add(key);
  }

  const suppliedHash = params.get('hash');
  if (!suppliedHash || !/^[a-f0-9]{64}$/i.test(suppliedHash)) {
    throw invalidInitData();
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) throw invalidInitData();
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate)
      || authDate > nowSeconds + maxFutureSkewSeconds
      || nowSeconds - authDate > maxAgeSeconds) {
    throw invalidInitData();
  }

  const userRaw = params.get('user');
  if (!userRaw) throw invalidInitData();
  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw invalidInitData();
  }
  if (!user || typeof user !== 'object' || Array.isArray(user)
      || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) {
    throw invalidInitData();
  }

  const dataCheckString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const expectedHash = Buffer.from(suppliedHash, 'hex');
  if (expectedHash.length !== calculatedHash.length
      || !crypto.timingSafeEqual(expectedHash, calculatedHash)) {
    throw invalidInitData();
  }

  return {
    telegramUserId: String(user.id),
    user,
    authDate,
    queryId: params.get('query_id') || null,
    chatInstance: params.get('chat_instance') || null,
  };
}

module.exports = {
  verifyTelegramWebAppInitData,
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MAX_FUTURE_SKEW_SECONDS,
};

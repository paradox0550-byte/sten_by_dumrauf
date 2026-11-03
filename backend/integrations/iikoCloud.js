'use strict';

const crypto = require('node:crypto');

const IIKO_API_BASE = 'https://api-ru.iiko.services';

function encryptionKey(value = process.env.IIKO_CREDENTIALS_ENCRYPTION_KEY) {
  if (!value) {
    const error = new Error('На сервере не настроен ключ шифрования интеграций.');
    error.code = 'IIKO_ENCRYPTION_KEY_MISSING';
    error.status = 503;
    throw error;
  }
  const key = Buffer.from(String(value), 'base64');
  if (key.length !== 32) {
    const error = new Error('Ключ шифрования интеграций должен быть 32-байтовым значением в Base64.');
    error.code = 'IIKO_ENCRYPTION_KEY_INVALID';
    error.status = 503;
    throw error;
  }
  return key;
}

function encryptCredentials(credentials, keyValue) {
  const key = encryptionKey(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    fingerprint: crypto.createHmac('sha256', key)
      .update([credentials.appId, credentials.apiKey].join('\u0000'))
      .digest('hex'),
  };
}

function decryptCredentials(record, keyValue) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyValue),
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plain);
}

async function postJson(path, body, headers = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(IIKO_API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    const error = new Error('Не удалось связаться с iiko Cloud API.');
    error.code = 'IIKO_NETWORK_ERROR';
    error.status = 502;
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      response.status === 401 ? 'iiko отклонила учётные данные. Проверьте appId, Client Secret и API-ключ.'
        : response.status === 403 ? 'У приложения нет доступа к iiko API или IP не разрешён.'
          : response.status === 429 ? 'iiko временно ограничила частоту запросов. Повторите позже.'
            : 'iiko Cloud API вернул ошибку. Повторите попытку или обратитесь в поддержку iiko.',
    );
    error.code = response.status === 401 ? 'IIKO_CREDENTIALS_REJECTED'
      : response.status === 403 ? 'IIKO_ACCESS_DENIED'
        : response.status === 429 ? 'IIKO_RATE_LIMITED' : 'IIKO_API_ERROR';
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.correlationId = typeof payload?.correlationId === 'string' ? payload.correlationId : null;
    throw error;
  }
  return payload;
}

async function connectIikoCloud(credentials, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const tokenResponse = await postJson('/api/v2/access_token', {
    appId: credentials.appId,
    clientSecret: credentials.clientSecret,
    apiKey: credentials.apiKey,
  }, {}, fetchImpl);
  if (typeof tokenResponse?.token !== 'string' || !tokenResponse.token) {
    const error = new Error('iiko не вернула токен доступа в ожидаемом формате.');
    error.code = 'IIKO_TOKEN_RESPONSE_INVALID';
    error.status = 502;
    throw error;
  }
  const organizationsResponse = await postJson('/api/1/organizations', {}, {
    Authorization: 'Bearer ' + tokenResponse.token,
  }, fetchImpl);
  if (!Array.isArray(organizationsResponse?.organizations)) {
    const error = new Error('iiko вернула список организаций в неизвестном формате.');
    error.code = 'IIKO_ORGANIZATIONS_RESPONSE_INVALID';
    error.status = 502;
    throw error;
  }
  const organizations = organizationsResponse.organizations
    .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map(item => ({ id: item.id, name: item.name }));
  return {
    organizations,
    correlationId: typeof organizationsResponse.correlationId === 'string'
      ? organizationsResponse.correlationId : null,
  };
}

module.exports = {
  IIKO_API_BASE,
  connectIikoCloud,
  decryptCredentials,
  encryptCredentials,
};

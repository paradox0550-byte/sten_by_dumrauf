'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  connectIikoCloud,
  decryptCredentials,
  encryptCredentials,
} = require('../integrations/iikoCloud');

const key = Buffer.alloc(32, 7).toString('base64');
const credentials = { appId: 'sten-test-app', clientSecret: 'secret-value', apiKey: 'restaurant-key' };

test('encrypts credentials and decrypts only with the same key', () => {
  const encrypted = encryptCredentials(credentials, key);
  assert.equal(decryptCredentials({
    ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag,
  }, key).clientSecret, credentials.clientSecret);
  assert.notEqual(encrypted.ciphertext, credentials.clientSecret);
  assert.throws(() => decryptCredentials({
    ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag,
  }, Buffer.alloc(32, 8).toString('base64')));
});

test('connects with documented token and organization endpoints', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v2/access_token')) {
      return { ok: true, status: 200, json: async () => ({ token: 'temporary-jwt' }) };
    }
    return { ok: true, status: 200, json: async () => ({
      organizations: [{ id: 'external-org-1', name: 'Restaurant One' }],
      correlationId: 'correlation-1',
    }) };
  };
  const result = await connectIikoCloud(credentials, { fetchImpl });
  assert.deepEqual(result.organizations, [{ id: 'external-org-1', name: 'Restaurant One' }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body, JSON.stringify(credentials));
  assert.equal(calls[1].options.body, '{}');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer temporary-jwt');
});

test('does not accept malformed organization responses', async () => {
  let call = 0;
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => (++call === 1 ? { token: 'temporary-jwt' } : { items: [] }),
  });
  await assert.rejects(
    connectIikoCloud(credentials, { fetchImpl }),
    error => error.code === 'IIKO_ORGANIZATIONS_RESPONSE_INVALID',
  );
});

test('requires a dedicated 32-byte base64 encryption key', () => {
  assert.throws(() => encryptCredentials(credentials, ''), error => error.code === 'IIKO_ENCRYPTION_KEY_MISSING');
  assert.throws(() => encryptCredentials(credentials, 'short'), error => error.code === 'IIKO_ENCRYPTION_KEY_INVALID');
});

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'sten-route-contract-test-secret';

const { app } = require('../index');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('operational control and Telegram Monitor routes are registered', async () => {
  const routes = [
    ['GET', '/api/operational-control'],
    ['POST', '/api/operational-control/observations'],
    ['POST', '/api/operational-control/actions'],
    ['PATCH', '/api/operational-control/actions/00000000-0000-4000-8000-000000000001'],
    ['GET', '/api/telegram-bot/settings?chat_id=-100123'],
    ['PUT', '/api/telegram-bot/settings'],
    ['GET', '/api/telegram-monitor/chats'],
    ['GET', '/api/telegram-monitor/messages?chat_id=-100123'],
  ];

  for (const [method, path] of routes) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    assert.equal(response.status, 401, `${method} ${path} must reach auth middleware, not return 404`);
    const payload = await response.json();
    assert.equal(payload.error?.code, 'UNAUTHORIZED');
  }
});

test('manual message ingestion requires authentication while webhook payloads use their own signatures', async () => {
  const response = await fetch(baseUrl + '/api/ingest/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Проверьте поставку' }),
  });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error, 'authentication_required');
});

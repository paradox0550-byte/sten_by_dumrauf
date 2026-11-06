'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEscalationMessage, buildOperationalDigest, processTelegramAutomationJobs } = require('../telegramControl');

test('digest uses persisted finding and action counts without fabricating financial values', () => {
  const text = buildOperationalDigest({
    restaurantName: 'Тверская',
    kind: 'morning',
    dateLabel: '2026-11-06',
    findings: [{ status: 'pending', analysis_json: { severity: 'high', summary: 'Стоп-лист не обновлён' } }],
    actions: [{ status: 'open', title: 'Проверить стоп-лист', assignee_name: 'Иван', due_at: '2026-11-06T12:00:00Z' }],
  });
  assert.match(text, /AI-находки без решения: 1/u);
  assert.match(text, /Активные задачи: 1/u);
  assert.match(text, /Стоп-лист не обновлён/u);
  assert.match(text, /Отсутствующие данные не заменяются нулями/u);
  assert.doesNotMatch(text, /Выручка: 0/u);
});

test('escalation message identifies assignee, deadline and sequence', () => {
  const text = buildEscalationMessage({
    title: 'Проверить холодильник',
    assignee_name: 'Иван',
    due_at: '2026-11-06T10:00:00Z',
    restaurant_name: 'Арбат',
  }, 2);
  assert.match(text, /Проверить холодильник/u);
  assert.match(text, /Иван/u);
  assert.match(text, /Эскалация №2/u);
});

test('automation worker requires adapters', async () => {
  await assert.rejects(() => processTelegramAutomationJobs({}), /requires database and Telegram adapters/u);
});

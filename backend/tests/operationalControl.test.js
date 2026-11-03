'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PEAK_READINESS_TEMPLATE,
  createObservation,
  createAction,
  transitionAction,
  getDeadlineState,
} = require('../operationalControl');

const baseObservation = {
  organizationId: 'org-1',
  restaurantId: 'restaurant-1',
  checkpointKey: 'availability',
  checkpointTitle: 'Раздача и доступность ключевых блюд',
  reporterId: 'manager-1',
  reporterName: 'Менеджер смены',
  status: 'problem',
  note: 'Том Ям временно недоступен',
  occurredAt: '2026-11-03T11:00:00.000Z',
};

test('peak readiness template has four focused control points', () => {
  assert.equal(PEAK_READINESS_TEMPLATE.checkpoints.length, 4);
  assert.ok(PEAK_READINESS_TEMPLATE.checkpoints.some(item => item.key === 'availability'));
});

test('observation requires a description when there is a deviation or help request', () => {
  assert.throws(() => createObservation({ ...baseObservation, note: '' }), /описать ситуацию/);
  assert.equal(createObservation(baseObservation).verificationStatus, 'reported');
});

test('observation preserves that the report is not independently verified', () => {
  const result = createObservation({ ...baseObservation, status: 'ok', note: '' });
  assert.equal(result.status, 'ok');
  assert.equal(result.verificationStatus, 'reported');
  assert.equal(result.verifiedAt, null);
});

test('action cannot be created without an assignee and deadline', () => {
  assert.throws(() => createAction({
    organizationId: 'org-1', restaurantId: 'restaurant-1', observationId: 'obs-1',
    title: 'Вернуть блюдо в продажу', createdBy: 'manager-1',
  }), /исполнитель, срок и автор/);
});

test('task requires a separate verifier; performer cannot verify own completion', () => {
  const action = createAction({
    organizationId: 'org-1',
    restaurantId: 'restaurant-1',
    observationId: 'obs-1',
    title: 'Проверить восстановление блюда',
    assigneeId: 'manager-1',
    assigneeName: 'Менеджер смены',
    dueAt: '2026-11-03T12:00:00.000Z',
    createdBy: 'manager-1',
  });
  const completed = transitionAction(action, { type: 'complete', at: '2026-11-03T11:30:00.000Z' }, { id: 'manager-1' });
  assert.equal(completed.status, 'awaiting_verification');
  assert.throws(() => transitionAction(completed, { type: 'verify' }, { id: 'manager-1' }), /не может самостоятельно/);
  const verified = transitionAction(completed, { type: 'verify', at: '2026-11-03T11:40:00.000Z' }, { id: 'restaurant-manager' });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verifiedBy, 'restaurant-manager');
});

test('verified action can be reopened with reason when the issue persists', () => {
  const action = createAction({
    organizationId: 'org-1', restaurantId: 'restaurant-1', observationId: 'obs-1',
    title: 'Проверить восстановление блюда', assigneeId: 'manager-1', dueAt: '2026-11-03T12:00:00.000Z', createdBy: 'manager-1',
  });
  const completed = transitionAction(action, { type: 'complete' }, { id: 'manager-1' });
  const verified = transitionAction(completed, { type: 'verify' }, { id: 'restaurant-manager' });
  const reopened = transitionAction(verified, { type: 'reopen', reason: 'Блюдо снова отсутствует' }, { id: 'restaurant-manager' });
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.reopenReason, 'Блюдо снова отсутствует');
});

test('deadline state is calculated without overwriting the saved task status', () => {
  const action = { status: 'open', dueAt: '2026-11-03T12:00:00.000Z' };
  assert.equal(getDeadlineState(action, '2026-11-03T12:01:00.000Z'), 'overdue');
  assert.equal(action.status, 'open');
});

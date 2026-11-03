'use strict';

const { randomUUID } = require('node:crypto');

const CHECKPOINT_STATUSES = Object.freeze([
  'pending',
  'reported',
  'action_required',
  'awaiting_recheck',
  'resolved',
  'verified',
  'overdue',
]);

const OBSERVATION_STATUSES = Object.freeze(['ok', 'problem', 'needs_help']);

const PEAK_READINESS_TEMPLATE = Object.freeze({
  key: 'peak_readiness',
  title: 'Подготовка ресторана к пику',
  description: 'Короткий обход перед пиковым периодом. Фиксируйте только то, что действительно проверено.',
  defaultResponseMinutes: 15,
  checkpoints: Object.freeze([
    { key: 'availability', title: 'Раздача и доступность ключевых блюд', evidenceHint: 'Стоп-лист и готовность кухни' },
    { key: 'sanitation', title: 'Санитария и обязательные журналы', evidenceHint: 'Отметьте конкретное нарушение, если оно есть' },
    { key: 'cash_team', title: 'Готовность кассы и команды', evidenceHint: 'Касса, размен, укомплектованность и внешний вид' },
    { key: 'hall', title: 'Чистота зала и санузлов', evidenceHint: 'Входная группа, столы, пол и санузлы' },
  ]),
});

function cleanText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').trim().slice(0, maxLength);
}

function createObservation({ organizationId, restaurantId, checkpointKey, checkpointTitle, reporterId, reporterName, status, note, occurredAt = new Date() }) {
  if (!organizationId || !restaurantId || !checkpointKey || !reporterId) {
    throw new TypeError('Не хватает организации, ресторана, контрольной точки или автора.');
  }
  if (!OBSERVATION_STATUSES.includes(status)) {
    throw new TypeError('Неизвестный результат наблюдения.');
  }
  const normalizedNote = cleanText(note, 1000);
  if (status !== 'ok' && !normalizedNote) {
    throw new TypeError('Для отклонения или запроса помощи нужно описать ситуацию.');
  }
  return Object.freeze({
    id: randomUUID(),
    organizationId: String(organizationId),
    restaurantId: String(restaurantId),
    checkpointKey: String(checkpointKey),
    checkpointTitle: cleanText(checkpointTitle, 160),
    reporterId: String(reporterId),
    reporterName: cleanText(reporterName, 120),
    status,
    note: normalizedNote,
    reportedAt: new Date(occurredAt).toISOString(),
    verificationStatus: 'reported',
    verifiedBy: null,
    verifiedAt: null,
  });
}

function createAction({ organizationId, restaurantId, observationId, title, description, assigneeId, assigneeName, dueAt, createdBy }) {
  const normalizedTitle = cleanText(title, 180);
  if (!organizationId || !restaurantId || !observationId || !normalizedTitle || !assigneeId || !dueAt || !createdBy) {
    throw new TypeError('Для задачи нужны ресторан, наблюдение, название, исполнитель, срок и автор.');
  }
  const deadline = new Date(dueAt);
  if (!Number.isFinite(deadline.getTime())) throw new TypeError('Некорректный срок задачи.');
  return Object.freeze({
    id: randomUUID(),
    organizationId: String(organizationId),
    restaurantId: String(restaurantId),
    observationId: String(observationId),
    title: normalizedTitle,
    description: cleanText(description, 1000),
    assigneeId: String(assigneeId),
    assigneeName: cleanText(assigneeName, 120),
    dueAt: deadline.toISOString(),
    createdBy: String(createdBy),
    status: 'open',
    completedAt: null,
    completedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: new Date().toISOString(),
  });
}

function transitionAction(action, event, actor) {
  if (!action || !event || !actor?.id) throw new TypeError('Не хватает задачи, события или автора действия.');
  const now = event.at ? new Date(event.at) : new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError('Некорректное время события.');
  const next = { ...action };

  switch (event.type) {
    case 'complete':
      if (action.status !== 'open' && action.status !== 'overdue') {
        throw new Error('Задачу можно отметить выполненной только из открытого или просроченного состояния.');
      }
      next.status = 'awaiting_verification';
      next.completedAt = now.toISOString();
      next.completedBy = String(actor.id);
      break;
    case 'verify':
      if (action.status !== 'awaiting_verification') {
        throw new Error('Проверить можно только задачу, ожидающую проверки.');
      }
      if (String(actor.id) === String(action.completedBy)) {
        throw new Error('Исполнитель не может самостоятельно подтвердить результат.');
      }
      next.status = 'verified';
      next.verifiedAt = now.toISOString();
      next.verifiedBy = String(actor.id);
      break;
    case 'reopen':
      if (action.status !== 'awaiting_verification' && action.status !== 'verified') {
        throw new Error('Повторно открыть можно только выполненную задачу.');
      }
      next.status = 'open';
      next.completedAt = null;
      next.completedBy = null;
      next.verifiedAt = null;
      next.verifiedBy = null;
      next.reopenedAt = now.toISOString();
      next.reopenedBy = String(actor.id);
      next.reopenReason = cleanText(event.reason, 500);
      break;
    default:
      throw new Error('Неизвестное действие над задачей.');
  }

  return Object.freeze(next);
}

function getDeadlineState(action, now = new Date()) {
  if (['verified', 'cancelled'].includes(action?.status)) return action.status;
  const due = new Date(action?.dueAt);
  const current = new Date(now);
  if (!Number.isFinite(due.getTime()) || !Number.isFinite(current.getTime())) return 'unknown';
  return due.getTime() < current.getTime() ? 'overdue' : action.status;
}

module.exports = {
  CHECKPOINT_STATUSES,
  OBSERVATION_STATUSES,
  PEAK_READINESS_TEMPLATE,
  createObservation,
  createAction,
  transitionAction,
  getDeadlineState,
};

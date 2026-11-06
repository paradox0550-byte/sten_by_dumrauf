# Telegram operational workflow — backend contract

This document describes the backend additions in `feat/telegram-operational-workflow-backend`. It is a code contract, not evidence of a production deployment.

## AI findings

- `GET /api/telegram-monitor/findings?status=pending&restaurant_id=<uuid>&limit=50` returns organization-scoped findings, parsed analysis, confidence/severity, and the original Telegram message/author/date.
- `POST /api/telegram-monitor/findings/:findingId/approve` requires a privileged role and an active restaurant-accessible `assignee_id` plus future `due_at`. It atomically creates an operational observation and task, marks the finding `action_created`, and appends decision/task events.
- `POST /api/telegram-monitor/findings/:findingId/reject` records the manager decision and optional note.
- `GET /api/telegram-monitor/findings/:findingId/events` returns the immutable decision history.
- Finding states: `pending`, `approved` (reserved for a separate approval-only transition), `rejected`, `action_created`.

An AI finding is not itself a task. The action proposal is only materialized after an authorized manager confirms it.

## Task execution and independent verification

The existing `operational_actions` workflow remains the task source of truth:
- assigned executor: `complete` → `awaiting_verification`;
- a different privileged manager: `verify` → `verified`;
- manager may `reopen` with a reason or cancel an open/overdue task.
- The observation is marked verified only after the independent `verify` transition, never when the executor marks work complete.
- `GET /api/operational-control/actions/:id/events` returns task history.

## Scheduled reports and escalation

- Group settings now include an IANA `timezone` (default `Europe/Moscow`).
- Morning/evening digests use the saved group times and are idempotently queued by chat, kind and local date.
- Digests include real report/P&L values (missing values remain “Нет данных”) and operational findings/tasks.
- A task escalates after `due_at + escalation_minutes`; subsequent escalations repeat at that interval while the task remains open, overdue, or awaiting verification.
- The outbox claims rows with `FOR UPDATE SKIP LOCKED`, retries failed sends up to five attempts, and records delivery results.

**Yandex Timer requirement:** the Timer trigger must invoke this function at least once per minute for schedule windows and deadline escalation to be timely. The current PR changes function behavior only; it does not alter Yandex Timer configuration or deploy the function. The AI batch is separately throttled to one automatic run per UTC day, with failed runs eligible for retry.

## Webhook and group diagnostics

- `GET /api/telegram-monitor/health` returns organization-scoped webhook-ingest processing counts/errors and Telegram `getWebhookInfo` status.
- `POST /api/telegram-monitor/chats/:chatId/diagnose` checks Telegram `getMe`, `getChat`, and `getChatMember`, then persists the result.
- `GET /api/telegram-monitor/chats/:chatId/diagnostics` returns diagnostic history.
- `GET /api/telegram-monitor/deliveries?chat_id=<id>&limit=50` returns scoped Telegram send history.

Telegram API availability, group membership, bot privacy mode, webhook configuration and actual delivery are distinct states. A successful diagnostic does not prove that Telegram is delivering every group message to the webhook.

## Tables added or extended

- `telegram_message_analyses`: stable finding id, decision status, reviewer, note, linked task.
- `telegram_ai_finding_events`: manager decision history.
- `operational_action_events`: task lifecycle history.
- `telegram_outbox`: scheduled summaries and escalation delivery queue.
- `telegram_deliveries`: Telegram send attempts and outcomes.
- `telegram_group_diagnostics`: group connection checks.
- `telegram_worker_runs`: daily AI batch idempotency.
- `telegram_bot_settings.timezone`, `operational_actions.last_escalated_at`, `operational_actions.escalation_count`.

## Deployment boundary

No merge, Yandex configuration change, webhook re-registration, or production deployment is performed by this PR. Apply only after review and green CI; then configure the Timer cadence before enabling scheduled delivery/escalation.

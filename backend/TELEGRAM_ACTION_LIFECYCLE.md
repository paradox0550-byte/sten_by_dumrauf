# Telegram action lifecycle

This backend change adds a durable manager workflow around Telegram AI findings.

## Lifecycle
1. The analysis worker stores source-linked AI analyses and creates a pending action proposal only when the classifier emits `actionProposal`.
2. A privileged manager can list findings and approve or reject a proposal.
3. Approval requires an explicit active restaurant employee and a future due date. The API creates an operational observation and an operational action in one database statement, then marks the proposal approved.
4. Existing operational task transitions remain authoritative: only the assigned employee can mark a task complete; only a privileged manager can verify it; self-verification is rejected. Every transition is recorded in `operational_action_events`.
5. The Timer worker sends due morning/evening summaries and one-time overdue escalations. Delivery attempts are idempotency-keyed and retained in `telegram_delivery_log`.

## New API
- `GET /api/telegram-monitor/findings?status=all|pending|approved|rejected|not_proposed&limit=50&offset=0`
- `POST /api/telegram-monitor/findings/:id/decision` with `{decision:"approve",assignee_id,due_at}` or `{decision:"reject",reason}`
- `GET /api/telegram-monitor/health`
- `GET /api/telegram-monitor/deliveries?chat_id=&limit=50`
- `GET /api/telegram-monitor/chats/:chatId/diagnostics`
- `GET /api/operational-control/actions/:id/events`
- Telegram webhook alias: `POST /api/telegram/webhook` (uses `TELEGRAM_MONITOR_SECRET`, with the existing `TELEGRAM_WEBHOOK_SECRET` accepted as a compatibility fallback). The existing `/api/ingest/message` route remains supported.

## Runtime requirements before activation
- The Yandex Timer trigger must invoke the function at least once per minute for clock-based reports and deadline escalation. The repository cannot change the live Timer trigger.
- Configure the Telegram monitor bot token and webhook secret in Yandex Lockbox/environment. Secrets are never returned by the health endpoint.
- Enable morning/evening schedules per group in the UI and select the restaurant timezone. Existing schedules default to disabled to avoid unsolicited messages after migration.
- This PR does not deploy the function, change API Gateway, alter live secrets, or modify Yandex resources.

## Safety and scope
All findings, proposals, tasks, deliveries and event history are filtered by authenticated organization and restaurant access. AI only proposes; it never creates a task without manager approval. Missing or malformed AI output does not create a proposal.

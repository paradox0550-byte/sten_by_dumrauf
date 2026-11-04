# Backend ↔ Frontend contract alignment (STEN)

This document records the API behavior verified in the repository. It is not a deployment instruction.

## Safety boundary

- This work is code-only. Do not deploy to Yandex Cloud Functions, API Gateway, or any cloud runtime.
- Keep production secrets out of Git and logs.
- A missing source is not a zero. Preserve `null`, explicit empty states, and source/status metadata.
- Every organization/restaurant read or write must remain authenticated and scoped. Do not weaken `assertScopeAccess` or organization filters to make a screen appear populated.
- Financial calculations and the existing P&L persistence model must not be changed without a separate reviewed change.

## Frontend feature groups and existing backend contracts

| Frontend area | Existing backend contract | Alignment notes |
|---|---|---|
| Authentication/session | `POST /auth/login`, `POST /auth/set-password`, `POST /auth/change-password`, `GET /auth/me`; legacy `POST /auth/unlock` returns 410 | Preserve token/session semantics and public user shape. Do not restore PIN auth. |
| Workspace / organization tree | `GET/PUT /api/b2b/context`, `GET/POST /api/b2b/bindings`, `DELETE /api/b2b/bindings/:id`, `GET /api/b2b/org/tree`, `POST /api/b2b/org/units`, `PATCH/DELETE /api/b2b/org/units/:id` | Workspace context, channel bindings and org-unit changes are server-backed; every operation must use the authenticated organization and access checks. |
| Administration | `GET/POST /api/admin/organizations`, `PATCH /api/admin/organizations/:id`, `GET /api/admin/organizations/:id/users` | Admin-only operations; do not expose to ordinary restaurant roles. |
| User profile | `GET /api/profile`, `PUT /api/profile` | Profile update is supported. Telegram IDs must be numeric; negative IDs are valid for groups. |
| STEN AI | `POST /ask`, `GET /api/ai/skills`, `PUT /api/ai/skills` | AI response modes, voice playback and mute are frontend presentation/preferences unless a future explicit API contract says otherwise. |
| AI memory | `GET/POST /api/ai/memory`, `PATCH/DELETE /api/ai/memory/:id` | Organization and workspace scope must be enforced; confirmed and unconfirmed memory remain distinct. |
| Documents | `GET /ai/documents`, `POST /ai/documents/upload`, `GET /ai/documents/:id/preview`, `DELETE /ai/documents/:id` plus AI document tools | Never return documents across organizations; extracted file content is untrusted input. |
| P&L / Finance | `GET/POST /api/pnl`, `POST /api/pnl/calculate`, `POST /api/pnl/import`, `GET /api/pnl/transactions`, `POST /api/pnl/transactions`, approval routes | Keep formula/source/period/scope semantics. Do not duplicate totals or convert missing plan/fact to zero. |
| Shift/report intake | `GET/POST /reports`, `GET/POST /api/ingest/message`, `POST /api/ingest/message/confirm` | Parsing is not confirmation. Intake must not write revenue to P&L until the authenticated confirmation path succeeds. |
| Operational control | `GET /api/operational-control`, `POST /api/operational-control/observations`, `POST /api/operational-control/actions`, `PATCH /api/operational-control/actions/:id` | Observations and actions persist in organization/restaurant-scoped tables. State transitions must preserve the two-person verification rule and audit trail. |
| Secretary | `GET/POST /api/secretary/notes`, `GET/POST /api/secretary/events`, `PATCH/DELETE` by ID | Preserve readback confirmation, idempotency and organization scope. A failed write must not be shown as saved. |
| Telegram Monitor / bot | `GET /api/telegram-monitor/chats`, `GET /api/telegram-monitor/messages`, `POST /api/telegram-monitor/analyze`, `POST /api/telegram-monitor/chats/:chatId/bind`, `GET/PUT /api/telegram-bot/settings` | Telegram chat bindings are scoped to organization/restaurant. Webhook authentication and callback-query handling are separate from user JWT routes. |
| Analytics settings | `GET/PUT /api/analytics/settings` | Missing configuration should remain missing, not silently become a business fact. |
| Messenger/report delivery | `GET/POST /api/messenger/settings`, `POST /api/reports/send` | Require authorization and configured recipient/provider; never expose tokens/secrets. |
| iiko integration | `GET /api/integrations/iiko`, `POST /api/integrations/iiko/connect`, `PUT /api/integrations/iiko/:connectionId/mapping`, `DELETE /api/integrations/iiko/:connectionId` | Connection credentials are encrypted server-side; never return credentials to the browser. |
| Google Workspace | `GET/PUT/DELETE /api/integrations/google/:provider`, `PATCH /api/integrations/google/:provider/sync-status`, explicit Sheets PUT | Google Calendar/Sheets provider settings are backend-routed. Browser-side Google API calls for user-authorized data access are external Google requests, not missing STEN backend routes. |
| Payroll analytics | `GET /fot-analytics`, `GET /my-earnings`, `POST /calculate-salary` | `/fot-analytics` applies organization, project, branch, restaurant, department and period filters in SQL after `assertScopeAccess`; validate real cross-restaurant isolation with production readback before release. |

## Known integration limits to keep visible

- `GET /fot-analytics` currently applies organization isolation plus project/branch/restaurant/department filters to `payroll_records`, after `assertScopeAccess`. The route is implemented in source; live correctness still requires a production readback with real payroll rows for at least two distinct restaurants.
- The staff planning/custom-position workflow on the frontend currently stores its plan locally. It is not a persisted payroll source and must not be described as saved to the backend. This is a product capability gap, not a missing API route.
- Voice playback and the global mute preference are browser-side behavior. They do not justify adding an undocumented backend endpoint.
- `POST /calculate-salary` is a calculation-only endpoint; it does not persist payroll records. `GET /my-earnings` reads only the authenticated user's payroll rows.
- `POST /api/ingest/message` returns a parsed draft with `writeToPnl:false`; the confirmation route is the explicit write boundary.

## Client-local persistence — active behavior, not backend storage

These are working browser-side features, but their state is not shared through the backend:

- `FotScheduleImport` stores imported schedule history/calculations in browser `localStorage`. The UI correctly labels the history as local to this browser. It is not the canonical payroll source and is not synchronized across devices.
- `Team` stores staffing/position plans and custom positions in browser `localStorage`. They are local planning drafts, not persisted organization payroll data.
- P&L expense-classification overrides and user article templates are stored locally. They are per-browser preferences, not shared organization settings.
- Theme, font size, reduced motion and voice mute are intentionally client preferences and should remain local unless a separate product requirement says otherwise.

If schedule history or staffing plans must be shared across devices/users, add a separate organization-scoped persistence design and reviewed database migration with RBAC, audit, retention and readback. Do not repurpose `payroll_records` as a schedule-history table or claim these drafts are saved to the backend.

## Static route parity audit (2026-11-04)

- Express backend registers 82 method/path pairs.
- `api-spec.yaml` declares 82 method/path pairs.
- Static comparison after normalizing Express `:param` and OpenAPI `{param}` syntax: **82/82 exact matches**, with no backend route missing from the OpenAPI contract and no OpenAPI operation without a backend handler.
- The Gateway layer explicitly routes `/healthz` and Google Sheets, forwards `/{proxy+}` to the Node API function, and routes `/markitdown/{proxy+}` to the separate Python converter.
- Frontend paths were checked in the principal flows: authentication, Dashboard, P&L, Finances, Budget, Analytics, Team, Settings, Secretary, Operational Checks, Telegram Monitor, Documents, Flash/Quick Entry, Workspace Selector, iiko and Google Sheets. The corresponding handlers exist in the backend route table.
- This is a source-level contract check, **not** live proof of Cloud Function version/tag, Gateway deployment, IAM invocation permissions, CORS, PostgreSQL connectivity, or restaurant-level data isolation. Those remain release smoke checks.

## Validation

Run from `backend/`:

```sh
npm test
```

Backend tests run as part of pull-request CI. This task does not trigger a cloud deployment.

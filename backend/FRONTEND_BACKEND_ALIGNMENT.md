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
| Authentication/session | `GET /auth/me` and existing auth routes | Preserve token/session semantics and public user shape. |
| User profile | `GET /api/profile`, `PUT /api/profile` | Profile update is supported. Telegram IDs must be numeric; negative IDs are valid for groups. |
| STEN AI | `POST /ask`, `GET /api/ai/skills`, `PUT /api/ai/skills` | AI personal response modes, voice playback, and mute are frontend presentation/preferences unless a future explicit API contract says otherwise. Do not invent server persistence for them. |
| AI memory | `GET/POST /api/ai/memory`, `PATCH/DELETE /api/ai/memory/:id` | Organization and workspace scope must be enforced; confirmed and unconfirmed memory remain distinct. |
| Documents | `GET /ai/documents`, `POST /ai/documents/upload`, `GET /ai/documents/:id/preview`, `DELETE /ai/documents/:id` plus AI document tools | Never return documents across organizations; extracted file content is untrusted input. |
| P&L | `GET/POST /api/pnl`, `POST /api/pnl/calculate`, `POST /api/pnl/import`, approval and transaction routes | Keep formula/source/period/scope semantics. Do not duplicate totals or convert missing plan/fact to zero. |
| Shift/report intake | `POST /api/ingest/message`, `POST /api/ingest/message/confirm`, `GET/POST /reports` | Parsing is not confirmation. Intake must not write revenue to P&L until the authenticated confirmation path succeeds. |
| Operational control / Secretary | `/api/secretary/notes`, `/api/secretary/events` CRUD | Preserve readback confirmation and organization scope. A failed write must not be shown as saved. |
| Analytics settings | `GET/PUT /api/analytics/settings` | Missing configuration should remain missing, not silently become a business fact. |
| Messenger/report delivery | `GET/POST /api/messenger/settings`, `POST /api/reports/send` | Require authorization and configured recipient/provider; never expose tokens/secrets. |
| Payroll analytics | `GET /fot-analytics`, `GET /my-earnings`, `POST /calculate-salary` | The `/fot-analytics` handler now applies organization, project, branch, restaurant, department and period filters in SQL after `assertScopeAccess`; validate real cross-restaurant isolation with production readback before release. |

## Known integration limits to keep visible

- `GET /fot-analytics` currently applies organization isolation plus project/branch/restaurant/department filters to `payroll_records`, after `assertScopeAccess`. The route is implemented in source; live correctness still requires a production readback with real payroll rows for at least two distinct restaurants.
- The staff planning/custom-position workflow on the frontend currently stores its plan locally. It is not a persisted payroll source and must not be described as saved to the backend. This is a product capability gap, not a missing API route.
- Voice playback and the global mute preference are browser-side behavior. They do not justify adding an undocumented backend endpoint.\n- `POST /calculate-salary` is a calculation-only endpoint; it does not persist payroll records. `GET /my-earnings` reads only the authenticated user's payroll rows.
- `POST /api/ingest/message` returns a parsed draft with `writeToPnl:false`; the confirmation route is the explicit write boundary.

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

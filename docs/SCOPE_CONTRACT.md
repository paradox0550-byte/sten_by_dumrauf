# Canonical scope contract

This document records the frontend/backend contract required for production scope handling.

## Scope
Every financial/report request is scoped by:
- period: YYYY-MM
- project_id
- branch_id
- restaurant_id
- department_id

Only one selected leaf/parent scope is authoritative. "All" means all children inside the selected parent, never the whole account.

## Aggregation
Backend aggregates raw RUB amounts first and calculates percentages from the aggregate. Child percentages must never be averaged. Missing values remain missing.

## Existing endpoints that must become scope-aware
- GET /api/b2b/org/tree
- GET /reports
- GET /api/pnl
- POST /api/pnl/calculate
- POST /api/pnl/import

The frontend must send the same scope to each request. The backend must reject unsupported/ambiguous scope rather than silently falling back to a previous/default project.

## P&L persistence
The production P&L API must support:
- article dictionary (canonical group + custom name)
- plan and fact in base RUB
- source_type and provenance
- author/timestamp for manual changes
- audit history
- derived metrics with formula/version

The current repository does not expose a verified backend implementation for all of these capabilities. Therefore the UI must not simulate persistence with local state.

## Input scale
UI may display RUB, thousand RUB or million RUB. API stores base RUB.
For thousand RUB, 10.0 means 10000 RUB.
Empty input remains undefined; it is never converted to zero.

## Acceptance
A P&L screen is production-ready only when a manual edit can travel:
UI -> authenticated API -> DB -> readback -> UI,
with the same scope and provenance, and no fake/local persistence.


## 2026-10-01 — authoritative restaurant context

STEN остаётся персональным внутренним кабинетом, но финансовый и операционный контур теперь допускает несколько ресторанов внутри одной организации без смешивания данных.

### Server-authoritative context

- Web/PWA context is persisted in workspace_contexts by organization_id + user_id.
- GET /api/b2b/context returns the current context and restaurants available to the authenticated profile.
- PUT /api/b2b/context changes the active restaurant/project/branch/department context.
- Browser localStorage remains a convenience cache; the server is the authority for the active restaurant.

### Channel / room bindings

- workspace_bindings maps channel + subject_id to a restaurant.
- Telegram group chat_id, WhatsApp sender/number, or a web subject can be bound to one restaurant.
- GET/POST /api/b2b/bindings and DELETE /api/b2b/bindings/:id manage those bindings.
- Inbound Telegram/WhatsApp parsing resolves the binding before the message can become financial context.
- A message without a binding may be parsed for preview, but it cannot be written into a restaurant P&L until an authenticated user explicitly confirms a restaurant scope.

### Isolation rule

For scoped financial/report operations, backend checks the selected restaurant and all descendant restaurants of a branch/project against org_unit_access (with super_admin/owner retaining organization-wide access). Organization ID remains mandatory on every server query. Missing scope is not silently converted into a specific restaurant.

### Financial analysis rule

Plan/fact deltas are calculated by backend before AI interpretation. Expense rows are evaluated with the opposite sign semantics from revenue rows: lower fact than plan is favorable for expenses; higher fact than plan is unfavorable. Missing plan/fact remains null.


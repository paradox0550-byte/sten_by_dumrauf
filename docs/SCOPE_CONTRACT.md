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

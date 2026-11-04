# P&L sign and variance contract

**Status:** derived from the current `main` implementation; no backend or database behavior is changed by this document.

## What the API currently guarantees

- `POST /api/pnl` validates that `plan` and `fact` are finite numbers or null, then persists the supplied values without sign normalization.
- `GET /api/pnl` aggregates stored row values as supplied. It does not convert every expense row to positive or signed-negative values.
- Transaction expenses are converted to negative amounts when rolled into P&L rows.
- Derived financial rollups use the absolute value of expense categories, while row-level values retain their stored sign.

Therefore, the current row-level API is **not a single canonical positive-only or signed-only contract**. Callers must not infer the sign convention solely from the article name.

## Dashboard variance rules

For a row with valid plan and fact:

- Revenue is expected to be non-negative. A decrease from plan is unfavorable; an increase is favorable.
- Positive expense rows: an increase is unfavorable; a decrease is favorable.
- Signed-negative expense rows: a more-negative fact is unfavorable; a less-negative fact is favorable.
- If an expense row changes sign between plan and fact, or its article type is unknown, the Dashboard must not guess. It surfaces the row as requiring review.
- Missing plan/fact values remain missing and are never coerced to zero.
- Equal plan and fact is neutral and is not shown as a deviation.

The shared helper `calculatePnlVarianceSignal` implements these rules and is covered by unit tests. The older `calculateVarianceSignal` remains signed-only for backward compatibility.

## API signal endpoint

There is currently no `POST /api/pnl/signals` route in `backend/index.js` or `api-spec.yaml`. The Dashboard must not call that undocumented route or turn a 404 into a misleading empty state. If a server-side signal endpoint is introduced later, it must be added to the backend, OpenAPI contract, and backend tests together.

## Required follow-up for a canonical contract

A future backend/API change should choose one persisted sign convention, normalize at the write/import boundary, and provide migration rules for existing rows. That is a separate backend/API/DB change and is intentionally not part of this frontend audit patch.

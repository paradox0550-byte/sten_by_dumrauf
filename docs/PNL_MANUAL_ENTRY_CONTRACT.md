# P&L manual entry contract

The P&L workspace is a financial table, not a presentation-only dashboard.

## Row model
Each editable row contains article, plan, fact, source/status, period and organizational scope. Audit metadata is server-owned.

## Input
The UI may display RUB, thousand RUB, or million RUB. Values are converted to base RUB before an API request:
- `10 000` in RUB -> 10 000 RUB
- `10,0` in thousand RUB -> 10 000 RUB
- empty input -> undefined, never zero

## Calculations
- variance = fact - plan
- plan share = plan / revenue * 100
- fact share = fact / revenue * 100
- variance p.p. = fact share - plan share
- aggregate raw RUB first; calculate ratios second
- missing operands remain undefined

## Persistence gate
The frontend must not claim that a row is saved until the authenticated backend accepts it and a subsequent GET returns it in the same period/scope.

Required server fields:
- period and scope IDs
- article_id or canonical article code
- plan_rub / fact_rub
- source and optional source_document_id
- status
- created_at / updated_at
- created_by / updated_by
- formula_version for derived rows
- audit event

No fake defaults, no localStorage as a financial database, no missing-to-zero coercion.

## Transaction entry

P&L also has a separate confirmed operation flow for daily income/expenses. The operation form is opened from the main P&L, and the article is selected only from articles already present in the current P&L scope.

Required fields: transaction date, type (expense/income), P&L article, amount in RUB, optional comment. The UI shows a review step before the final save.

Transactions are stored separately in `pnl_transactions`, have server-owned timestamps/user/audit metadata, and are read back after insert. Their amounts are rolled into the selected article's actual for the same period and scope. The P&L row exposes the number of contributing operations so the source of the actual is visible.

The transaction amount is added to the current article fact; therefore users should not also enter the same transaction into the manual fact/import for the same scope and period.

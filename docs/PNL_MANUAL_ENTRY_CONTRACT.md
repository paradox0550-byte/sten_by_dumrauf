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

# STEN Labor Intelligence: data contracts and calculation rules

## Architecture

STEN accepts operational exports through source adapters. iiko is the first sales adapter; XLSX and CSV are transport formats, not business models. Each adapter produces the vendor-neutral contracts in src/domain/labor/imports/schema.ts.

Pipeline:
1. Source adapter reads XLSX/CSV and maps source columns.
2. Validation normalizes dates, hours, quantities and money. Invalid rows remain visible.
3. Canonical records retain source-row references and import-batch provenance.
4. Role passports and configured productivity norms supply labor meaning.
5. laborCalc computes only where sales, shifts and required norms exist.
6. Forecasting uses historical weekday/hour/zone demand and returns insufficient-data status when history is short.
7. STEN AI explains engine outputs; it must not manufacture missing coefficients or recalculate hidden values.

## Canonical data

- SalesLine: business date, hour, item, category, zone, quantity, revenue and optional effort units.
- ShiftLine: business date, employee, position, optional zone, actual hours and optional pay rate.
- ImportBatch: source, file name, import timestamp, period, row counts and caller-supplied content digest.

The digest must be calculated from original file bytes by the ingestion boundary. File name, date range or row count is not a safe content identity. Persistent deduplication requires storing and checking that digest in the same organizational scope; this frontend/domain-only work does not claim to prevent duplicate imports across sessions.

## Labor calculation

Dish quantity is not automatically labor effort. A dish or category must have a configured effort coefficient before it can produce effort units. A zone must also have a configured productivity norm (effort units per labor hour). If either is missing, required hours and excess hours remain null.

Actual payroll cost is calculated only when every included shift has a known hourly rate, either on the imported shift or in its role passport. Missing rates keep cost null; they are not treated as zero.

The engine reports excess hours only against calculated production demand. Coverage minima are separate constraints and must be checked before turning a demand estimate into a published roster.

## Forecast and schedule draft

The initial forecast groups history by weekday, hour and zone and requires at least four distinct weeks by default. It uses mean workload per observed date in each bucket; the result is an estimate, not a guarantee.

The schedule recommendation layer returns required labor hours and an indicative minimum headcount for each forecast slot only when a productivity norm exists. It does not assign named employees, infer availability, or waive minimum coverage. A final roster must additionally satisfy role passports, fixed hours, employee availability, labor law and manager approval.

## Known validation boundary

The iiko parser currently supports common OLAP header aliases and expects a single tabular header row. A real anonymized restaurant export is still required to validate the exact iiko template, especially modifier representation, grouped headers, and whether hour/category dimensions are present. When mandatory hourly or category detail is absent, parsing stops with a clear error rather than inventing it.

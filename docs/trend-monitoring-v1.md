# STEN Trend Monitoring v1 — implementation boundary

## What this branch implements

- Adds a protected `/trends` page and navigation entry.
- Provides a Russian-language research workspace for six categories: guest behavior, menu and beverages, value/economics, experience/service, technology/productivity, and workforce.
- Provides Russian and English search query suggestions and opens a selected query in Google by default, with Yandex as an optional alternative.
- Shows the evidence checklist: source independence, dynamics, persistence, market confirmation, geography, and applicability.
- Explicitly tells the user that scheduled collection is not connected; it does not fabricate trend cards, scores, results, or background refreshes.

## Important limitation

This is the first frontend-only increment, not a completed automated monitoring service. Current repository contracts inspected for this change do not establish an existing supported web-search provider, a source-ingestion API, or a scheduled collection worker. The page therefore opens external search results rather than claiming to retrieve or verify them inside STEN.

## Next implementation phase required for both modes

1. Approve and select a real search/data provider and its access method.
2. Add a backend integration that stores provider, query, timestamp, source URL, publication date, excerpt, geography, and collection status; do not store credentials in frontend code.
3. Add scheduled ingestion and duplicate detection with transparent failure reporting.
4. Add a persistent signal registry and evidence provenance, including conflicting evidence and stale-source handling.
5. Implement calibrated confidence separately from restaurant-specific applicability and commercial impact.
6. Add an on-demand research API that returns citations and explicit limitations.
7. Connect the trend card to real STEN workspace metrics only where data is present; missing data remains missing, never zero.
8. Add tests for source deduplication, dates, evidence independence, score boundaries, provider failures, scope isolation, and unavailable data.

## Acceptance criteria

- No demo/fake trend observations.
- Search mode never claims that an external result was read or verified by STEN.
- Automatic mode is not described as active until scheduled ingestion is implemented and monitored.
- Russia and global market evidence remain separately labeled.
- A trend score is not represented as a probability of commercial success.
- No deployment or automatic merge is performed as part of this branch.

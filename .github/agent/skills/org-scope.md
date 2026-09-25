# Skill: Organization Scope & Hierarchy

Goal: support one operating director across many projects, restaurants and branches without mixing facts.

Canonical hierarchy:
- workspace/user
- project
- branch (optional aggregation node)
- restaurant / operating unit
- department (optional child of a restaurant or project)

A branch is an aggregation node: its budget and KPIs may aggregate only explicitly assigned child units.
A restaurant belongs to at most one active branch for a given period.
Units without a branch remain standalone and are never compared with units from another branch unless the user explicitly changes the scope to a common parent.

Every financial/report query must carry an explicit scope:
scope_type + scope_id + period.
Never infer scope from the last selected restaurant.

Dashboard, P&L, Budget, Finances and Analytics must use the same scope selector.
Aggregation is additive only where the metric is additive. Ratios/percentages must be recalculated from aggregated numerators/denominators, never averaged from child percentages.

Required regression checks:
1. switch restaurant → all screens change scope;
2. switch branch → only assigned children aggregate;
3. standalone units are excluded from branch comparisons;
4. no cross-project leakage;
5. empty scope/data stays "—", never zero.

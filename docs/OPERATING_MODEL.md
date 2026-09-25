# Operating model: projects, branches, restaurants

The cabinet is designed for an operating director who can manage multiple projects and operating units.

## Scope hierarchy

A user can have:
- multiple projects;
- standalone restaurants;
- branches;
- restaurants assigned to a branch;
- departments inside a restaurant/project where required.

A branch is an aggregation container, not a restaurant. Its budget is the consolidated budget of its assigned child units plus any explicitly owned branch-level budget lines.

### Comparison rule

Standalone units that do not belong to the same branch are not compared with one another. They remain independently visible and manageable. Cross-unit comparison is enabled only when the selected scope has a common parent (for example, restaurants inside one branch).

## Universal filter

The same scope selector must control:
- Dashboard
- P&L
- Finances
- Budget
- Analytics
- STEN context

Selector dimensions:
1. Project
2. Branch
3. Restaurant
4. Department (when applicable)
5. Period

"All" must mean all units within the selected parent scope, never all data in the account.

## Financial aggregation

For a branch:
- sum raw monetary amounts from child units;
- include branch-owned lines explicitly;
- calculate percentages from aggregated amounts;
- never average child percentages;
- preserve source and provenance.

For a standalone restaurant:
- show only that restaurant's scope.

No screen may silently fall back to a previously selected scope.

## Required backend contract

The backend must expose a canonical organization tree and accept a scope on financial/report requests. Existing endpoints that are not yet scope-aware must be upgraded before the corresponding UI is considered production-complete.

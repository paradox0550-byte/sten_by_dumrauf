# STEN CSS Audit — Initial Pass

Date: 2026-10-20  
Branch: `design/sten-design-code-1.0`  
Scope: source-level inventory; no browser-rendered visual QA has been claimed.

## Import order

`src/main.tsx` loads these global styles in order:

1. `src/styles/tokens.css`
2. `src/app.css`
3. `src/executive.css`
4. `src/obsidian-precision.css`
5. `src/open-workspace.css`
6. `src/obsidian-precision-responsive-v2.css`
7. `src/obsidian-precision-completion.css`

This means the final computed appearance can depend on later selectors, specificity, cascade layers, media-query order, and `!important`. A stylesheet should not be removed or reordered based only on its name.

## Inventory

| File | Lines | `!important` occurrences | Media queries | Notes |
|---|---:|---:|---:|---|
| `src/app.css` | 4,544 | 68 | 39 | Foundational layout and legacy component styles; also many later refinements |
| `src/executive.css` | 3,437 | 28 | 48 | Executive shell, page-level layout, responsive behavior |
| `src/obsidian-precision.css` | 693 | 8 | 11 | Shared visual overrides and theme adjustments |
| `src/open-workspace.css` | 18 | 0 | 0 | Small loading-state stylesheet |
| `src/obsidian-precision-responsive-v2.css` | 161 | 2 | 6 | Responsive shell refinements |
| `src/obsidian-precision-completion.css` | 304 | 0 | 5 | Final visual overrides for shared components and pages |
| `src/styles/tokens.css` | 184 | 0 | 0 | Theme tokens and compatibility aliases |

Across the six global stylesheets above, the source inventory finds **106 occurrences of `!important`**. This is a count of occurrences, not a recommendation to delete them in bulk.

A simple selector inventory also finds substantial cross-file overlap. For example, `obsidian-precision.css` and `obsidian-precision-completion.css` share 82 normalized selector strings; `app.css` and `executive.css` share 73. This is a useful signal for targeted review, not proof that every repeated selector is redundant: some rules intentionally change values at later stages or within media queries.

## Risks to address

1. **Cascade opacity.** Seven imported stylesheets have overlapping responsibilities; the actual winning rule is not obvious from a file name.
2. **High override load.** 106 `!important` occurrences make routine changes harder to reason about and increase regression risk.
3. **Token compatibility.** Semantic variables and legacy aliases coexist. Removing aliases before usage migration can silently break modules.
4. **Responsive duplication.** Several stylesheets define layout and shell behavior across breakpoints. Consolidation needs screenshot or browser verification.
5. **Typography contract.** Inter Variable is imported in the app entry point. The token `--font-mono` names JetBrains Mono, but `package.json` does not list a JetBrains Mono font package; verify the actual rendering/fallback before deciding whether to bundle a font.
6. **Theme correctness.** Dark/light values are defined in the token file, but every global override must be checked for hard-coded colors that bypass semantic tokens.

## Safe next actions

- Do not change the stylesheet import order yet.
- Do not bulk-delete `!important` or duplicate selectors.
- Inventory hard-coded color literals and token references by stylesheet.
- Select one component family at a time, starting with shell/navigation and shared controls, and move declarations only after comparing computed behavior.
- Use Dashboard, P&L, and STEN AI as reference pages for both themes and desktop/mobile layouts.
- Run typecheck, lint, tests, and production build after each implementation slice.

## What this audit does not claim

This is a source-level pass based on the current `main` files and does not substitute for browser screenshots, computed-style inspection, accessibility testing, or CI results. No UI code, business calculations, API behavior, or deployment configuration was changed in this initial audit milestone.


## First implementation slice — 2026-10-20

A narrow, theme-safe P&L tree styling change was committed after the inventory:

- Replaced fixed light-gray subtotal borders/backgrounds with semantic border and brand tokens.
- Replaced fixed light-theme text colors in computed-row annotations, P&L codes, and split details with `--text-muted`.
- Kept the existing component structure, formulas, data flow, selector scope, stylesheet order, API, and backend unchanged.

This reduces obvious hard-coded light-palette leakage in dark mode without a broad CSS rewrite. It still needs visual verification in both themes and is not represented as browser-tested.

## CI finding — existing backend validation failures

The workflow for the audit PR completed with frontend typecheck, lint, frontend tests, and frontend production build passing. The job then failed at the separate backend-validation step; 6 of 54 backend tests failed:

- restaurant opening requests include launch gates, opening checklists and stabilization
- holding governance requests include document hierarchy and rollout
- restaurant staff management requests receive practical people-development guidance
- iiko inventory questions include reconciliation and report provenance
- brand strength skill links positioning to measurable guest behavior
- restaurant occupational safety requests route to risk assessment guidance

These failures are outside the frontend-only design scope. Do not bypass or weaken backend validation to make the design PR green; handle them in a separately authorized backend task.


## Second implementation slice — responsive global header — 2026-10-20

Added a token-driven style pass scoped to `.topbar.executive-topbar` in `src/obsidian-precision-completion.css` and documented the header contract in `STEN-DESIGN-CODE-1.0.md`.

- Clarifies hierarchy between current page and period metadata.
- Aligns workspace scope, financial scale, theme control, and account identity with consistent control sizes and semantic borders.
- Adds tablet/mobile density rules without changing the underlying `Layout.tsx` state or selector behavior.
- Keeps theme styling token-driven and avoids adding fake notification/status controls.
- Does not touch backend/API, financial formulas, tenant scope, or deployment workflows.

The latest commit has no PR-triggered workflow runs or combined status entries reported yet, so CI for this header slice is **not verified**. This is source-level implementation only; visual browser checks at 375/393px, tablet widths, and 1440px+ in dark/light themes remain outstanding.


## Third implementation slice — route-aware navigation — 2026-10-20

Updated `src/components/Layout.tsx` within the existing shell:

- Nested routes now resolve to their parent section for the global header title and active navigation group.
- Financial scale controls remain available on supported nested finance routes, including P&L import.
- Collapsed sidebar group controls expose accessible labels and hover titles.
- Header labels now resolve for Memory, Settings, Legal, and organization administration routes instead of falling back to a generic workspace label.
- No navigation destinations, permissions, tenant scope, business calculations, API behavior, or deployment configuration were changed.

This is a source-level change. Browser/accessibility verification and CI for the latest commit are not yet confirmed. The known six backend validation failures remain out of scope and must not be bypassed.


## Fourth implementation slice — navigation hierarchy and keyboard focus — 2026-10-20

Updated `src/obsidian-precision-completion.css`:

- Normalized primary navigation and group-toggle target heights to 40 px on desktop and 42 px on phones.
- Applied the same semantic surface, border and brand tokens to group hover/current states and child links.
- Added visible `:focus-visible` outlines for navigation links and expandable group controls.
- Reduced visual weight of nested links while preserving a clear active marker and indentation.
- Kept collapsed navigation geometry aligned with the existing 68 px sidebar behavior.

No route destinations, access rules, API calls, tenant scope, business formulas, or deployment workflows were changed. This slice has not yet had browser visual QA or a confirmed CI run; it should not be treated as release-ready until both are checked.

## Navigation follow-up — desktop sidebar toggle

- Fixed the executive header's desktop sidebar control: it now toggles `sidebarCollapsed` instead of toggling the mobile drawer state.
- `aria-expanded` now reflects the actual desktop sidebar state; the separate mobile menu button continues to control the mobile drawer.
- Scope is limited to `src/components/Layout.tsx`. Routes, navigation destinations, permissions, tenant scope, business calculations, API contracts and deployment workflows are unchanged.
- Validation: source-level contract checked. Browser verification at desktop/tablet/mobile and automated checks must still be confirmed by CI; this change is not described as visually verified.

# STEN Design Code 1.0

Status: foundation and implementation contract  
Scope: frontend visual system only  
Branch: `design/sten-design-code-1.0`

## 1. Product identity

STEN is an executive workspace for restaurant economics and operations. The interface should feel precise, calm, trustworthy, and fast to scan. Visual decisions must help a manager answer: **what happened, why it matters, and what should happen next?**

The product must have its own identity. Use the clarity and discipline associated with excellent professional software as inspiration, not as a template to copy.

### Principles

1. **Data over decoration.** No decorative gradients, neon effects, glassmorphism, or ornamental chart elements.
2. **Decision hierarchy.** Show the most consequential metric or exception first; supporting detail follows.
3. **Missing is not zero.** Unknown values render as an em dash or an explicit “Нет данных” state. Never invent placeholder metrics.
4. **Explain the number.** Financial values should retain period, unit, comparison basis, and provenance where available.
5. **Quiet consistency.** The same component has the same geometry and behavior throughout the product.
6. **Accessible by default.** Visible focus, readable contrast, reduced-motion support, and controls usable by keyboard, touch, and screen reader.
7. **Responsive by intent.** Desktop is a dense management workspace; tablet and mobile reorganize content rather than merely shrinking it.
8. **Protect business behavior.** Design work must not alter financial formulas, data scope, authentication, API contracts, or backend deployment.

## 2. Visual direction

### Dark theme

The primary working theme is dark. Use a deep neutral application canvas, clearly differentiated surfaces, restrained borders, and one purposeful brand accent. Avoid making every panel a separate elevated card.

### Light theme

Light mode is a first-class theme, not an inversion. Use a soft neutral canvas, white working surfaces, dark primary text, and subtle cool-grey separators. Avoid large tinted or glass-like surfaces.

### Semantic color roles

Color is semantic and must not be used as the only status signal.

- **Brand:** navigation focus, selected controls, primary action, and links.
- **Success:** favorable state or verified completion.
- **Warning:** attention required, but not yet critical.
- **Danger:** adverse deviation, destructive action, or failure.
- **Neutral:** supporting metadata, inactive states, and ordinary information.

For restaurant economics, retain the existing business rule that favorable expense variance is green and unfavorable variance is red. Do not change P&L calculations or status thresholds as part of visual refactoring.

## 3. Typography

- UI typeface: Inter, using the already-installed Inter variable font.
- Financial and tabular numerals: the existing `--font-mono` token with tabular numerals enabled.
- Use compact, consistent type scales; avoid oversized dashboard headings.
- Labels should remain legible and descriptive. Do not use tiny uppercase text for important information.
- Do not load an additional font family until its package and actual use are verified.

## 4. Layout and geometry

Use a consistent spacing scale and align page content, toolbars, tables, and panels to a common grid.

- Use the smallest surface count that still clarifies grouping.
- Prefer separators and whitespace over nested cards.
- Keep page titles and primary actions aligned consistently.
- Use consistent control heights and focus states.
- Keep monetary values right-aligned in tables; align units and decimal precision within a column.
- Tables may scroll horizontally on narrow screens, but key labels and actions must remain reachable.
- Respect safe areas and the on-screen keyboard on mobile.

## 5. Component contracts

Shared components should eventually cover:

- Buttons: primary, secondary, quiet, destructive, loading, disabled.
- Fields: text, numeric, date, select, textarea, validation, helper text.
- Workspace/restaurant selector and date-range controls.
- KPI/metric display with explicit empty and loading states.
- Financial tables, totals, variance and status indicators.
- Panels, inline notices, empty states, skeletons, dialogs, toasts.
- Navigation and active/hover/focus states.

A component's visual state must be derived from real application state. Never fabricate data to make a screen appear populated.

## 6. Design tokens and CSS architecture

`src/styles/tokens.css` is the current canonical token file. Do not create a second token file or replace the current palette blindly.

The entry point currently imports multiple global stylesheets in sequence. Before consolidating them, map their actual responsibilities and cascade dependencies. The legacy aliases (`--bg`, `--surface`, `--text`, `--accent`, etc.) may be used by existing components; migrate them deliberately rather than removing them in bulk.

Rules for the refactor:

1. Keep semantic tokens as the source of truth.
2. Preserve compatibility aliases until usage is audited.
3. Avoid adding new `!important` declarations.
4. Do not reorder cascade layers or stylesheet imports without checking the resulting computed styles.
5. Prefer scoped component styles for component-specific behavior and tokens for shared visual decisions.
6. Remove duplicate declarations only after verifying which rule currently wins and whether any page relies on it.
7. Keep theme-specific values together and test both `data-theme="dark"` and `data-theme="light"`.
8. Preserve the system theme option and reduced-motion behavior.

## 7. Audit findings confirmed from the repository

- `src/styles/tokens.css` exists and defines dark/light semantic tokens plus compatibility aliases.
- `src/main.tsx` imports the token file followed by several global stylesheets: `src/app.css`, `src/executive.css`, `src/obsidian-precision.css`, `src/open-workspace.css`, `src/obsidian-precision-responsive-v2.css`, and `src/obsidian-precision-completion.css`.
- `src/app.css` contains foundational layout and component styles, while later global stylesheets layer additional executive/workspace/responsive rules on top.
- The codebase already has a substantial visual system. The immediate issue is governance and cascade clarity, not a lack of CSS files or a need to start over.
- The token file intentionally leaves its token declarations outside cascade layers while placing base rules in a `legacy` layer. This is deliberate behavior and must not be changed casually.
- The font import in `src/main.tsx` is Inter Variable. The `--font-mono` token names JetBrains Mono, but the installed package list must be checked before treating JetBrains Mono as a guaranteed bundled font.

These are initial repository observations, not a claim that every page has been visually or behaviorally tested.

## 8. Implementation sequence

1. Inventory all stylesheet imports, token definitions, repeated selectors, `!important` usage, and theme overrides.
2. Record current behavior and identify high-risk cascade dependencies.
3. Finalize tokens and component contracts without changing business logic.
4. Implement and verify the three reference screens: Summary/Dashboard, P&L, and STEN AI.
5. Migrate the remaining modules to shared component patterns.
6. Run typecheck, lint, tests, and production build; inspect responsive layouts and both themes.
7. Review the diff for API/backend/deployment changes. This work must remain frontend-only unless explicitly authorized.

## 9. Acceptance criteria

- No financial formula, threshold, data source, or tenant/restaurant access rule changes.
- No fake values introduced; null/unknown remains visibly unknown.
- Dark, light, and system theme behavior remains functional.
- Keyboard focus and reduced-motion behavior remain available.
- No new global overrides are added as a shortcut for component work.
- Mobile layouts have no unintended horizontal page overflow or obstructed primary controls.
- Existing automated checks pass, or failures are documented with their cause.
- The design-code documentation matches the implementation and is updated with any approved exceptions.


## 10. Global header contract

The shared application header is part of the core workspace, not a decorative banner.

- Desktop: current page, period context, restaurant/workspace selector, financial scale where relevant, theme control, and account identity align on one stable row.
- The page name is the primary text; period context is secondary metadata and must not compete with it.
- The workspace selector remains data-driven and must never fabricate restaurant names, IDs, or access scope.
- Use semantic theme tokens for surfaces, borders, and text; avoid blur, glow, decorative gradients, and nested card treatments.
- Tablet: reduce secondary metadata and profile text before compressing primary controls.
- Mobile: keep menu, current page, workspace scope, theme, and account avatar reachable without horizontal page overflow. Hide non-essential period metadata and the financial scale control in the global header on narrow screens; page-level financial controls remain responsible for their own workflows.
- Icon-only controls need accessible labels and visible keyboard focus.
- Do not add notification or status indicators unless backed by a real application state.

The first styling pass is in `src/obsidian-precision-completion.css`, scoped to `.topbar.executive-topbar`. It deliberately preserves `Layout.tsx` behavior, the scope selector, theme state, and financial-scale logic. Source-level implementation is recorded; browser visual QA at desktop/tablet/mobile sizes and in both themes remains outstanding.

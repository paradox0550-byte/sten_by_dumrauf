# STEN — Desktop and Telegram Frontend Audit

Date: 2026-11-04
Branch: `feat/desktop-telegram-visual-audit-2026-11`
Scope: source-level frontend audit and a first visual refinement of Telegram Monitor. No browser-rendered QA is claimed.

## Guardrails

- Frontend only. Do not modify backend source, backend manifests, API routes/contracts, database, Yandex Cloud Functions, API Gateway, secrets, or deployment configuration.
- Do not merge or deploy without explicit approval.
- Do not add visual controls for functionality that is not implemented.
- Missing operational data remains missing; never replace it with zero or demo values.

## Current stylesheet entry point

The current `src/main.tsx` imports styles in this order:

1. `src/styles/tokens.css` (compatibility entry point to canonical visual-system tokens)
2. `src/app.css` (legacy compatibility styles)
3. `src/styles/unified-interface.css`
4. `src/styles/operations-calm.css`
5. `src/styles/mobile-experience.css`
6. `src/styles/sten-visual-system.css`
7. `src/styles/visual-system/index.css`

The final visual-system entry point imports Tailwind utilities, tokens, shell, components and responsive styles. The current cascade is therefore not accurately represented by the older `CSS-AUDIT-INITIAL.md`, which describes a different import set. That older document should remain historical evidence, not be used as the current import map.

### Cascade risks confirmed from source

- `app.css`, `unified-interface.css` and `sten-visual-system.css` contain legacy/unlayered declarations and `!important` overrides.
- The final visual-system files use declared cascade layers. Unlayered normal declarations can outrank layered normal declarations; important declarations reverse layer precedence.
- Multiple final layers restate shared shell, page heading, panel, button and responsive rules. A change to a single selector must be checked against all later definitions and its actual TSX class usage.
- `app.css` describes itself as legacy compatibility, but remains a large imported stylesheet. It should not be deleted or reordered as a cleanup shortcut.
- The app supports light and dark semantic tokens. Hard-coded colors in page-level styles can bypass both themes and must be reviewed component by component.

## Desktop shell — source-level observations

- The app has a shared fixed sidebar, sticky topbar and centered content region. Desktop shell geometry is distributed across legacy styles, unified-interface, signature visual-system and the final visual-system shell styles.
- Collapsed sidebar width and main-content offset have previously required explicit synchronization; future shell changes must preserve the same geometry in expanded and collapsed states.
- The final content width is token-driven (`--sten-content-width`) and further constrained by page-level max-width declarations. Pages should be checked at common laptop widths as well as wide monitors; a wide viewport must not create unnecessarily stretched reading lines.
- Global controls use a 44px minimum target in the unified layer, but older component-specific styles may override dimensions. Verify computed size and focus state rather than assuming the global token wins.
- Responsive CSS includes a 900px composition breakpoint and 767px mobile breakpoint. A desktop audit must include 1024px and 1280px widths, not only 1440px+.

## Telegram Monitor — current capability inventory

### Implemented in the current frontend

- Fetch and display Telegram chats.
- Filter chats by all / bound / unbound and search by chat or restaurant name.
- Bind an unbound chat to a restaurant using the existing endpoint and organization context.
- Show a combined message feed across bound chats or a selected-chat feed.
- Search saved message text.
- Load and save bot settings for a selected bound chat.
- Display a personal workspace limit of three managed restaurants.

### Settings currently exposed

- Mode: observer or secretary; controller is disabled in the selector.
- Notification level: urgent only, deviations, all.
- Morning report time.
- Evening report time.
- Escalation interval.

The UI itself states that scheduled report delivery and escalation are not active. The time/interval fields therefore represent saved preferences, not proof of running schedules or notifications. Preserve that distinction in labels and status copy.

### Missing from the current frontend

- Operational overview / actionable event queue.
- Structured event triage and disposition history.
- Task and assignment lifecycle (owner, due time, status, completion evidence).
- Escalation status and delivery history.
- Report history and delivery status.
- Configurable responsible people / roles.
- Rule-level controls for opening checklist, stop-list reminders, table visits, control points, observations and follow-up.
- A clear separation between bot connection health, chat binding, message ingestion and operational processing health.

These are product gaps, not merely styling defects. Do not fabricate them in the UI until the frontend contract and backend capability are separately authorized and verified.

## First visual implementation in this branch

Changed only:
- `src/styles/telegram-bot-control.css`
- `src/styles/telegram-monitor.css`

Presentation changes:
- Rebalanced desktop settings into a three-column control grid at wide desktop widths and two columns at intermediate widths.
- Improved settings panel hierarchy, labels, control heights, scope indicator, approval notice and save footer.
- Refined Telegram page heading, summary metrics, panel headers, chat list density, selected-chat marker, message rhythm and focus-visible states.
- Preserved the existing mobile single-column behavior and semantic theme tokens.
- No new buttons, API calls, data fields, routes, or business behavior were introduced.

## Verification status

- Source files and import order inspected on `main`.
- Changes committed to the isolated feature branch.
- No backend files or manifests changed.
- No browser screenshots, computed-style inspection, accessibility run, local build, typecheck, lint, or CI result have been verified in this audit slice.
- Desktop visual review is still required at 1024px, 1280px, 1440px and 1920px in both light and dark themes; tablet/mobile regression review is also required.
- This branch is not release-ready until CI and visual QA are complete.

## Next audit slices

1. Inspect the shared desktop shell and high-use business pages: Summary, My Day, P&L, Team/FOT, Analytics, Settings and STEN AI.
2. Record page-specific desktop defects before changing global tokens or shell geometry.
3. Audit Telegram settings against existing API response/write behavior without changing API contracts.
4. Keep missing task/event/report workflows documented as unsupported until separately approved and supported.

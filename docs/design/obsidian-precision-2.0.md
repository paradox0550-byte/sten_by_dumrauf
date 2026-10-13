# Obsidian Precision 2.0 — STEN adaptive design guide

## Goal

One React application and one route/data model across 360–1920 px. Breakpoints change presentation only; they must not fork business logic, API requests, or calculations.

## Breakpoints

| Range | Navigation | Content |
|---|---|---|
| 360–479 px | Hidden sidebar, drawer + fixed bottom navigation | Single column; safe-area padding |
| 480–767 px | Hidden sidebar, drawer + fixed bottom navigation | Single column, compact cards |
| 768–1023 px | 72 px icon rail by default; user can expand to 240 px | Two-column bento where content allows |
| 1024–1279 px | 72 px icon rail by default; user can expand to 240 px | Flexible content, horizontal overflow only inside data tables |
| 1280–1919 px | Persistent 240 px sidebar | Dense workspace, multi-column grids |
| 1920 px and above | Persistent 240 px sidebar | Centered content with readable maximum width |

The breakpoints are documented as CSS custom properties in `src/styles/tokens.css`. Media queries use literal values because CSS custom properties cannot currently be substituted into media-query conditions.

## Theme contract

- Preference key: `sten_theme_v5`; supported values: `system`, `dark`, `light`.
- The pre-paint script in `index.html` resolves the initial theme before the application module executes.
- `data-theme` on `<html>` is always the resolved visual theme (`dark` or `light`); `data-theme-mode` records the preference (`system`, `dark`, or `light`).
- In system mode, the shell subscribes to `prefers-color-scheme` changes.
- Canonical semantic tokens live in `src/styles/tokens.css`; component styles should use semantic tokens, not hard-coded palette values.
- Existing legacy styles remain in place during migration. Do not remove them until route-by-route visual regression checks prove they are unused.

## Navigation contract

- Desktop: persistent 240 px sidebar.
- Tablet: 72 px icon rail by default, expandable to 240 px. Preference persists using `sten_sidebar_collapsed`.
- Mobile: sidebar is a drawer over content; backdrop and Escape close it. Bottom navigation provides the primary shortcuts; STEN AI remains available through the floating assistant.
- Keep all secondary routes reachable from the drawer, including Secretary, Flash Report, Budget, Analytics, Team/Payroll, Finances, Memory, Admin Organizations (for authorized users), and legal documents.
- Touch targets should be at least 44×44 px wherever practical; focus-visible must remain visible.

## Data and behavior invariants

- Missing values are rendered as “—” / “Нет данных”, never synthesized as zero.
- Preserve the existing P&L, Prime Cost, payroll, cash balance, and EBITDA formulas.
- Preserve API client usage through the existing `VITE_API_URL` configuration. Do not hard-code gateway URLs.
- Keep JWT/auth behavior and route guards unchanged.
- Loading, error, empty, and partial-data states are first-class states, not decoration.

## Page layout guidance

- Dashboard: 4–6 card bento on wide desktop, 2 columns on tablet, vertical stack on mobile.
- P&L: hierarchy/table on desktop; contained horizontal scrolling or compact rows on tablet; article cards on mobile. Preserve expand/collapse and AI/Secretary actions.
- STEN AI: chat occupies available width; documents panel collapses or becomes a sheet on smaller screens; composer respects safe area and virtual keyboard.
- Secretary: three logical groups (My day, Inbox, Next 7 days); stack and collapse secondary groups on mobile.
- Flash Report: Prime Cost remains prominent; primary submit action must stay reachable without covering inputs.
- Team/Payroll: summary metrics before the table; use cards on mobile rather than whole-page horizontal scrolling.
- Settings: section navigation and content become a vertical stack on narrow screens.

## Verification matrix

Before release, inspect each route at: 360×640, 375×667, 393×852, 768×1024, 1024×768, 1280×800, 1440×900, and 1920×1080. At every size check overflow, navigation, focus order, 44 px targets, floating assistant collisions, empty/error states, and theme changes. Also test reduced motion and live system-theme changes.

## Implementation status

This guide defines the target and records the current incremental migration. A guide or static CSS rule is not proof of browser correctness: run typecheck, lint, unit tests, production build, bundle comparison, and real browser checks before marking any screen as verified.

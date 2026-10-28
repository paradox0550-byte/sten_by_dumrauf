# CSS cleanup audit — 2026-10-28

## Scope
Source-level audit of the current `main` CSS entry points. No browser-computed styles or screenshots were available during this pass. This audit does not claim that a stylesheet is unused merely because it looks old or duplicates selectors.

## Confirmed findings

1. `src/main.tsx` imports these global layers in order:
   - `src/styles/tokens.css`
   - `src/app.css`
   - `src/styles/unified-interface.css`
   - `src/styles/operations-calm.css`
   - `src/styles/mobile-experience.css`
   - `src/styles/sten-visual-system.css`
   - `src/styles/visual-system/index.css`

2. `src/styles/tokens.css` is a compatibility entry point that imports `src/styles/visual-system/tokens.css`. Do not remove it until all direct imports are checked.

3. `src/styles/unified-interface.css` and `src/styles/mobile-experience.css` both declare global sizing/overflow behavior for `html, body, #root`. These declarations are not identical, so they are overlapping responsibilities, not proven exact duplicates.

4. `src/app.css` contains large legacy styles and embedded blocks labelled `obsidian-precision-completion.css` and `calm-intelligence-v2.css`, while newer global layers are also imported from `main.tsx`. This is the highest-priority consolidation candidate. Because `app.css` is actively imported and its cascade includes component and responsive rules, it must not be deleted or moved wholesale without selector-level usage and browser comparison.

5. The import order is behaviorally significant. Later styles can intentionally override earlier declarations. Repeated selectors alone are not sufficient evidence for deletion.

## Quarantine policy

This directory is the CSS trash/quarantine area. Move a stylesheet here only after confirming:
- it has no live imports, dynamic imports, or runtime injection;
- its rules are not relied on by any route or component;
- removing it causes no computed-style changes in light/dark themes at phone, tablet, and desktop widths;
- frontend checks and visual smoke tests pass.

Do not put an active stylesheet in quarantine just to make the source tree look cleaner. Keep the original in place until a safe removal is demonstrated.

## Next safe cleanup slice

1. Build a complete import/reference map for every CSS file.
2. Extract exact duplicate selector/declaration blocks from active stylesheets, preserving the last effective declaration and media-query boundaries.
3. Compare computed styles/screenshots for Dashboard, P&L, STEN AI, login, Settings, and My Day in both themes at phone/tablet/desktop widths.
4. Remove only verified dead files or exact duplicates; then run typecheck, lint, tests, and production build.

## Status
- No CSS stylesheet was deleted or moved in this pass.
- No import order, tokens, page styles, business logic, API/backend, or deployment configuration was changed.
- This is an initial audit/quarantine scaffold, not a completed CSS purge.

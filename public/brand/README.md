# STEN brand assets

## Canonical files

Use these assets for new UI and public-facing surfaces:

- `sten-mark.svg` — sapphire mark on transparent background. Use on either theme when the surrounding surface provides sufficient contrast.
- `sten-mark-white.svg` — white mark for dark surfaces only.
- `sten-lockup.svg` — mark + STEN wordmark + descriptor for light surfaces.
- `sten-lockup-reverse.svg` — same lockup for dark surfaces.
- `../favicon.svg` — canonical browser favicon.
- `../icon-192.svg` and `../icon-512.svg` — installable app icons referenced by `manifest.json`.

## In-app logo

Use `src/components/brand/StenLogo.tsx` for React UI instead of embedding SVG files directly. Its wordmark colors use the theme tokens `--text-primary` and `--text-secondary`, so it remains legible in dark and light themes. The symbol uses the brand sapphire `#5B7CFA`.

## Rules

- Keep the mark geometry consistent across variants; only color and lockup composition may differ.
- Do not add glow, gradient, shadow, blur, or decorative framing to the logo.
- Do not stretch the mark or wordmark. Preserve intrinsic proportions.
- Use the standalone mark for compact navigation and app icons; use a lockup only when there is enough room for the descriptor to remain legible.
- Treat `sten-logo.svg` as a legacy alias of the light lockup. Treat `sten-mark-light.svg` as a legacy name for the white mark. Keep these paths until all external references are verified absent.
- `public/icons/favicon.svg` is retained as a compatibility path; new references should use `public/favicon.svg`.

## Quick review checklist

- [ ] Mark is recognizable at 16–24 px.
- [ ] Wordmark passes contrast checks on its intended background.
- [ ] Light and dark lockups are not interchanged.
- [ ] SVGs remain crisp without CSS filters.
- [ ] Browser favicon and PWA icons show the same mark and background.

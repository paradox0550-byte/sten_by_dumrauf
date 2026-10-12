# STEN — Obsidian Precision Style Guide

Версия: 1.0 · 12 октября 2026 · Frontend only

## Принципы
- Executive cockpit: сначала отклонения и решения, затем контекст.
- Missing ≠ zero: неизвестное значение отображается как «—» или «Нет данных», не как 0.
- Цвет не единственный сигнал: статус дублируется текстом, направлением отклонения и/или иконкой.
- Финансовые формулы остаются в существующих детерминированных функциях/API.
- Не добавлять фиктивные данные, декоративные графики или неподключённые действия.

## Design tokens
| Token | Value |
|---|---|
| --bg-base / --bg-app | #080c14 |
| --bg-surface | #0f1422 |
| --bg-elevated | #161d2e |
| --bg-inset | #0b1020 |
| --border-subtle | rgba(255,255,255,.08) |
| --text-primary | #e6ecff |
| --text-secondary | #8b9bbf |
| --text-muted | #8291b5 (contrast-safe override vs. low-contrast reference #4a5878) |
| --color-brand | #5b7cfa |
| --color-accent | #00f0ff |
| --color-success | #00e599 |
| --color-warning | #fbbf24 |
| --color-danger | #ff4d6d |
| --ui-radius-sm | 6px |
| --ui-radius-md | 10px |
| --ui-radius-lg | 14px |

## Typography
- UI: Inter Variable, 400 / 500 / 600.
- Financial values: JetBrains Mono, 400 / 500 / 600; `font-variant-numeric: tabular-nums lining-nums`.
- Scale: 12, 13, 14, 16, 20, 24, 32 px. Body line-height 1.4; financial values 1.2.
- Focus: visible 2px electric-cyan outline.
- Motion: 120–180ms; never exceed 200ms; respect reduced-motion.

## Component specifications
| Component | Dimensions / treatment | States |
|---|---|---|
| Card | surface, 1px subtle border, 14px radius, 18–20px padding | default, hover, loading, empty, error |
| Primary button | min-height 40px, 10px radius, 12–16px horizontal padding | hover, focus, pressed, disabled |
| Secondary button | same dimensions, elevated surface, subtle border | hover, focus, disabled |
| Badge | 12px label, pill, 4×8px padding | normal, attention, critical, neutral |
| StatusDot | 6px, currentColor | ok/warn/error; pair with text |
| ProgressBar | 4px height, pill track | ≤60% normal; >60–65% attention; >65% critical |
| Number cell | right-aligned JetBrains Mono, tabular figures | semantic variance colors; null → em dash |
| Table row | 40–44px minimum, 12–14px text | hover actions only if real handlers exist |
| Modal/popover | elevated surface, 1px border, 14px radius | open, focus, dismiss, confirm |
| Skeleton | elevated shimmer matching final geometry | loading; no animation for reduced motion |
| Empty state | concise message, no illustration | «Нет данных за октябрь»; supported action only |

## Financial semantics
- Revenue / EBITDA / profit: fact above plan is favorable; below plan is unfavorable.
- COGS / payroll / OPEX / rent: fact above plan is unfavorable; below plan is favorable.
- Delta = fact − plan. Relative delta only when plan > 0.
- Missing plan/fact stays missing. Never derive zero, percent, arrow, or severity from null.
- Prime Cost = (COGS + payroll) / revenue × 100 only when all inputs are valid. ≤60% normal, >60% through 65% attention, >65% critical.

## Screen behavior
### P&L
Prioritize critical deviations above the table. Preserve Revenue → COGS → Gross Margin → controllable OPEX → controllable profit → uncontrollable expenses → EBITDA → Net Profit. On hover, show “Разобрать в AI” / “В Секретарь” only where handlers exist. At 1024×768, reduce side padding and scroll the table rather than truncate values.

### STEN AI
Keep composer compact. Separate progress steps, sources and proposed memory. Memory requires explicit save/skip; never silently persist.

### Secretary
Bento: “Мой день”, “Входящие”, “7 дней”. Use real events/notes. Empty lists use concise context and supported create action.

### Flash Report
Emphasize revenue, cash/card reconciliation, average check and Prime Cost. Balance only when cash and card are present. Missing Prime Cost inputs → “Нет данных”, not 0%.

### Team & Payroll
Sort by payroll descending only when data exists. Productivity requires confirmed revenue and hours. Unsupported API scope is unavailable, not an empty team.

## Accessibility
Target ≥4.5:1 for normal text. Accent colors are emphasis, not low-contrast body copy. Never rely on color alone. Tablet target 1024×768; mobile shell remains responsive.

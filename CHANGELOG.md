# Changelog

## [1.2.0] — UI/UX Polish (Этап 10)

Системный рефактор CSS и UX: доступность, современный CSS, производительность.

### Added
- View Transitions API для навигации между страницами (#23, #24)
- Container Queries для KPI-карточек (#18)
- Self-hosted Inter Variable — 7 subsets woff2 (#19)
- Fluid typography clamp() для KPI-чисел (#16)
- Токен --color-brand-strong для WCAG AA (#16)
- Трёхуровневая система дизайн-токенов: primitives → semantic → component (#20)
- @layer legacy + @layer components для управления каскадом (#22)
- Component-токены: --control-bg, --active-bg, --chip-font-size (#20)

### Changed
- color-mix(in srgb) → color-mix(in oklch) — предсказуемая светлота (#18)
- Hover-shadow KPI через ::after + opacity — GPU compositing (#16)
- Снятие ~400 префиксов .executive-shell в 6 батчах (#22)
- Удалён дублирующий @media (prefers-reduced-motion) (#16)

### Fixed
- Контраст активных кнопок в dark-теме: 2.78:1 → 5.79:1 (WCAG AA) (#16)
- .period-chip перенесён из mobile MQ в правильное место (#16)
- Белое пятно активной кнопки .global-scale и .pnl-scale-toggle (#16)

### Performance
- CSS размер: 101.47 → 96.10 KB (-5.3%)
- Hover-анимации — compositing вместо paint (INP)
- Self-hosted шрифты — нет блокирующего запроса к Google Fonts

### Accessibility
- WCAG AA контраст (4.5:1) для текста на тонированных фонах
- prefers-reduced-motion отключает view transitions
- NavLink — Ctrl/Cmd/Shift/Alt-click открывает в новой вкладке нативно (#24)

### Verification
- npm run typecheck — 0 ошибок
- npm run lint — 0 ошибок
- npm run build — успешно (CSS 96.10 KB, JS 257.80 KB)



## [1.1.0] — Frontend freeze (Этап 3)

Заморозка frontend-контура перед сохранением репозитория на ПК и деплоем в Yandex Cloud.
Дальнейшие изменения frontend только по результатам live-проверок (Этап 4+).

### Fixed
- `Settings.tsx`: восстановлен синтаксис файла (был повреждён в HEAD, TS1005); ключи localStorage приведены к `v5` (`sten_theme_v5`, `sten_blocks_v5`) — согласовано с `Layout.tsx`.
- Auth UI: убраны offline-bypass формулировки («локальная оболочка без интернета») из `Unlock.tsx` и руководства Настроек. Доступ выдаёт только сервер через `POST /auth/unlock` + `/auth/me`.
- Strict typecheck: `financeCalculator.ts` (`reduce<number>`), `Dashboard.tsx` (типизация карточек с иконками), `Settings.tsx` (`Object.entries<boolean>`).
- Стили: добавлены отсутствовавшие классы `.muted`, `.danger-button`, `.metric-icon`, `.list-row`, `.panel.insight` — использовались в разметке, но не были определены.

### Added
- Escape закрывает onboarding-модалку (с фиксацией `sten_onboarding_v5=1`), затем мобильный drawer (`Layout.tsx`).
- Единые тайминги переходов (0.16s), active-состояния кнопок, анимации модалки/backdrop; всё под `prefers-reduced-motion`.
- Контракты в документации: `docs/SECRETARY_REFERRER_SPEC.md`, `docs/PNL_WORKSPACE_SPEC.md`; ссылки в `AGENT.md` и `README.md`.

### Security
- Зафиксировано правило: секрет авторизации существует только на backend / в secret storage; frontend не имеет права создавать пользователя локально. Published personal code удалён из документации.

### Contracts (rules committed to code/docs)
- P&L: working financial table; scope Project→Branch→Restaurant→Department; `period + scope_type + scope_id` на каждом запросе/записи; scale ₽ / тыс. ₽ / млн ₽; **пусто ≠ 0**; save подтверждается только readback (POST → GET → «Сохранено сервером»).
- Finance integrity: сначала агрегат сумм, потом коэффициенты; derived metrics требуют formula/version/provenance; backend authoritative.
- STEN: YandexGPT только через backend; document pipeline analysis-first; no silent persistence, no fake fallback.
- Секретарь-референт: детерминированный сервис, GPT не используется; UI секретаря не создаётся до реальных backend endpoints calendar/events/reminders/booking (production gate).

### Verification (regression gate, Этап 2)
- `npm run typecheck` — 0 ошибок.
- `npm run build` — успешно (index.js ~63 kB, react vendor ~174 kB, export ~330 kB, css ~21 kB).
- Close button: mobile-close, modal-close, «Закрыть раздел», backdrop aria-label — на месте.
- Аудит на fake/zero: `|| 0`, `?? 0`, mock/demo/random/fake, offline-user — отсутствуют в финансовом и auth-контуре.

## [1.0.0] — Архитектурная база
- Frontend → API Gateway (`d5d5p4eof6ra03bsva7a`) → Cloud Function (`d4epijnhj7h9sd5ppa66`, Node.js 22, `index.handler`) → PostgreSQL → Yandex AI Studio/YandexGPT.
- OpenAPI восстановлен и приведён к текущему контракту.
- Auth: `POST /auth/unlock` → JWT → `/auth/me`; offline-bypass удалён.
- P&L foundation, Scope foundation, financeCalculator, документация проекта.

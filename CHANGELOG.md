# Changelog

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

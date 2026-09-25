# STEN / Смена в кармане — Project Memory

> Канонический технический контекст. `main` — единственная ветка-истина.

## 1. Цель
Личный рабочий кабинет управляющего рестораном: PLAN → FACT → CONFIRMED → PAYROLL → P&L → ANALYTICS. STEN — персональный аналитический помощник, который работает с реальными данными, документами и детерминированными расчётами.

## 2. Каноническая архитектура
- Frontend: React 19 + TypeScript + Vite 8 + Tailwind CSS 4.
- Production frontend: только Yandex Object Storage, бакет `smenavkarmane-business`.
- API: отдельный Yandex API Gateway.
- Backend/STEN: отдельный Yandex Cloud Function + PostgreSQL + JWT; он уже настроен в Yandex Cloud и не входит в frontend deployment workflow.
- AI: Yandex Cloud AI Studio / YandexGPT; браузер не получает AI credentials.
- Старый Python `worker/` контур удалён из репозитория: его функции больше не являются частью frontend-контракта.

## 3. Production URLs
- Static site: `https://smenavkarmane-business.website.yandexcloud.net`
- API Gateway: `https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net`
- Yandex AI Studio: `https://ai.api.cloud.yandex.net/v1`
- Model URI: `gpt://<folder_id>/yandexgpt/latest`

## 4. AI/STEN
STEN читает историю, доступные документы, P&L и результаты инструментов. YandexGPT интерпретирует доказательства; деньги, проценты и P&L считает код. Если факта нет — STEN прямо говорит, каких данных не хватает. Нельзя подменять отсутствие данных нулями или выдумывать причины.

Канонические инструменты: P&L/food cost/EBITDA, payroll analytics, поиск документов, поиск операционных процессов. WRITE/CRITICAL операции требуют отдельного подтверждения и audit trail.

## 5. UI/UX
Продукт личный, спокойный и премиальный: светлая тема, много воздуха, строгая типографика, карточки без glass/aurora-эффектов, единый desktop/iPhone shell. Не перегружать экран. На мобильном — компактная навигация, safe-area и touch targets.

## 6. Auth
Единственный пользовательский вход — персональная разблокировка `/auth/unlock`. Email/password UX отключён. Frontend хранит JWT и обращается к API Gateway; прямого вызова YandexGPT из браузера нет.

## 7. Static deploy rule
GitHub Actions собирает только frontend и публикует `dist/` в Object Storage. Backend не пакуется и не деплоится из этого workflow. Для SPA bucket website использует `index.html` как home page и `404.html` как error page, чтобы клиентские маршруты `/unlock`, `/ai`, `/pnl` и другие не возвращали 404. Workflow не выполняет `--delete` по всему бакету, потому что в нём могут находиться документы.

## 8. Business rules
Revenue = hall + delivery. Personnel = salaries + KPI bonuses. EBITDA = revenue − cost − OPEX. Net profit = EBITDA − depreciation − interest − taxes. Food cost norm = 25–35%. OPEX norm: 3.0% до 2.5 млн revenue, 2.9% выше. KPI: average check, table turnover, delivery share, cancellation %.

## 9. Engineering rules
1. Не чинить ошибку повторным патчем наугад.
2. Сначала читать текущий `main`, затем проверять фактическую причину.
3. Не возвращать старые login/password, legacy UI или старый AI runtime без доказанной необходимости.
4. Не коммитить секреты.
5. Не считать build доказательством работоспособности API/DB/YandexGPT.
6. После UI-изменений проверять `typecheck → build → static deploy smoke test`.
7. Не удалять объекты пользовательских данных из Object Storage во время frontend deploy.

## 10. Current gate
Перед production считаем frontend готовым после: typecheck PASS, build PASS, `index.html` и JS/CSS доступны из Object Storage, `/unlock` отдаёт SPA shell, API URL указывает на Gateway, а backend/STEN отдельно подтверждён реальным health/ask тестом.

## 11. Auditor skill set
The engineering auditor uses focused playbooks: UI visual, root-cause debugging, API contract, finance integrity, YandexGPT, security/secrets, deploy smoke and mobile UX. New confirmed findings should update the relevant skill or this memory instead of creating contradictory instructions.

## 12. Backend secret boundary
AWS credentials, JWT secret, database password, YandexGPT API key and unlock code are backend secrets. They are never frontend configuration. Backend environment names are documented in docs/BACKEND_ENV_CONTRACT.md without secret values.


## 2026-09-24 — Operating director scope and document intelligence
- The target user model is an operating director managing multiple projects, optional branches, restaurants and departments.
- A branch is an aggregation node for assigned child units. Standalone units outside a branch are not compared with each other.
- Dashboard, P&L, Finances, Budget, Analytics and STEN must share one explicit scope selector and period.
- Financial aggregation is raw-amount-first; percentages are recalculated after aggregation.
- Missing values remain missing; never coerce absent facts to zero.
- Added deterministic frontend calculator at `src/lib/financeCalculator.ts`; backend remains authoritative for persisted financial facts.
- STEN target document flow: Excel/CSV/PDF/DOCX/images → server extraction/OCR → evidence preview → analysis → explicit save decision → optional persistent indexing; normalized XLSX is a derived downloadable artifact with provenance.
- Issue #12 tracks backend/API work required before presenting these capabilities as fully connected production features.

## 2026-09-24 — Auth root-cause fix
- Removed the frontend offline-auth bypass from `AuthContext`: no bundled 4-digit hash, no synthetic owner identity, and no `sten_offline_v3` session flag.
- A user is authenticated only after `/auth/unlock` returns a token and `/auth/me` validates that token.
- Network/API failure no longer grants an authenticated UI identity. This prevents a client-side brute-force/bypass path and keeps production data behind the real Gateway session.
- P&L summary no longer sums unrelated financial articles; it shows revenue plan/fact and count of populated rows.

## 2026-09-24 — Auth contract and secret hygiene follow-up
- Project documentation previously stated an offline unlock path and exposed the personal unlock code in `docs/STEN_HANDOFF.md`; both were removed.
- The unlock code is backend/secret-store material only and must never appear in Git, frontend source, docs or build output.
- Offline UI may render public/local settings, but it must never create or restore an authenticated user without a valid server JWT.
- If documentation and implementation disagree, current `src/contexts/AuthContext.tsx` and the security rules above are authoritative; update stale docs immediately.


## 2026-09-24 — backend source-of-truth cleanup
- Backend v5.0.1 is part of main under `backend/`; package.json and package-lock.json are aligned to 5.0.1.
- Removed generated `backend/node_modules`, function ZIP, sync duplicate tree and old bundle/archive artifacts from current main tree. They must not be committed again.
- `.gitignore` is now normalized for dependencies, build output, archives and local env files.
- CI now validates backend with `npm ci --omit=dev` and `node --check backend/index.js`; it no longer rejects the backend directory.
- README/auth documentation was corrected: offline shell is not authentication; no synthetic user/offline bypass.
- Current GitHub Actions runs still fail before usable step logs are produced; this is not yet evidence of a code failure.


## 2026-09-24 — 15-step production readiness gate
- Полная готовность ведётся по docs/PRODUCTION_READINESS_15_STEPS.md.
- Порядок: source-of-truth → backend → Scope → P&L → Excel ingestion → persistence → financial Core → Budget → Dashboard → STEN documents → STEN skills → Secretary → UI/UX → E2E → release gate.
- Готовность означает UI → authenticated API → DB/Object Storage/AI → readback → UI.
- Secretary является отдельным production-контуром без GPT.
- Budget получает данные из P&L, а не дублирует ручной ввод.
- STEN должен обрабатывать содержимое файлов, а не только хранить файл.
- Excel import обязан выдавать структурированный preview и сохранять только после явного подтверждения.

## 2026-09-24 — backend deployment gate and schema root-cause
- `backend/index.js` had a real syntax-breaking malformed `ai_documents` migration block and duplicated `secretary_events` DDL. Both were repaired on `main`.
- Backend is now version `5.0.2`; upload limit is aligned to 15 MB.
- Full backend source was fetched after the repair and JavaScript syntax was checked successfully for `backend/index.js`, `backend/documentProcessor.js`, and `backend/core/skills.js`.
- Added `.github/workflows/deploy-backend.yml`: authoritative source is `backend/`, deployment target is `smenavkarmane-api`, runtime `nodejs22`, `index.handler`, 256 MB, 90 seconds, network/service-account configuration is explicit, and the workflow smoke-tests the API Gateway `/healthz` endpoint.
- Backend deployment is NOT claimed complete until GitHub Variables for Yandex Cloud deployment and Lockbox references are configured and the workflow finishes successfully. Current observed backend deployment run failed in `Validate backend` because the required deployment configuration is not present/confirmed; the deploy job was skipped.
- Existing frontend/CI runs are also currently failing at GitHub Actions infrastructure/configuration level; no successful production deploy is claimed from those runs.


## 2026-09-24 — production readiness continuation: financial core and scoped STEN
- Replaced the placeholder `Finances` screen with a real scope-aware financial core derived from confirmed P&L rows.
- Financial chain shown by the UI: Revenue → COGS → Gross Profit → Payroll → OPEX → EBITDA → Depreciation/Interest/Tax/Other → Net Profit.
- Margins are recalculated from raw RUB inputs; missing inputs remain `—`.
- STEN now carries the selected Project/Branch/Restaurant/Department/Period scope into `/ask`.
- Backend `/ask` now uses that scope when retrieving P&L context, instead of silently using the current month across the whole organization.
- STEN document UI limit is aligned to the backend production limit of 15 MB.
- OpenAPI is synchronized to backend v5.0.2 and documents the optional scoped STEN request.
- This is implementation progress, not an E2E production confirmation: GitHub Actions runs observed for frontend/backend currently fail before usable step logs, and Cloud Function deployment remains gated by required GitHub/Yandex variables.


## 2026-09-24 — dashboard trend pass
- Dashboard now reads the selected scope for the current period plus the previous five periods.
- Trend data is built from actual P&L read results only; missing periods/metrics are omitted rather than replaced with zero.
- EBITDA is recalculated from raw revenue, COGS, payroll and OPEX for each period.
- Dashboard also exposes plan/fact data coverage so a visually complete screen does not hide missing financial facts.

## 2026-09-24 — Excel persistence contract closed and OpenAPI corruption repaired
- src/pages/PnlImport.tsx now sends only the strict /api/pnl row contract (id, article, plan, fact, source); unsupported provenance fields are no longer sent by the frontend.
- Excel flow is now: local preview → backend parse-only import → explicit confirmation → /api/pnl write → server confirmation → scoped GET readback → exact article/plan/fact comparison.
- openapi.yaml had a real truncated AskRequest scope pattern plus a duplicated schema tail; the file was rebuilt from the verified route section and the schema tail was normalized. Ask scope now has a complete period pattern and all four scope IDs.
- Backend health version and document upload error text are aligned to v5.0.2 / 15 MB.
- GitHub Actions for the latest main commit still fail in the runner/configuration gate; the backend deploy job is skipped. This is not a production deployment confirmation.


## 2026-09-24 — UI architecture and visual-system pass
- Audited the current main branch shell, routing, import flow and global CSS before visual changes.
- Fixed a real casing defect: App now imports the canonical `src/pages/PnlImport.tsx`; stale duplicate `src/pages/PnLImport.tsx` was removed. This prevents divergent production import implementations and casing collisions.
- Added a responsive mobile bottom navigation for STEN, Overview, P&L, Finance and Secretary; Budget remains available in the full menu.
- Replaced the misleading section-close X action with a semantic back-to-STEN arrow.
- Extended the existing visual system for 2026 B2B UX: stronger hierarchy, consistent 40px controls, touch targets, active navigation state, dialog sizing/scrolling, upload/dropzone affordances, dense finance tables, mobile safe-area handling, hover/focus/pressed states, and responsive card/button layout. No glassmorphism was introduced into the main desktop shell.
- Aligned Excel import copy with the actual backend contract: source sheet/row are shown for verification; no unsupported claim that source cells are persisted.
- Next gate: run typecheck/build/CI after these UI changes, then continue with end-to-end production verification and remaining STEN document/skills/Secretary gaps. Do not declare production-ready until CI and Yandex Cloud deployment smoke checks pass.


## 2026-09-24 — finalization pass: P&L readback and release gate

- Fixed `src/pages/PnL.tsx`: save is now considered confirmed only when the subsequent scoped GET returns the same row count and exact article/plan/fact values that were submitted.
- Added `docs/PRODUCTION_RELEASE_GATE.md`: one release checklist covering frontend validation, auth, Scope, P&L readback, finance chain, STEN/YandexGPT, Secretary, 2026 UI/UX, CI and Yandex Cloud smoke verification.
- Current state remains not production-ready until CI and real Yandex Cloud smoke checks are green/confirmed.

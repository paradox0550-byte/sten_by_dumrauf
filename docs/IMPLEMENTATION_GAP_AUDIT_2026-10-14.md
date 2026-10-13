# STEN — аудит документов и нереализованных требований

Дата: 2026-10-14  
Ветка проверки: `audit/docs-implementation-gaps-2026-10-14`

## Как оценивалось

Документы сопоставлены с исходниками и workflow-файлами репозитория. Статусы ниже означают:
- **Подтверждено частично** — есть код/контракт, но end-to-end production доказательства нет.
- **Не подтверждено / gap** — документы требуют функцию, а доступные источники не доказывают завершённую реализацию.
- **Не трогать в frontend PR** — требуется отдельная backend/cloud/security работа и собственный release gate.

Один только документ, UI-экран или зелёный CI не является подтверждением runtime-функции.

## Что можно было безопасно применить здесь

- [x] Ограничить Vite dev server loopback-интерфейсом. Security audit отмечал `server.host=true` как ненужную сетевую экспозицию разработки. Изменение не влияет на production build и Object Storage deploy; доступ по LAN теперь требует явного локального override.
- [x] Проверить, что PR #86 с responsive CSS уже влит в `main`; CI для него завершился успешно. Это не подтверждает ручной browser QA или production smoke.

## Нереализованные или не подтверждённые пункты из нормативных документов

### P0 — security / доступность production

1. **Auth contract drift** — security audit сообщает, что frontend вызывает `POST /auth/login`, тогда как backend на проверенной версии содержит `GET /auth/me`, а legacy login/unlock endpoints отсутствуют. Это потенциальный блокер входа. Нужна отдельная сверка фактического backend и API Gateway с OpenAPI; нельзя маскировать локальным auth fallback.
2. **Scope authorization gaps** — security audit перечисляет проверки доступа для P&L write/approval, ingest confirm, memory и scope-bound mutations. Требует backend-тестов на доступ между ресторанами/подразделениями.
3. **Organization control-plane permissions** — роли и проверки для org units, messenger settings и bindings требуют отдельной серверной работы.
4. **Небезопасный document parsing** — аудит отмечает `xlsx@0.18.5` и отсутствие общего decompression budget для ZIP/DOCX. Нужны обновление parser, совместимость импорта и ограничение распаковки; менять это без backend-тестов опасно.
5. **AI/webhook boundary** — system prompt должен оставаться server-owned; unauthenticated `/api/ingest/message` нуждается в подписи провайдера/replay protection/rate limit/cost controls.
6. **Memory/tool scope** — требуется явное решение для organization-wide vs scope-bound semantics и authoritative scope checks.
7. **Release proof** — документы требуют проверок Gateway `/healthz`, auth, P&L readback, YandexGPT, document pipeline и Secretary CRUD. По репозиторию это нельзя считать подтверждённым production smoke.

### P1 — продуктовые возможности

1. **Secretary как полноценный task-management** — recurring tasks, ответственность, audit/history и полный цикл задач остаются roadmap из `FULL_AUDIT_2026-09-24.md`; спецификация Secretary также требует timezone, idempotency и реальные calendar/booking endpoints.
2. **Нормализованный XLSX export из STEN** — pipeline spec описывает создание отдельного XLSX с provenance (исходный файл, лист/страница, warnings), но завершённость пользовательского workflow не подтверждена.
3. **Расширенное бюджетирование** — годовые сценарии/forecast и сценарии исполнения отмечены как дальнейший уровень в полном аудите.
4. **End-to-end document formats** — PDF/DOCX/images требуют реального OCR/parsing на сервере; расширение file picker не считается поддержкой.
5. **Полная UI QA** — desktop/tablet/mobile, keyboard/focus, reduced motion, light/dark/system, empty/error/loading и отсутствие clipping должны быть проверены в браузере на целевых ширинах. CI не заменяет browser QA.

### P2 — maintenance / docs

1. **Source-of-truth drift** — `DOCS_SOURCE_OF_TRUTH_AUDIT_2026-10-06.md` сам помечает как stale/review: API gateway spec, backend env contract, deployment current, scope contract, master spec, release gate и readiness checklist. Нужна отдельная последовательность PR: contracts → deployment/release → guides.
2. **User guides конфликтуют по auth** — handoff/user guides содержат legacy PIN/unlock сведения, в то время как master spec описывает email/password target и security audit сообщает о mismatch. Не обновлять пользовательские инструкции, пока фактический production auth contract не подтверждён.
3. **Dependency baseline** — security audit отмечает jsPDF 2.5.2 и xlsx 0.18.5. Обновлять с compatibility tests, не слепо.
4. **Historical secret scan** — полный скан всех blobs Git history не подтверждён; current-tree scan не доказывает чистоту истории.
5. **Operational configuration** — production ENV/Lockbox, bucket access policy, DB/RLS, TLS, gateway protections, quotas и external MarkItDown не проверены из репозитория.

## Что намеренно не менялось

- `backend/**`, OpenAPI/API Gateway, database migrations, Cloud Functions, Yandex Cloud resources, secrets/Lockbox и production data.
- Auth UI/API: противоречивые контракты требуют проверки runtime до выбора правильного решения.
- `xlsx` / `jspdf` dependencies: нужен отдельный совместимый dependency/security PR и полные тесты.
- Production deployment: ветка аудита не должна автоматически выкладывать непроверенные изменения в production.

## Рекомендуемый порядок следующих PR

1. **auth-contract-reconciliation** — runtime + Gateway + OpenAPI + frontend auth flow; добавить интеграционные тесты.
2. **scope-authorization-hardening** — server-side scope gate для всех sensitive reads/writes, включая memory/Secretary/bindings.
3. **document-parser-hardening** — обновить XLSX parser, decompression budgets, malformed-file tests, resource limits.
4. **ai-webhook-hardening** — server-owned policy, signed ingest, replay protection, distributed rate/cost controls.
5. **secret-and-dependency-baseline** — jsPDF/XLSX compatibility, npm audit, full-history secret scan.
6. **secretary-and-export-workflows** — только после подтверждения доступных backend endpoints.
7. **production-smoke-and-docs-sync** — исправлять документы по фактическому runtime, не наоборот.

## Проверки этой ветки

- [ ] CI typecheck/lint/tests/build
- [ ] Проверить Vite dev startup и что LAN bind не включён по умолчанию
- [ ] Проверить deploy workflow только после успешного CI
- [ ] Production smoke — отдельная ручная проверка, не заявляется этой веткой

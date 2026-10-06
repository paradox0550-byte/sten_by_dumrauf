---
owner: paradox0550-byte
status: actual
last_reviewed: 2026-10-06
version: 1.0
---

# STEN — аудит документации и Source of Truth

Дата аудита: 2026-10-06

## Правило

Не обновляем docs «в лоб». Сначала фиксируем нормативный источник, сверяем его с кодом/main и только затем меняем текст.

## Приоритет 0 — критично

| Файл | Статус | Почему |
|---|---|---|
| `API_GATEWAY_SPEC_2026-09-29.yaml` | **STALE** | Содержит legacy `/auth/unlock`, тогда как активный auth-контур переведён на email/password; также содержит историческую версию backend в описании. |
| `BACKEND_ENV_CONTRACT.md` | **REVIEW** | Принцип secret isolation соответствует текущему контуру, но список переменных нужно сверить с фактическим `backend/index.js` и deploy workflow. |
| `DEPLOYMENT_CURRENT.md` | **STALE** | Содержит legacy PIN/auth формулировки и не отражает subscription-expiry Timer и последние security/deploy изменения. |
| `SCOPE_CONTRACT.md` | **REVIEW / near-current** | Основная модель scope соответствует текущему контуру, но acceptance/backend capability statements нужно сверить с фактическими endpoint'ами main. |
| `STEN_MASTER_SPEC.md` | **STALE** | Одновременно упоминает email/password и legacy PIN/`auth/unlock`; это конфликтующий source of truth. |
| `PRODUCTION_RELEASE_GATE.md` | **REVIEW** | Gate полезен как нормативный документ, но содержит устаревшее обозначение Gateway и должен быть сверён с текущими CI/deploy workflows. |
| `PRODUCTION_READINESS_15_STEPS.md` | **REVIEW / near-current** | Структура актуальна, но документ нужно синхронизировать с закрытыми security/auth/document-pipeline изменениями и текущим release gate. |

## Приоритет 1 — важно

| Файл | Статус | Действие |
|---|---|---|
| `OPERATING_MODEL.md` | **CURRENT** | Сохранять как operating contract; менять только при изменении scope-модели. |
| `PNL_MANUAL_ENTRY_CONTRACT.md` | **CURRENT / VERIFY** | Проверить endpoint/readback детали против backend. |
| `PNL_WORKSPACE_SPEC.md` | **CURRENT / VERIFY** | Основная модель P&L актуальна; сверить только реализованные capabilities. |
| `SECRETARY_REFERRER_SPEC.md` | **CURRENT AS TARGET** | Это target contract, а не доказательство текущей реализации. |
| `STEN_DOCUMENT_PIPELINE.md` | **CURRENT AS CONTRACT** | Контракт analysis vs storage актуален; runtime детали MarkItDown должны оставаться в runtime contract. |

## Приоритет 2 — guides

- `USER_GUIDE.md`
- `STEN_USER_GUIDE.md`
- `STEN_PRODUCTION.md`
- `STEN_HANDOFF.md`

Проверять после нормативных контрактов. Guide не должен определять архитектуру, API или security policy.

## Найденные системные расхождения

### Legacy auth

CI уже отдельно запрещает `/auth/login` в OpenAPI, но OpenAPI всё ещё содержит `/auth/unlock`. Значит документация и runtime transition находятся в разных состояниях.

Сначала фиксируем active auth contract, затем удаляем legacy endpoint из OpenAPI и только после этого синхронизируем master/deployment docs.

### Deployment runtime

После subscription management backend получает:
- `organizations.subscription_until DATE`;
- `PATCH /api/admin/organizations/:id`;
- ежедневный TimerMessage expiry sweep;
- `active → suspended` при истёкшем сроке.

Эти детали добавляем в `DEPLOYMENT_CURRENT.md` после merge PR #41, а не заранее.

### Реализовано vs требуется

Используем четыре статуса:
- **Implemented** — подтверждено кодом/main;
- **Contract** — обязательное требование;
- **Pending verification** — заявлено, но runtime не подтверждён;
- **Deprecated** — legacy, не использовать.

Наличие пункта в spec само по себе не означает production-ready.

## Source of Truth hierarchy

1. Runtime/backend code + DB schema/migrations — фактическая реализация.
2. CI/deploy workflows — фактический release mechanism.
3. OpenAPI — API contract, обязан совпадать с runtime.
4. `SCOPE_CONTRACT.md` — нормативный scope contract.
5. `STEN_MASTER_SPEC.md` — продуктовый master spec, но не замена runtime evidence.
6. Deployment/readiness docs — operational/release documentation.
7. User guides — пользовательская документация.

При конфликте документ не «чинит» код молча. Сначала определяется правильный runtime/source of truth.

## Следующий порядок PR

1. **contracts** — OpenAPI + backend env + scope + master spec.
2. **deployment/release** — deployment current + release gate + readiness.
3. **guides** — user/production/handoff.
4. Только после этого — archive/deprecate старых документов.

Не объединять эти этапы в один большой docs-коммит.

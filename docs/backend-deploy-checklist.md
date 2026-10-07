# Backend Deploy Checklist

## Перед публикацией

- [ ] Снапшот Managed PostgreSQL сделан
- [ ] Открыта Cloud Function `smenavkarmane-api`
- [ ] Раздел «Переменные окружения» НЕ открывается
- [ ] `core/tools.js` обновлён
- [ ] `core/skills.js` обновлён
- [ ] `index.js` обновлён
- [ ] `core/memory.js` НЕ тронут
- [ ] `core/policy.js` НЕ тронут
- [ ] `documentProcessor.js` НЕ тронут
- [ ] `markitdownClient.js` НЕ тронут
- [ ] `package.json` НЕ тронут
- [ ] Триггеры НЕ тронуты

## Публикация

- [ ] Нажал Опубликовать
- [ ] Дождался Active

## Smoke tests

- [ ] Smoke test 1 (healthz) — PASS
- [ ] Smoke test 2 (ask привет) — PASS
- [ ] Smoke test 3 (find_deviations) — PASS
- [ ] Smoke test 4 (что не так) — PASS
- [ ] Smoke test 5 (существующие endpoints) — PASS
- [ ] Логи без `schema attempt failed`

> Важно: актуальный `main` возвращает `version: 5.0.2` из `/healthz`. Это docs-only deploy bundle; backend-код и переменные окружения в PR не изменяются.

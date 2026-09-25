# STEN — инженерные правила проекта

main — единственная ветка-истина. Репозиторий содержит frontend, production backend и документацию контрактов. PostgreSQL и runtime-сервисы работают в Yandex Cloud.

## Продукт
СТЕН — личный рабочий инструмент управляющего рестораном. Главный экран — диалог STEN. Остальные разделы: P&L, импорт, финансы, экономика, бюджет, настройки.

## Данные
- Только реальные данные.
- Никаких mock/demo/random KPI в production-flow.
- Отсутствие данных никогда не превращается в ноль.
- Финансовые расчёты опираются на backend/calculation core.
- Новые функции разрешены только если они реально связаны с существующими данными, API и UI; заглушки и «для вида» не создавать.
- Перед новой функцией проверить, не разрушает ли она каноническую концепцию продукта.

## AI
Единственный production AI — YandexGPT через Yandex Cloud AI Studio. Ollama/Qwen не являются частью продукта и не должны возвращаться.
Браузер никогда не обращается к AI напрямую. Frontend вызывает API Gateway /ask; backend обращается к Yandex AI Studio.
AI credentials, API keys, folder IDs и model URI не попадают во frontend.
STEN использует документы, историю и результаты инструментов; факты и финансовые значения не выдумываются.
Backend должен использовать актуальный YandexGPT model URI, например `gpt://<folder_id>/yandexgpt/latest`, либо явно заданную актуальную модель. Секреты хранить вне репозитория, предпочтительно через Yandex Cloud secrets/Lockbox.

## Auth
Единственный пользовательский UX: персональная разблокировка /auth/unlock. Email, login, password и регистрация не являются частью интерфейса.
Аутентификация только серверная: unlock обязан получить действительный JWT от API Gateway. При отсутствии сети или недоступности API пользователь не считается аутентифицированным. Никакого offline-auth, synthetic user или локального обхода авторизации.

## UI
Светлая, системная и тёмная тема. Спокойный premium B2B/fintech стиль: много воздуха, строгая типографика, табличные цифры, без glassmorphism/aurora/градиентного визуального шума.
Каждое модальное окно имеет явный X и закрывается по Escape/клику вне окна, если это безопасно.

## API
Канонический frontend API: https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net
Frontend работает только через src/lib/api.ts или src/lib/backend.ts.
AI endpoint не вызывается из компонентов.

## Инженерный цикл
1. Прочитать текущий main и проектную память.
2. Проверить концепцию, зависимости, импорты, routes, API и реальные данные.
3. Для новой функции определить источник данных, контракт, состояние, UI и обратный путь сохранения/обновления.
4. Не создавать заглушки. Если backend-контракт отсутствует, сначала зафиксировать и реализовать реальный контракт на соответствующем backend-слое, а не имитировать его во frontend.
5. Исправлять первопричину, а не симптом.
6. npm run typecheck.
7. npm run build.
8. Проверить dist, routes, MIME и smoke-сценарии.
9. После CI не объявлять production готовым без фактического успешного run.
10. При падении сначала получить реальную ошибку, затем исправлять причину.

## Запрещено
- возвращать Ollama, Qwen или локальный AI runtime;
- добавлять fake data/mock/demo screens ради визуала;
- коммитить secrets;
- обращаться к AI напрямую из браузера;
- менять продуктовую концепцию без проверки всей связки;
- угадывать причину CI/deploy ошибки;
- создавать новую функцию без полного рабочего пути: UI → API → backend → данные → ответ → UI.

## Definition of Done
Typecheck PASS + build PASS + статический smoke PASS + routes без 404 + персональный unlock + темы + реальные API-контракты + реальные данные + YandexGPT integration path + отсутствие demo/mock production screens.
## Skills
Перед изменением выбирай применимые playbooks из `.github/agent/skills/`: ui-visual, root-cause, api-contract, finance-integrity, sten-yandexgpt, security-secrets, deploy-smoke, mobile-ux. Для комплексного изменения используй несколько skill-проходов, а не один общий чек-лист.

## Secret boundary
Следующие классы конфигурации существуют только во внешнем backend/CI secret store: AWS access credentials, JWT secret, DB password, YandexGPT API key, unlock secret. DB_USER, DB_NAME, DB_HOST, bucket, folder ID и endpoint — конфигурационные значения; их наличие в backend configuration не означает, что их можно переносить во frontend. Никогда не копировать реальные значения секретов в Git, Vite env или dist.

## Learning loop
После каждого аудита фиксировать новую подтверждённую причину/решение в PROJECT_MEMORY.md или соответствующем skill. Не запоминать догадки как факты. Повторный дефект должен ссылаться на предыдущую проверку и объяснять, почему новый fix не повторяет старую ошибку.


## Secretary (Секретарь-референт)
Полный контракт и production gate: docs/SECRETARY_REFERRER_SPEC.md.
Секретарь — детерминированный операционный сервис, не GPT-чат и не второй STEN; YandexGPT в секретаре не используется.
UI секретаря не создаётся и не содержит событий до реальных backend endpoints calendar/events/reminders/booking с идемпотентностью, timezone, audit log и интеграционным контрактом. Фиктивных (демо) событий в UI быть не может.

## Contract documentation index
- Секретарь-референт: docs/SECRETARY_REFERRER_SPEC.md
- Рабочая таблица P&L (missing != zero, агрегация сырых сумм, provenance): docs/PNL_WORKSPACE_SPEC.md
- P&L ручной ввод / save-readback: docs/PNL_MANUAL_ENTRY_CONTRACT.md
- Scope Project/Branch/Restaurant/Department: docs/SCOPE_CONTRACT.md

## Operating director domain rules
- Treat project/branch/restaurant/department as explicit scope, never implicit global state.
- Branches aggregate only assigned children; standalone units outside a branch are not cross-compared.
- Use the same scope and period across Dashboard, P&L, Finances, Budget, Analytics and STEN.
- Finance calculations are deterministic and provenance-aware; missing is not zero.
- STEN document intelligence is analysis-first: extraction may be temporary; permanent storage requires an explicit user decision.
- Images require real OCR/vision processing; DOCX requires real parsing; normalized XLSX must be a real downloadable artifact with provenance.
- Never add UI that implies an unavailable backend capability is already production-connected.

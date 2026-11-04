# API Gateway qww — ручной импорт и проверка

## Ресурс

- Name: `qww`
- Gateway ID: `d5d5p4eof6ra03bsva7a`
- Domain: `https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net`
- Timeout: 90 seconds
- VPC: `enpaq62r01cae432n3b4`
- Explicit service account: отсутствует по предоставленному инвентарю

## Источник спецификации

Единственный кандидатный файл в репозитории: корневой `api-gateway.yaml`.

Не использовать устаревшие копии спецификации. Сверять YAML с тем же commit, из которого собран Backend ZIP.

В текущей ветке кандидатная версия Gateway spec — 5.4.1, Backend package version — 5.4.1. В предоставленных оператором данных активная спецификация qww была 5.4.2. Это разные версии; импорт — осознанное обновление конфигурации, не рутинная синхронизация.

## Маршруты в кандидатной спецификации

| Path | Назначение | Function ID | Tag |
|---|---|---|---|
| `/healthz` GET | Backend liveness | `d4epijnhj7h9sd5ppa66` | `$latest` |
| `/api/integrations/google/sheets` PUT | Google Sheets connection | `d4epijnhj7h9sd5ppa66` | `$latest` |
| `/markitdown/{proxy+}` | отдельный converter | `d4e4ai8895c3kq3b0ds5` | `$latest` |
| `/{proxy+}` | остальные Backend API paths | `d4epijnhj7h9sd5ppa66` | `$latest` |

Dedicated route MarkItDown должен располагаться выше catch-all `/{proxy+}`.

## Перед импортом

Активная spec, по данным оператора, содержит явно перечисленные API paths и global `bearerAuth` с исключениями `security: []` для публичных endpoints. Кандидатный `api-gateway.yaml` использует proxy paths и не повторяет все эти явные OpenAPI security declarations.

Поэтому **не импортировать кандидатный YAML поверх активного Gateway вслепую**. До импорта:

1. Сохранить экспорт/копию активной спецификации qww.
2. Сопоставить все активные paths + HTTP methods с `api-spec.yaml` и backend routes.
3. Сопоставить публичные endpoints, webhook endpoints и JWT enforcement.
4. Подтвердить, что Backend выполняет необходимую auth/authorization проверку самостоятельно для каждого защищённого маршрута.
5. Убедиться, что wildcard integration передаёт исходный path и HTTP method в Cloud Function так, как ожидает `serverless-http`.
6. Подтвердить IAM invocation identity Gateway для обеих функций.
7. Только после этого импортировать candidate spec в согласованное окно работ.

## После импорта

- [ ] Gateway остаётся ACTIVE.
- [ ] `/healthz` идёт в Backend function.
- [ ] обычные Backend API paths идут в Backend function.
- [ ] `/markitdown/convert` идёт в отдельную converter function.
- [ ] запрос на MarkItDown не попадает в Backend catch-all.
- [ ] публичные webhooks доступны только в соответствии с утверждённой схемой.
- [ ] защищённые API требуют корректную JWT авторизацию.
- [ ] CORS preflight работает для разрешённых frontend origins.
- [ ] неизвестный route не раскрывает внутренние ошибки/stack traces.

## Откат

До импорта сохранить текущую спецификацию и параметры Gateway. При неуспешных smoke tests вернуть предыдущую spec и проверить, что traffic вернулся к предыдущему контракту. Не удалять предыдущие Function versions.

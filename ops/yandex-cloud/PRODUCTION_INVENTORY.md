# STEN — фактический инвентарь Yandex Cloud

Дата сведений: 2026-11-04. Источник: данные, вручную полученные оператором из Yandex Cloud Console/API. Этот файл фиксирует предоставленные сведения, а не выполняет независимый live-запрос к облаку.

## 1. Рабочая Cloud Function

| Параметр | Значение |
|---|---|
| Имя | `smenavkarmane-api` |
| Function ID | `d4epijnhj7h9sd5ppa66` |
| Статус | ACTIVE |
| Активная версия | `d4ejrc3ko6koqo1l6dup` |
| Тег | `$latest` |
| Runtime | `nodejs22` |
| Entrypoint | `index.handler` |
| Память | 1 GB |
| Timeout | 90 секунд |
| Runtime service account | `ajeoat76avsvv6jtmjar` |
| Description | пустое |
| Commit SHA / artifact hash | API не возвращает; происхождение версии не установлено |
| Lockbox secrets | пустой список `[]` |

Активная версия существует и работает, но нельзя утверждать, что её содержимое соответствует конкретному commit или Backend 5.4.1/5.4.2. Для новой версии использовать ZIP и manifest из GitHub Actions; commit SHA и SHA-256 сохранять в описании/журнале ручного релиза.

## 2. API Gateway

| Параметр | Значение |
|---|---|
| Имя | `qww` |
| Gateway ID | `d5d5p4eof6ra03bsva7a` |
| Статус | ACTIVE |
| Домен | `https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net` |
| Timeout | 90 секунд |
| VPC network | `enpaq62r01cae432n3b4` |
| Subnets | не заданы |
| Service account | явно не указан |
| Активная OpenAPI version | 5.4.2 |

По предоставленному описанию активная спецификация 5.4.2 содержит явно перечисленные маршруты, но не содержит `/markitdown/{proxy+}` и `/{proxy+}`. MarkItDown существует отдельно, но Gateway `qww` на неё сейчас не проксирует.

Репозиторий содержит отдельную кандидатную спецификацию `api-gateway.yaml`. Не считать её загруженной в Gateway до ручного импорта и проверки активной спецификации в консоли.

## 3. Единственный рабочий PostgreSQL

| Параметр | Значение |
|---|---|
| Cluster | `postgresql373-1` |
| Cluster ID | `c9qsb64sleqkc6mdooon` |
| Status / health | RUNNING / ALIVE |
| PostgreSQL | 17.11 |
| Database | `smena` |
| Owner | `smena_admin` |
| Master host | `rc1d-o7otnrhll0f93ja5.mdb.yandexcloud.net` |
| Port | 6432 (pooler endpoint, согласно настройкам оператора) |
| Public IP | отсутствует |
| VPC network | `enpaq62r01cae432n3b4` |
| Subnet | `fl8llbee6rlpejiet8jl` |
| Security Group | `enpgeh23ihde161bolad` |
| Connection Manager | включён |
| `access.serverless` | false |
| Deletion protection | выключена |
| TLS | обязательный проверяемый TLS; целевой режим `verify-full` |

Кластер находится в той же VPC-сети, что и Gateway. Это само по себе не доказывает сетевую достижимость из Cloud Function. Нужно проверить VPC/subnet/security-group самой функции и выполнить фактический read-only тест подключения из её runtime.

В коде Backend TLS настраивается через CA-файл `/usr/local/share/ca-certificates/yandex-internal-ca.crt` с `rejectUnauthorized: true`. Не отключать проверку сертификата.

## 4. Целевая база данных

Единственная целевая БД для Backend — `smena` в кластере `postgresql373-1`.

## 5. IAM и публичный вызов

По предоставленным данным на ресурсе Cloud Function назначено:
- `functions.functionInvoker` для `allUsers`;
- `functions.functionInvoker` для service account `ajeoat76avsvv6jtmjar`.

Gateway не показывает явно заданный `service_account_id`. Runtime service account функции и вызывающая identity Gateway — разные роли; наличие роли у runtime SA не доказывает, что Gateway вызывает функцию от его имени.

Не удалять `allUsers`, пока не установлена фактическая identity Gateway и не проверен вызов через Gateway. Публичность function endpoint — отдельная поверхность атаки; после определения схемы вызова подготовить минимально необходимые права.

## 6. Секреты и environment

У активной версии `secrets=[]`; секреты, по данным оператора, находятся в открытых переменных `environment`.

План переноса описан в `LOCKBOX_MIGRATION.md`. Значения секретов в этот репозиторий не записываются.

## 7. MarkItDown

- Отдельная Cloud Function ID: `d4e4ai8895c3kq3b0ds5`.
- Активная спецификация Gateway `qww` не содержит dedicated route.
- В списке environment активной версии Backend нет `MARKITDOWN_URL`.
- Backend читает `MARKITDOWN_URL`, `MARKITDOWN_ENABLED`, `MARKITDOWN_TOKEN`, `MARKITDOWN_TIMEOUT_MS`.

До включения интеграции необходимо определить корректный URL функции-конвертера, решить, должен ли трафик идти через Gateway или напрямую, обеспечить проверку авторизации и протестировать маршрут. Не придумывать URL и не включать `MARKITDOWN_ENABLED=true` до этого.

## 8. Различие версий

- Ветка-кандидат PR #248: Backend package/header 5.4.1.
- Предоставленная активная спецификация Gateway: 5.4.2.
- Активная Cloud Function не содержит доказуемой привязки к commit SHA.
- Версия 5.4.2 в Gateway не доказывает, что функция также собрана из Backend 5.4.2.

До ручного релиза выбрать одну согласованную пару Backend + Gateway spec и зафиксировать её commit SHA. Не смешивать артефакты разных веток.

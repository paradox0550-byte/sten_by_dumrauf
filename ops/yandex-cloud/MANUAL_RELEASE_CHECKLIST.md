# STEN — ручной релиз: чек-лист оператора

Релиз выполняется вручную в Yandex Cloud Console. GitHub готовит исходники, ZIP и инструкции; автоматического деплоя нет.

## Этап 0. Зафиксировать кандидата

- [ ] Выбрать проверенную ветку и PR.
- [ ] Убедиться, что CI зелёный именно на HEAD commit выбранной ветки.
- [ ] Запустить GitHub Actions **Package Yandex Cloud Backend (manual)** на том же commit.
- [ ] Скачать `sten-yandex-backend`.
- [ ] Сверить commit SHA из `release-manifest.txt` с выбранным commit.
- [ ] Проверить SHA-256 архива.
- [ ] Убедиться, что ZIP содержит в корне `index.js`, `package.json`, `package-lock.json`, runtime JS modules.
- [ ] Убедиться, что ZIP не содержит `backend/markitdown/`, секретов, локальных .env и `node_modules`.

## Этап 1. Подготовить новую версию функции

Целевая функция: `smenavkarmane-api` / `d4epijnhj7h9sd5ppa66`.

Сохранить текущие настройки, не изменяя действующую версию:
- runtime `nodejs22`;
- entrypoint `index.handler`;
- memory 1 GB;
- timeout 90 seconds;
- runtime service account — текущий, если не принято отдельное решение;
- connectivity — после проверки VPC/SG с PostgreSQL.

- [ ] Создать новую версию функции из ZIP.
- [ ] Не присваивать ей production tag до прохождения проверок.
- [ ] Сохранить version ID и commit SHA в журнале релиза/description.
- [ ] Проверить, что новая версия запускается без ошибок.
- [ ] Проверить отсутствие опасных fallback для JWT и CORS: Backend откажется стартовать в production без корректных `JWT_SECRET` и `ALLOWED_ORIGINS`.

## Этап 2. Environment и Lockbox

- [ ] Сверить настройки с `FUNCTION_ENVIRONMENT.md`.
- [ ] Создать и привязать Lockbox secrets согласно `LOCKBOX_MIGRATION.md`.
- [ ] Проверить доступ runtime service account к каждой конкретной версии секрета.
- [ ] Сохранить действующий `IIKO_CREDENTIALS_ENCRYPTION_KEY`, если он используется.
- [ ] Убедиться, что `ADMIN_BOOTSTRAP_FORCE=false`.
- [ ] Убедиться, что MarkItDown выключен до настройки маршрута.
- [ ] Убедиться, что в production не задано `DB_SSL_MODE=disable`.
- [ ] Не удалять открытые значения в старой версии до успешного старта новой.

## Этап 3. PostgreSQL

- [ ] Подключение направлено только на `postgresql373-1`.
- [ ] Проверены VPC, subnet и Security Group функции.
- [ ] Проверен ingress на PostgreSQL port 6432.
- [ ] Выполнены DNS/TCP/TLS проверки из runtime.
- [ ] TLS использует Yandex CA и hostname verification.
- [ ] Выполнен только read-only запрос `SELECT 1`.
- [ ] Не запускались миграции и DDL.

## Этап 4. API Gateway

Файл источника: корневой `api-gateway.yaml` из того же commit, что и Backend ZIP.

- [ ] Сверить версию OpenAPI и Backend package version.
- [ ] Сверить все function IDs.
- [ ] Проверить `/healthz` → Backend function.
- [ ] Проверить `/markitdown/{proxy+}` → отдельная MarkItDown function.
- [ ] Проверить `/{proxy+}` → Backend function.
- [ ] Dedicated MarkItDown route расположен раньше catch-all.
- [ ] Проверить security/public routes по фактическому API contract и backend auth.
- [ ] Проверить Gateway invocation identity и права на функции.
- [ ] Не импортировать spec, если она не соответствует выбранной версии Backend.

Важно: предоставленная активная Gateway spec имеет версию 5.4.2 и не содержит двух proxy routes. Репозиторий содержит кандидатную спецификацию. Не заменять активную спецификацию, пока не подтверждены все методы, security requirements и поведение публичных маршрутов.

## Этап 5. Smoke tests

Проверять сначала новую версию напрямую в ограниченном режиме, затем через Gateway. Не отправлять реальные Telegram/WhatsApp сообщения и не выполнять бизнес-записи без отдельного согласования.

- [ ] Liveness endpoint отвечает ожидаемо.
- [ ] Auth: тестовая учётная запись проходит login и `/auth/me`.
- [ ] Unauthorized запросы получают ожидаемый 401/403.
- [ ] DB read-only: `SELECT 1`.
- [ ] P&L read-only endpoint возвращает реальные данные или честное отсутствие данных, не нули вместо отсутствующих значений.
- [ ] Google integration не принимает чужой OAuth audience.
- [ ] Document route не включается, если private object storage недоступен.
- [ ] Telegram webhook signature проверяется; не запускать реальную отправку.
- [ ] MarkItDown не включается, пока его маршрут и token не проверены.
- [ ] CORS preflight для разрешённого frontend origin успешен.
- [ ] Неверный origin не получает разрешающий CORS header.

## Этап 6. Переключение и откат

- [ ] Сохранить текущий active version ID.
- [ ] После согласования переключить Gateway/tag на новую версию.
- [ ] Повторить smoke tests через production Gateway.
- [ ] Мониторить логи функции и ошибки 5xx.
- [ ] При проблеме вернуть Gateway/tag к сохранённой предыдущей версии.
- [ ] Не удалять предыдущую версию до завершения периода наблюдения.

## Стоп-условия

Остановить релиз, если:
- commit SHA артефакта не совпадает с проверенной веткой;
- production JWT secret или CORS origins отсутствуют;
- Lockbox не читается runtime identity;
- PostgreSQL TLS verification не проходит;
- нет подтверждённого сетевого пути к единственному рабочему кластеру;
- Gateway spec не совпадает с Backend contract;
- не установлена invocation identity/не подтверждены права;
- любая проверка требует отключить TLS, включить старый кластер или раскрыть секрет в логах.

## Результат ручного релиза — заполнить оператором

- Git commit SHA:
- Backend ZIP SHA-256:
- Cloud Function new version ID:
- Function tag:
- Gateway imported spec version:
- PostgreSQL read-only check:
- Lockbox bindings verified:
- IAM invocation identity:
- Smoke tests:
- Rollback version ID:
- Date/time and operator:

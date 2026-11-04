# STEN — комплект ручного релиза в Yandex Cloud

Этот каталог — инструкция оператору для ручного переноса подготовленных файлов в Yandex Cloud Console. Он не выполняет деплой и не меняет облачные ресурсы.

## Область работ

- Единственный рабочий PostgreSQL: кластер `postgresql373-1`, ID `c9qsb64sleqkc6mdooon`.
- Backend-кандидат: исходники ветки, из которой собран этот комплект; версия из `backend/package.json` должна совпадать с манифестом артефакта.
- Cloud Function: `smenavkarmane-api`, ID `d4epijnhj7h9sd5ppa66`, runtime Node.js 22, entrypoint `index.handler`.
- API Gateway: `qww`, ID `d5d5p4eof6ra03bsva7a`.
- MarkItDown — отдельная функция `d4e4ai8895c3kq3b0ds5`; её Python-код не входит в архив Node.js Backend.

## Файлы комплекта

| Файл | Назначение |
|---|---|
| `PRODUCTION_INVENTORY.md` | Зафиксированные оператором факты Yandex Cloud и открытые вопросы |
| `FUNCTION_ENVIRONMENT.md` | Перечень переменных Backend и безопасная схема заполнения |
| `LOCKBOX_MIGRATION.md` | План переноса секретов из environment в Lockbox без потери ключей |
| `POSTGRESQL_NETWORK_IAM.md` | Рабочая БД, TLS, VPC, Security Group и IAM |
| `MANUAL_RELEASE_CHECKLIST.md` | Пошаговый порядок ручной публикации и отката |
| `GATEWAY_IMPORT.md` | Сверка и ручной импорт OpenAPI в Gateway без потери security-модели |
| `MARKITDOWN_DEPLOYMENT.md` | Отдельная публикация Python-конвертера и подключение через Gateway |
| `.github/workflows/package-yandex-backend.yml` | Ручная сборка двух ZIP: Node.js Backend и отдельной Python-функции MarkItDown |

## Получение ZIP Backend

1. Открой GitHub → Actions → **Package Yandex Cloud Backend (manual)**.
2. Нажми **Run workflow** на проверенной ветке этого комплекта.
3. Дождись успешного завершения всех шагов.
4. Скачай artifact `sten-yandex-backend`.
5. Внутри будут два ZIP — Node.js Backend и Python MarkItDown — плюс `release-manifest.txt` и SHA-256 для каждого архива.
6. Перед загрузкой в Yandex Cloud сравни commit SHA из манифеста с проверенной веткой/PR.

Node.js ZIP устроен так, что `index.js`, `package.json` и `package-lock.json` находятся в корне архива. Python-конвертер собирается отдельным ZIP: `function.py` и `requirements.txt` находятся в его корне.

## Важные запреты

- Не загружать секреты, пароли, токены, ключи шифрования или содержимое Lockbox в GitHub.
- Не изменять текущую активную версию функции до создания и проверки новой версии.
- Не удалять предыдущую версию функции.
- Не переключать Gateway на новую версию до завершения smoke-проверок новой функции.
- Не менять IAM-публичность `allUsers` без проверки фактической схемы вызова Gateway.
- Не отключать TLS и проверку сертификата PostgreSQL.
- Не включать MarkItDown до публикации отдельной функции и проверки её маршрута.
- Не запускать миграции, очистку таблиц, bootstrap администратора или запись в БД в рамках диагностики.

## Текущий статус

Этот комплект подготавливает ручную публикацию, но не является подтверждением готовности production. Активная версия функции пока не имеет подтверждённого commit SHA; активная спецификация Gateway отличается от репозитория; Lockbox не подключён; фактическое соединение с PostgreSQL из Cloud Function ещё не проверено.

Все значения, отмеченные как **уточнить в консоли**, необходимо проверить до переключения production-трафика.

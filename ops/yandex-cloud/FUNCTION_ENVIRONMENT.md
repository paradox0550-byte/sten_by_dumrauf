# Cloud Function — environment contract

Источник истины по переменным, читаемым Backend: `docs/BACKEND_ENV_CONTRACT.md` и фактический код `backend/`. Этот документ предназначен для ручного переноса настроек в Yandex Cloud Console.

## Правила

1. Не копировать секретные значения в GitHub, issue, PR, workflow output или чат.
2. Для секретов использовать Lockbox и привязку секрета к переменной окружения Cloud Function.
3. Не создавать переменные только потому, что они присутствуют в старом окружении: часть из них больше не читается кодом.
4. Не удалять неизвестную переменную из активной версии, пока не подтверждено, что она не нужна другим runtime-компонентам.
5. Не включать feature-флаги интеграций до настройки соответствующей интеграции.

## Базовые production variables

| Переменная | Тип | Настройка |
|---|---|---|
| `NODE_ENV` | config | `production` |
| `ALLOWED_ORIGINS` | config | точные origin фронтенда через запятую; без wildcard |
| `JWT_SECRET` | Lockbox secret | сохранить существующий ключ либо выполнить отдельно согласованную ротацию |
| `DB_HOST` | config | `rc1d-o7otnrhll0f93ja5.mdb.yandexcloud.net` |
| `DB_PORT` | config | `6432` |
| `DB_NAME` | config | `smena` |
| `DB_USER` | config | текущая подтверждённая роль БД; не угадывать |
| `DB_PASSWORD` | Lockbox secret | текущий пароль роли БД |
| `DB_POOL_MAX` | config | `2` как консервативный начальный лимит |
| `DB_IDLE_TIMEOUT_MS` | config | `30000` |
| `DB_SSL_MODE` | config | `verify-full`; Backend в любом случае включает проверку CA и запрещает disable в production |
| `YC_FOLDER_ID` | config | folder ID используемого Yandex Cloud |
| `YANDEXGPT_API_KEY` | Lockbox secret | действующий API key |
| `OBJECT_STORAGE_BUCKET` | config | имя приватного data bucket; не публичный bucket фронтенда |
| `OBJECT_STORAGE_ENDPOINT` | config | оставить пустым для default, если используется стандартный Yandex Object Storage endpoint |
| `OBJECT_STORAGE_REGION` | config | `ru-central1` |
| `AWS_ACCESS_KEY_ID` | Lockbox secret | ключ приватного data bucket, если используются статические S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | Lockbox secret | secret key приватного data bucket, если используются статические S3 credentials |
| `GOOGLE_CLIENT_ID` | config | должен совпадать с `VITE_GOOGLE_CLIENT_ID` фронтенда |

**Важно:** точный пользователь БД, folder ID, origin фронтенда и имя приватного data bucket должны быть взяты из действующей конфигурации. Этот файл не подставляет догадки.

## Feature-specific variables

Настраивать только если функция реально используется:

| Переменная | Тип | Условие |
|---|---|---|
| `ADMIN_BOOTSTRAP_PASSWORD` | Lockbox secret | только временный bootstrap; после проверки учётной записи удалить |
| `ADMIN_BOOTSTRAP_FORCE` | config | `false`; не запускать принудительный bootstrap на production |
| `IIKO_CREDENTIALS_ENCRYPTION_KEY` | Lockbox secret | сохранить точное существующее значение, если в БД есть зашифрованные iiko credentials; не ротировать без миграции |
| `MARKITDOWN_URL` | config | только после проверки отдельной функции и маршрута |
| `MARKITDOWN_TOKEN` | Lockbox secret | если включена token authentication |
| `MARKITDOWN_ENABLED` | config | `false`, пока интеграция не прошла тест |
| `MARKITDOWN_TIMEOUT_MS` | config | `60000` |
| `TELEGRAM_BOT_TOKEN` | Lockbox secret | действующий токен основного бота |
| `TELEGRAM_MONITOR_BOT_TOKEN` | Lockbox secret | только если используется отдельный бот мониторинга |
| `TELEGRAM_WEBHOOK_SECRET` | Lockbox secret | секрет webhook; не путать с неиспользуемым `TELEGRAM_MONITOR_SECRET` |
| `WHATSAPP_APP_SECRET` | Lockbox secret | только если включён inbound webhook |
| `WHATSAPP_ACCESS_TOKEN` | Lockbox secret | только если включена отправка |
| `WHATSAPP_API_VERSION` | config | только при активной интеграции |
| `WHATSAPP_PHONE_NUMBER_ID` | config | только при активной интеграции |
| `WHATSAPP_VERIFY_TOKEN` | Lockbox secret | только при активном webhook |
| `VISION_OCR_URL` | config | оставить default, если используется Yandex Vision OCR |
| `YANDEXGPT_BASE_URL` | config | оставить default, если используется штатный Yandex endpoint |
| `YANDEXGPT_TIMEOUT_MS` | config | `60000` |
| `YANDEXGPT_MODEL` | config | оставить согласованную модель |
| `YANDEXGPT_MAX_TOKENS` | config | оставить согласованное значение |
| `YANDEXGPT_TEMPERATURE` | config | оставить согласованное значение |
| `TOOL_MAX_ITERATIONS` | config | `8` по умолчанию |
| `PNL_APPROVER_ROLES` | config | только при необходимости отдельного списка ролей |
| `DEBUG` | config | `0` или unset в production |
| `DEFAULT_ORG_ID` | config | только подтверждённый UUID организации, если нужен legacy default |

## Переменные активного окружения, требующие очистки после проверки

В предоставленном списке есть переменные, которые Backend 5.4.1 не использует или не использует в текущем сценарии:

- `API`
- `ASK_RATE_LIMIT`
- `ASK_RATE_WINDOW_SEC`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `NETWORK_ID`
- `TELEGRAM_MONITOR_SECRET`
- `UNLOCK_CODE_HASH`
- `MARKITDOWN_AUTH_MODE`

Это кандидаты на удаление из новой версии функции, но не удалять их из действующей версии без проверки потребителей и согласования.

Также в активном списке отсутствуют некоторые переменные, читаемые/поддерживаемые Backend 5.4.1: `MARKITDOWN_URL`, `MARKITDOWN_TOKEN`, `MARKITDOWN_ENABLED`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `TELEGRAM_MONITOR_BOT_TOKEN`, `CORS_ORIGIN`, `TOOL_MAX_ITERATIONS`, `PNL_APPROVER_ROLES`, WhatsApp variables. Часть из них опциональна или имеет default; включать только при необходимости.

## Минимальная проверка перед публикацией

- [ ] Нет секретных значений в GitHub.
- [ ] Все обязательные секреты доступны через Lockbox.
- [ ] JWT secret не пустой и не равен fallback.
- [ ] ALLOWED_ORIGINS содержит точные production origins.
- [ ] DB host/port/database/user сверены с активным кластером.
- [ ] TLS CA доступен в runtime и проверка сертификата включена.
- [ ] Приватный bucket и IAM для него подтверждены.
- [ ] Ключ iiko encryption сохранён без изменения, если ранее шифровались данные.
- [ ] Telegram webhook secret не перепутан с Telegram monitor secret.
- [ ] MarkItDown остаётся выключенным до отдельной проверки.

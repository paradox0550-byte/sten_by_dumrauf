# Перенос секретов Cloud Function в Lockbox

## Исходное состояние

По данным оператора на 2026-11-04, у активной версии Cloud Function `d4ejrc3ko6koqo1l6dup` поле `secrets` пустое, а чувствительные значения находятся в `environment`.

Это подтверждённая проблема хранения секретов. Не публиковать значения в GitHub или передавать их в чат.

## Секреты-кандидаты

Создать в Lockbox отдельные секреты или логические группы по принятой политике организации. Привязать их к соответствующим environment variable names:

| Environment variable | Тип | Особое условие |
|---|---|---|
| `JWT_SECRET` | критичный секрет | сохранить текущий ключ; ротация меняет валидность сессий |
| `DB_PASSWORD` | критичный секрет | пароль активной роли PostgreSQL |
| `YANDEXGPT_API_KEY` | API credential | ключ Yandex AI Studio |
| `AWS_ACCESS_KEY_ID` | credential | если backend использует static S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | credential | если backend использует static S3 credentials |
| `ADMIN_BOOTSTRAP_PASSWORD` | временный секрет | только если bootstrap ещё нужен; затем убрать |
| `TELEGRAM_BOT_TOKEN` | bot token | сохранить webhook/bot continuity |
| `TELEGRAM_MONITOR_BOT_TOKEN` | bot token | только если отдельный monitor bot реально используется |
| `TELEGRAM_WEBHOOK_SECRET` | webhook secret | сохранить точное значение, которым настроен Telegram webhook |
| `MARKITDOWN_TOKEN` | shared secret | только после включения MarkItDown |
| `IIKO_CREDENTIALS_ENCRYPTION_KEY` | encryption key | не менять без подтверждения дешифрования существующих credentials |
| `WHATSAPP_APP_SECRET` | app secret | только если WhatsApp inbound включён |
| `WHATSAPP_ACCESS_TOKEN` | access token | только если WhatsApp outbound включён |
| `WHATSAPP_VERIFY_TOKEN` | webhook token | только если WhatsApp webhook включён |

Перечень условный: перед созданием Lockbox-секретов сверить, какие интеграции реально используются. Не создавать пустые секреты ради заполнения списка.

## Безопасный порядок миграции

1. Зафиксировать текущую активную версию функции и сделать защищённую запись конфигурации без значений секретов.
2. Создать Lockbox secrets. Не переиспользовать секрет, если его назначение или значение неизвестны.
3. Внести текущие значения непосредственно в Yandex Lockbox Console. Не копировать их в GitHub, shell history, PR или CI.
4. Выдать runtime service account `ajeoat76avsvv6jtmjar` только необходимые права на чтение конкретных секретов. Не расширять доступ до всего Lockbox без необходимости.
5. Создать новую версию Cloud Function, привязав Lockbox secret versions к тем же environment variable names.
6. Проверить, что новая версия стартует и получает значения; убедиться, что в обычном environment больше нет дублирующих открытых значений.
7. Выполнить read-only smoke tests: auth health, DB `SELECT 1`, AI health/controlled request, webhook verification без отправки реальных сообщений.
8. Только после успешной проверки переключить тег/шлюз на новую версию по отдельному решению оператора.
9. После подтверждения работоспособности удалить открытые дубликаты из конфигурации следующей версии.
10. Отдельно согласовать ротацию ключей, если есть риск их раскрытия. Миграция хранения и ротация — разные изменения.

## Особые риски

- Изменение `JWT_SECRET` обычно делает старые JWT недействительными и может разлогинить пользователей.
- Изменение `IIKO_CREDENTIALS_ENCRYPTION_KEY` может сделать сохранённые credentials нечитаемыми.
- Изменение Telegram bot token/secret требует согласованной настройки Telegram webhook.
- Изменение DB password требует координации с PostgreSQL.
- Удаление bootstrap password до проверки admin account может лишить возможности первоначальной настройки.
- Lockbox permissions должны быть проверены для runtime service account; роль `lockbox.payloadViewer` уже указана в инвентаре как выданная на service account, но это ещё не подтверждает доступ к конкретному secret resource.

## Откат

Не удалять старую версию Cloud Function и старые секретные значения до завершения проверки новой версии. Если новая версия не стартует, вернуть traffic/tag к предыдущей версии и диагностировать Lockbox permission/version binding. Не выводить секреты в логи при диагностике.

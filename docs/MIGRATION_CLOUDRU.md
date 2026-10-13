## ⚠️ СТАТУС: возврат на Yandex API Gateway

Решение о миграции на Cloud.ru приостановлено. Приоритет — восстановление работы через API Gateway Yandex Cloud.

Причина: конфигурацию Cloud.ru API Gateway и сетевую совместимость с Managed PostgreSQL в Yandex Cloud необходимо отдельно проверить; доступность PostgreSQL из Cloud.ru без подходящего сетевого соединения не предполагается.

Текущее состояние и ручные шаги: см. [docs/GATEWAY_RESTORE.md](GATEWAY_RESTORE.md).

---

# Миграция STEN на Cloud.ru

> Подготовительные файлы добавлены. Ресурсы Cloud.ru не создавались, данные не переносились, frontend не переключался. Yandex Cloud остаётся резервом.

## Целевая архитектура
Frontend (пока Yandex Object Storage) → Cloud.ru API Gateway → Container App sten-backend (Node.js) → Managed PostgreSQL Cloud.ru, Object Storage Cloud.ru (S3), YandexGPT API (внешний сервис) и Container App sten-markitdown (server-to-server).

## Компоненты
| Компонент | Где в Yandex | Куда в Cloud.ru |
|---|---|---|
| Backend | Cloud Function smenavkarmane-api | Container App sten-backend |
| MarkItDown | Cloud Function markitdown | Container App sten-markitdown |
| API Gateway | d5d5p4eof6ra03bsva7a | API Gateway sten-gateway |
| PostgreSQL | STENSQL (проверить endpoint) | Managed PostgreSQL |
| Object Storage | smenavkarmane-business | Cloud.ru Object Storage bucket |
| Frontend | Object Storage | Пока остаётся в Yandex Object Storage |

## Чеклист ручных действий в Cloud.ru

### Подготовка
- [ ] Создать организацию, проект и Artifact Registry.
- [ ] Создать Managed PostgreSQL; записать endpoint, порт, имя БД и пользователя.
- [ ] Проверить сетевой доступ и TLS-настройки.
- [ ] Создать бакет smenavkarmane-business и получить S3 endpoint/ключи.
- [ ] Создать Container Apps sten-backend и sten-markitdown на порту 8080.
- [ ] Собрать образы из backend/Dockerfile и services/markitdown/Dockerfile.
- [ ] Установить переменные из docs/cloudru/env-backend.example и env-markitdown.example через защищённые настройки.
- [ ] Выпустить новый JWT_SECRET и ротировать связанные секреты.
- [ ] Проверить curl https://<backend-host>/healthz и curl https://<markitdown-host>/healthz.

### PostgreSQL
Получить host/port/имя БД из карточки Managed PostgreSQL. Пример DB_PORT=5432 нужно сверить с консолью. Использовать TLS согласно строке подключения и проверить сертификат. ensureSchemaNow() создаёт только часть схемы и не заменяет миграцию данных. Сделать backup источника и вручную запустить scripts/migrate-db.sh с SOURCE_DB_* и TARGET_DB_*. Скрипт не очищает target; перед запуском предпочтительна новая/пустая БД. Сверить строки users, pnl_entries, organizations, ai_memory, индексы, расширения, права и связанные объекты.

### Object Storage
Документация Cloud.ru указывает endpoint https://s3.cloud.ru и регион ru-central-1. Установить rclone и задать YC_ACCESS_KEY, YC_SECRET_KEY, CR_ACCESS_KEY, CR_SECRET_KEY, CR_ENDPOINT и при необходимости BUCKET_NAME. Вручную запустить bash scripts/migrate-storage.sh. Скрипт использует rclone copy: он не удаляет target-only объекты. Сверить количество объектов, объём, чтение/запись и CORS/ACL до переключения.

### API Gateway
- Создать API Gateway sten-gateway.
- В docs/cloudru/api-gateway.yaml заменить TODO_STEN_BACKEND_HOST_FROM_CLOUDRU_CONSOLE и TODO_STEN_MARKITDOWN_HOST_FROM_CLOUDRU_CONSOLE на hostname из консоли.
- Это стартовый шаблон, а не готовая wildcard-конфигурация. После импорта настройте prefix matching для /api/*, /auth/*, /reports/*, /ai/documents/* и /markitdown/*. /ask и /healthz задайте отдельно. Проверьте сохранение пути, query, заголовков и метода.
- Формат сверяйте с https://cloud.ru/docs/api-gateway-svp/ug/topics/concepts__apigw-extensions и https://cloud.ru/docs/api-gateway-svp/ug/topics/tutorials__create_apigw_fromspec.
- Настроить CORS для https://smenavkarmane-business.website.yandexcloud.net и фактических доменов фронтенда.
- Настроить throttling отдельно в консоли: ориентир 100 rps общий и 10 rps для /auth/*, если позволяют политика и тариф.
- Не публиковать MarkItDown наружу без отдельной политики доступа. JWT проверяет backend.
- Для api.sten.ru при необходимости добавить DNS и сертификат.
- Проверить /healthz, авторизованные /ask, P&L, Секретарь, Memory и загрузку документа.

### Локальная проверка
Нужны Docker и локальный backend/.env.local (не коммитить). Выполнить:
docker compose -f docker-compose.local.yml up --build
curl -i http://localhost:8080/healthz
curl -i http://localhost:8081/healthz
Проверить POST MarkItDown с тестовым файлом и Authorization: Bearer <MARKITDOWN_TOKEN>.

### Переключение frontend
Сейчас не менять .github/workflows/deploy-frontend.yml. После создания и проверки шлюза заменить VITE_API_URL в deploy-frontend.yml на https://<cloudru-gateway-url>, затем выполнить push в main и дождаться CI/публикации. Проверить вход, P&L, STEN AI, Секретарь, Flash, Команду, документы и CORS. Оставить Yandex Cloud резервом минимум на 2 недели. Удалять ресурсы только после отдельного подтверждения.

## Ограничения
- GitHub Actions не разворачивает backend, API Gateway, Container Apps или MarkItDown.
- Yandex Cloud Function продолжает использовать module.exports.handler; module.exports.app добавлен только для контейнера.
- Container Apps задаёт PORT при создании контейнера; приложение должно слушать 0.0.0.0:$PORT. См. https://cloud.ru/docs/container-apps-evolution/ug/topics/concepts__runtime.
- MARKITDOWN_ENABLED оставлять false в production до успешного теста backend → MarkItDown.

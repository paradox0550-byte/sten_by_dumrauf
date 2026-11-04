# STEN MarkItDown — отдельная Cloud Function

MarkItDown — самостоятельная Python-функция. Она не входит в Node.js Backend ZIP и не должна размещаться в той же функции.

## Исходники и артефакт

Источник: `backend/markitdown/`.

GitHub Actions `Package Yandex Cloud Backend (manual)` создаёт отдельный файл:

`sten-markitdown-python312-<commit-sha>.zip`

В корне ZIP должны быть только:
- `function.py`
- `requirements.txt`

Версия библиотеки закреплена: `markitdown[all]==0.1.8`.

## Параметры функции

| Параметр | Значение |
|---|---|
| Function ID | `d4e4ai8895c3kq3b0ds5` |
| Runtime | Python 3.12 |
| Entrypoint | `function.handler` |
| Engine | MarkItDown 0.1.8 |
| Auth | обязательный Bearer token |
| Max input | 15 MiB по умолчанию |

При ручной публикации создать новую версию существующей отдельной функции, не заменяя Node.js Backend.

## Environment и Lockbox

- `MARKITDOWN_TOKEN` — обязательный секрет в Lockbox.
- `MARKITDOWN_MAX_BYTES` — необязательный лимит; default 15728640 bytes.

Backend и converter должны использовать одно и то же значение `MARKITDOWN_TOKEN`, переданное через Lockbox bindings. Значение не помещать в обычные GitHub files, ZIP, workflow logs или чат.

Если токен не задан, converter возвращает 503. Запрос без корректного Bearer token получает 401.

## Сетевой маршрут

Кандидатная схема через API Gateway `qww`:

`POST https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/markitdown/convert`

В корневом `api-gateway.yaml` путь `/markitdown/{proxy+}` направлен на Function ID `d4e4ai8895c3kq3b0ds5`. Это проектная конфигурация из GitHub, а не подтверждение того, что маршрут уже опубликован.

После импорта Gateway spec в Backend environment установить:
- `MARKITDOWN_URL=https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/markitdown/convert`
- `MARKITDOWN_ENABLED=true` только после тестов;
- `MARKITDOWN_TIMEOUT_MS=60000`;
- `MARKITDOWN_TOKEN` из Lockbox.

До успешной проверки оставить `MARKITDOWN_ENABLED=false`.

## Проверки

1. Converter function стартует на Python 3.12.
2. Запрос без Authorization возвращает 401.
3. Тестовый документ с корректным токеном возвращает HTTP 200 и непустое поле `markdown`.
4. Неверный токен не проходит.
5. Backend обращается к адресу через Gateway и получает тот же успешный ответ.
6. В логах нет токена и содержимого секретов.
7. Browser/frontend не обращается к converter напрямую.

Не включать интеграцию в production до прохождения всех пунктов.

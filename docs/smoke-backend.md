# Backend Smoke Tests

## Перед началом

Замените `<TOKEN>` на действующий JWT пользователя с доступом к организации. Для тестов 2–5 используется тот же TOKEN.

Base URL:

`https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net`

## 1. Healthz

```powershell
curl.exe "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/healthz"
```

Ожидаемо: HTTP 200, `status: "ok"`, `version: "5.0.2"`, `db: "connected"`.

> Примечание: актуальный `backend/index.js` из `main` содержит version 5.0.2. Не считать 5.1.0 успешным результатом для этого bundle: это означало бы проверку кода, которого в данном PR нет.

## 2. Ask — обычный вопрос

```powershell
curl.exe -X POST "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/ask" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -H "Content-Type: application/json" ^
  -d "{\"question\":\"привет\"}"
```

Ожидаемо: HTTP 200 и непустое поле `answer`.

## 3. Ask — детерминированный find_deviations

```powershell
curl.exe -X POST "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/ask" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -H "Content-Type: application/json" ^
  -d "{\"question\":\"__find_deviations__\",\"scope\":{\"period\":\"2026-10\"},\"include_tool_results\":true}"
```

Ожидаемо: HTTP 200, `tools_used` содержит `find_deviations`, `tool_results` содержит результат этого tool.

## 4. Ask — обычный вопрос про отклонения

```powershell
curl.exe -X POST "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/ask" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -H "Content-Type: application/json" ^
  -d "{\"question\":\"что не так с результатами за 2026-10?\"}"
```

Ожидаемо: HTTP 200 и содержательный `answer`. Если backend выбрал tool, в ответе должен присутствовать `tools_used`; конкретный tool не фиксируется этим smoke-test.

## 5. Проверка существующих endpoints

### 5.1 P&L

```powershell
curl.exe -X GET "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/api/pnl?period=2026-10" ^
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо: HTTP 200.

### 5.2 STEN AI Memory

```powershell
curl.exe -X GET "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/api/ai/memory?limit=20" ^
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо: HTTP 200.

### 5.3 B2B context

```powershell
curl.exe -X GET "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/api/b2b/context" ^
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо: HTTP 200.

### 5.4 Analytics settings

```powershell
curl.exe -X GET "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/api/analytics/settings" ^
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо: HTTP 200.

### 5.5 Auth profile

```powershell
curl.exe -X GET "https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net/auth/me" ^
  -H "Authorization: Bearer <TOKEN>"
```

Ожидаемо: HTTP 200 и объект `user`.

## 6. Логи после smoke-тестов

Проверьте логи Cloud Function после публикации и выполнения smoke-тестов.

Ожидаемо: нет ошибок вида `schema attempt failed`.

Если такая ошибка появилась, не считать deploy успешным: остановить дальнейшую проверку и разбирать причину отдельно.

## Результат

Все 5 групп smoke-тестов должны пройти только после публикации всех трёх файлов bundle. `<TOKEN>` — действующий JWT, который оператор вставляет вручную.

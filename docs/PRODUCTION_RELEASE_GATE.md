# STEN — Production Release Gate

## Назначение

Единая финальная точка контроля перед production. Интерфейсная сборка сама по себе не считается подтверждением готовности.

## 1. Frontend

- [ ] npm ci --legacy-peer-deps
- [ ] npm run typecheck
- [ ] npm run build
- [ ] dist/index.html, dist/assets, manifest.json, sw.js
- [ ] нет прямых вызовов Cloud Function, PostgreSQL или YandexGPT из браузера
- [ ] нет Ollama/Qwen/DashScope runtime-провайдера
- [ ] нет тестовых/mock финансовых значений
- [ ] нет missing -> 0 в финансовых экранах

## 2. Авторизация

- [ ] unlock получает подтверждение только от backend
- [ ] восстановление сессии использует /auth/me
- [ ] без токена нет рабочего контура
- [ ] sign out удаляет локальную сессию

## 3. Scope

Каждый финансовый запрос обязан передавать period и выбранные Project/Branch/Restaurant/Department.

1. All ограничен выбранным родителем.
2. Агрегация выполняется по сырым RUB.
3. Проценты считаются после агрегации.
4. Отсутствующее значение остаётся —.
5. Нельзя подменять отсутствие данных нулём.

## 4. P&L

Production flow:

Scope → GET → редактирование → POST → server response → GET readback → точное сравнение article/plan/fact → подтверждение пользователю.

Сохранение считается подтверждённым только при успешном readback.

Excel:

Preview → parse-only backend → проверка строк → явное подтверждение → POST P&L → readback.

Исходный файл не считается изменённым или перезаписанным.

## 5. Finance / Budget / Dashboard

Единая цепочка:

Выручка → Себестоимость → Валовая прибыль → ФОТ → OPEX → EBITDA → Амортизация/Проценты/Налоги/Прочее → Чистая прибыль.

Budget получает данные из P&L и не создаёт вторую финансовую базу.

Dashboard не заполняет отсутствующие периоды нулями и показывает источник выбранного Scope.

## 6. STEN

- [ ] браузер отправляет запросы только через API Gateway
- [ ] /ask получает Scope
- [ ] финансовый контекст STEN фильтруется тем же Scope
- [ ] YandexGPT используется только backend-контуром
- [ ] документы проходят extraction/OCR до анализа
- [ ] исходный документ immutable
- [ ] постоянное сохранение документа происходит только явно

## 7. Secretary

- [ ] события читаются и записываются через backend
- [ ] timezone обрабатывается серверным контуром
- [ ] create/delete имеют подтверждаемую запись
- [ ] Escape закрывает модальное окно
- [ ] первое поле получает focus
- [ ] пустые состояния и ошибки видимы
- [ ] нет GPT-зависимости для календарной логики

## 8. UI/UX 2026

- [ ] desktop sidebar и mobile bottom navigation не конфликтуют
- [ ] mobile navigation opaque, без glassmorphism
- [ ] touch targets не менее 40–44 px
- [ ] focus-visible есть для keyboard navigation
- [ ] модалки ограничены viewport и имеют scroll
- [ ] опасные действия визуально отличаются
- [ ] loading/error/empty states присутствуют
- [ ] финансовые таблицы не ломают mobile viewport
- [ ] нет контрастного дефекта белый текст на светлом фоне

## 9. CI / Cloud

CI green обязателен, но сам по себе не является доказательством production.

После green CI отдельно подтверждаются:

1. Cloud Function smenavkarmane-api обновлена.
2. API Gateway qww отвечает.
3. /healthz возвращает актуальную версию.
4. authenticated /auth/me работает.
5. P&L POST → GET readback работает в выбранном Scope.
6. /ask реально проходит через YandexGPT.
7. Excel/PDF/DOCX/image pipeline работает.
8. Secretary create → GET → delete работает.

## 10. Финальное правило

Нельзя писать production-ready, пока обязательные пункты не подтверждены фактическим запуском.

При обнаружении дефекта во время финального прохода исправляется первопричина сразу, после чего повторяется только затронутый контроль и общий release gate.

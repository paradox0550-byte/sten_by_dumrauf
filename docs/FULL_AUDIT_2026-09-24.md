# STEN — полный аудит соответствия продуктовой концепции

Дата аудита: 24.09.2026  
Каноническая ветка: `main`

## Итог

Репозиторий уже содержит единый рабочий контур: серверная авторизация, Scope, P&L, Excel-импорт, Finance, Budget, Dashboard, STEN, документы, Secretary и Settings. В этом проходе исправлены несколько несоответствий, которые мешали считать контур завершённым.

## Что найдено и исправлено

### 1. Финансовая формула backend
Backend включал «Прочее» в EBITDA, одновременно вычитая «Прочее» ещё раз при расчёте чистой прибыли. Это расходилось с канонической моделью приложения.

Исправлено:
- EBITDA = Выручка − Себестоимость − ФОТ − OPEX.
- Чистая прибыль = EBITDA − Амортизация − Проценты − Налоги − Прочее.
- Frontend и backend теперь используют одну модель.

### 2. STEN: предпросмотр документов
До аудита файл после загрузки сразу проходил извлечение и становился доступным STEN, но пользователь не мог открыть отдельный read-only просмотр извлечённого текста.

Добавлено:
- `GET /ai/documents/{id}/preview`;
- предпросмотр первых 12 000 символов;
- сведения об объёме извлечения;
- явная маркировка «только чтение»;
- просмотр не имеет операции записи в P&L;
- OpenAPI обновлён.

### 3. Тестовый контур
Добавлены автоматические проверки:
- финансовые формулы;
- отсутствие подмены неполных данных нулём;
- масштаб ₽ / тыс. ₽ / млн ₽;
- Scope query;
- P&L save → readback → compare;
- Excel P&L parsing и исходные ячейки;
- backend test script.

CI теперь запускает:
- typecheck;
- lint;
- frontend tests;
- build;
- backend syntax check;
- backend tests;
- статические security/integrity guards.

### 4. CI
Legacy branch cleanup больше не должен блокировать основной release gate: операция удаления старой ветки выполняется non-blocking. Это не ослабляет проверки кода.

### 5. Документация
README синхронизирован с текущим backend v5.0.2, лимитом документов 15 МБ, тестами и предпросмотром документов.

## Проверка продуктовых контуров

| Контур | Состояние |
|---|---|
| Авторизация | Реальная серверная JWT-авторизация, offline bypass отсутствует |
| Scope | Период + проект + филиал + ресторан + отдел передаются в финансовый API |
| Dashboard | Plan/Fact/отклонения/динамика, отсутствующие значения не превращаются в 0 |
| P&L | Ручной ввод, Plan/Fact, отклонения, %, сохранение и readback |
| Excel | Локальный preview → серверный parse → проверка → явное подтверждение → запись → readback |
| Finance | Валовая прибыль, EBITDA, чистая прибыль, Food Cost, ФОТ %, OPEX %, EBITDA Margin, Net Margin |
| Budget | Читается из P&L, отдельной финансовой базы нет |
| STEN | YandexGPT только backend; P&L-контекст и документы доступны аналитическому контуру |
| Документы | XLSX/XLSM/XLS, PDF, DOCX, CSV, TXT, MD, JSON, изображения; извлечение и preview |
| Secretary | События, календарный список, заметки, создание и подтверждённое удаление |
| Settings | Тема, рабочие блоки, локальный кэш, выход, справка |
| UI | Русский интерфейс, responsive layout, mobile navigation, loading/error/empty states |

## Что сознательно не объявляется готовым

1. На коммите `b5506c1` GitHub Actions создал новый CI run `36058845657` и frontend deploy run `36058845438`, но оба завершились с `failure` практически сразу. Доступные через GitHub API логи возвращают `BlobNotFound`, а шаги job недоступны, поэтому причина runner/billing/инфраструктуры не подтверждена. Это блокирует честное заявление «CI green» и требует повторного запуска после восстановления доступности Actions.
2. Production smoke-прохождение всей цепочки User → Gateway → Function → PostgreSQL → Object Storage → Yandex AI не может быть подтверждено только чтением исходников.
3. Backend deploy из GitHub зависит от защищённых Yandex Cloud credentials/variables; их значения не должны попадать в репозиторий.
4. Расширенное бюджетирование (годовые сценарии, forecast, сценарии исполнения) остаётся следующим продуктовым уровнем.
5. Секретарь пока не является полноценным task-management: нет полного контура ответственности, recurring tasks и истории действий.
6. Нормализованный Excel-файл как отдельный экспорт STEN ещё не является завершённым пользовательским workflow.

## Правило завершения

Production-ready статус присваивается только после фактического прохождения CI и Cloud smoke. Отсутствие облачного подтверждения нельзя заменять mock-успехом.

<!-- 2026-09-29 analytics-settings -->
## 2026-09-29 - Analytics / Settings on server

- Настройки аналитики (пороги Food Cost / Labor Cost, тумблеры financial/labor/forecast) перенесены из localStorage в backend.
- Хук src/lib/useAnalyticsSettings.ts - источник правды. localStorage используется только как кэш.
- API Gateway получил путь /api/analytics/settings (GET / PUT / OPTIONS) с интеграцией на Cloud Function d4epijnhj7h9sd5ppa66.
- src/pages/Settings.tsx сохраняет через useAnalyticsSettings().save().
- src/pages/Analytics.tsx читает через тот же хук; пороги отображаются как "Порог N%".
- .env.production должен содержать VITE_API_URL=https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net. Без этого build не считается валидным.
- Контракт: GET -> { ok: true, data: { settings: null | AnalyticsSettings } }; PUT <- { foodTarget, laborTarget, financial, labor, forecast } -> { ok: true, data: { saved: true, confirmed: true, settings: {...} } }.

# 15-шаговый контур полной готовности продукта

Цель: довести main до production-ready без заглушек, фиктивных цифр, двойного ввода и возврата к уже исправленным проблемам.

## 01. Source of truth и инвентаризация
Проверить весь main, дубли, legacy, маршруты, компоненты, backend, OpenAPI, workflows и Yandex Cloud contract. Удалять только после проверки runtime-зависимостей.

## 02. Production backend
Единый backend: auth, organization isolation, PostgreSQL, Object Storage, audit, error handling, schema/migrations. Обязательны node --check и backend tests.

## 03. Единый Scope
Project → Branch → Restaurant → Department + Period одинаково используется в P&L, Budget, Dashboard, Finances, Analytics и STEN. Никаких default и скрытых fallback.

## 04. P&L Core
P&L — единственный финансовый источник управленческого слоя. Статьи, plan/fact, provenance, source, author, timestamp, formulaVersion, readback и audit.

## 05. Excel ingestion
Определение листа, заголовка, статьи, Plan/Fact, периода, числового формата и структуры таблицы. Preview до записи. Непонятные данные не превращаются в нули.

## 06. P&L import → persistence
Preview → явное подтверждение → запись в Scope/Period → GET-readback → только после этого «сохранено».

## 07. Финансовый Core
Revenue → COGS → Gross Profit → Payroll → OPEX → EBITDA → Depreciation → Interest → Tax → Other → Net Profit. Сначала RUB, затем проценты. Missing ≠ 0.

## 08. Budget
Budget автоматически строится из P&L выбранного Scope/Period: plan/fact, отклонения, доли, EBITDA и контроль незаполненных статей.

## 09. Dashboard
Revenue plan/fact, EBITDA, costs, margins, deviations, динамика по периодам, проблемные статьи и состояние данных. Только реальные значения.

## 10. STEN Document Engine
Upload → immutable original → extraction/OCR → structured evidence → preview → analysis → explicit save. XLSX/XLSM/XLS, PDF, DOCX, CSV, TXT и изображения.

## 11. STEN Skills
P&L, Budget, ФОТ, персонал/табель, себестоимость/склад, операционка ресторана, маркетинг/продажи, документы/Excel и план действий. Только реальные данные и источники.

## 12. Secretary
Календарь, встречи, задачи, дедлайны, напоминания, заметки/итоги, статусы, timezone, audit и idempotency. GPT не управляет календарём и не придумывает события.

## 13. UI/UX
Единая B2B/fintech визуальная система: Dashboard, P&L, Budget, STEN, Secretary, mobile/iPhone, loading/empty/error/success states.

## 14. E2E production verification
Auth → API; Excel → preview → P&L → DB → readback; P&L → Budget; P&L → Dashboard; file → extraction → STEN; Secretary create → DB → readback → list → update → delete.

## 15. Release gate
TypeScript → build → backend syntax/dependency check → OpenAPI consistency → security scan → frontend deploy → backend Function deploy → Gateway smoke → production smoke.

### Жёсткое правило
После каждого шага фиксировать результат в PROJECT_MEMORY. Следующий аудит начинается с последнего подтверждённого состояния и не повторяет закрытые дефекты.

## 2026-09-24 — Next gate
Excel import must be verified end-to-end: preview → mapping → explicit confirmation → P&L write → exact readback. No save claim without readback.
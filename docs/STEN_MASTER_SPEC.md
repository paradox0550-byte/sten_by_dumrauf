# STEN Master Specification / PRD
## Smart Tracking & Economic Navigator

Этот документ — единый источник истины для продукта, дизайна и постановки задач. Реализация не должна противоречить ему без отдельного решения и фиксации причины.

### 1. Принципы
- Data over decoration.
- No fake certainty: null/отсутствие факта никогда не становится нулём.
- Calculation before interpretation: расчёт детерминированный, AI объясняет.
- Secure by boundary: Browser → API Gateway → Backend; секреты только backend.
- HoReCa First: Prime Cost первичен, Flash Report важнее месячной ретроспективы.

### 2. Канон архитектуры
Frontend: React + TypeScript + Vite + PWA/offline shell.
Backend: Node.js 22 + Yandex Cloud Functions + PostgreSQL + Object Storage.
AI: только YandexGPT через backend/API Gateway. Локальные Ollama/Qwen runtime не являются production-контуром STEN.
Auth: 4-значный numeric PIN → POST /auth/unlock → JWT. Код хранится только как bcrypt cost 12 hash во внешнем secret storage; без email/password и offline-auth.
Deploy: frontend/backend разделены; frontend CI не изменяет Cloud Function.
Offline: кэширует оболочку, но не выдаёт защищённые данные и не подделывает API-ответы.

### 3. Swiss Hospitality
База: #FAFAF8 / #0B0A08. Единственный акцент: Amber #F59E0B.
Inter для текста; JetBrains Mono для чисел и tabular figures.
12-колоночная сетка, шаг 8px, компактные 32px строки, hairline borders.
Без glassmorphism, glow, неона и декоративных градиентов. Анимации 150–300ms, restrained.

### 4. HoReCa-логика
Prime Cost = (COGS + Labor) / Revenue.
≤60% — норма; 60–65% — внимание; >65% — критично.
Dashboard: Prime Cost первым. P&L: Prime Cost выделяется как ключевой контрольный показатель.
Flash: Выручка, Средний чек, Гости, Food Cost %, Labor Cost %, Prime Cost % + объяснение отклонений.
P&L: канонические Revenue/COGS/Labor/OPEX; overtime отдельной строкой Labor; other_* >5% требует детализации.
Excel/CSV: fuzzy matching; неизвестное → очередь «Требует уточнения».

### 5. Канонические маршруты
/unlock — 4-значный numeric PIN; 4 символа на frontend, сервер проверяет код из secret storage.
/dashboard — Prime Cost first, P&L, отклонения.
/flash — daily/weekly оперативная сводка.
/pnl — Plan/Fact/Delta и нормализованные статьи.
/budget — план-факт и прогноз.
/analytics — Menu Matrix, Heatmap, Daypart при наличии источников.
/team — смены, Labor Cost, overtime.
/documents — до 15 МБ, OCR/parsing, AI context.
/sten — STEN Rich Responses и история.
/settings — профиль, внешний вид, безопасность, AI Skills, уведомления.
Существующие /finances, /quick-entry, /pnl/import, /secretary сохраняются как рабочие вспомогательные контуры.

### 6. UX
Modals: Esc + backdrop + close + focus management.
Drawers: детализация контекста, справа, collapsible.
Popovers: подсказка после 300ms.
Smart Filters: период + scope + активные chips.
Empty state всегда объясняет следующий шаг.
Пользователю показываются человеческие ошибки; UUID, SQL/Zod, endpoints и AI prompts скрываются.
Danger Zone: подтверждение только необратимых действий, формат «действие + последствие».

### 7. AI Skills
UI-настройки: Food Cost, Labor Cost, длительность смен; tone of voice; документы/история; исключение Capex из OPEX trends; очистка контекста и cache.
STEN не принимает финансовые решения вместо пользователя и не создаёт факты.

### 8. Roadmap
Phase 1: Foundation/Security.
Phase 2: P&L, Dashboard, Prime Cost, Flash.
Phase 3: Team, Documents, STEN, AI Skills.
Phase 4: Budget, Analytics, microinteractions, mobile, production smoke/CI.

### Definition of Done
Любое изменение считается готовым только после typecheck → lint → test → build и проверки, что UI не скрывает отсутствие данных, финансовые формулы детерминированы, scope един для финансовых экранов, а frontend не содержит секретов.

# STEN — актуальная передача дел

Дата обновления: 2026-09-24
Основная ветка: main
Назначение: личное приложение владельца, не SaaS.

## 1. Каноническая цель

Главный экран — STEN. Пользователь задаёт вопросы, загружает документы и получает анализ на основе реальных данных.

Вспомогательные окна:
- Дашборд;
- P&L;
- Импорт P&L;
- Финансы;
- Экономика;
- Бюджет;
- Настройки.

## 2. Текущая архитектура

Репозиторий содержит frontend.

Frontend:
React 19 + TypeScript + Vite 8 + Tailwind CSS 4.

Production frontend:
Yandex Object Storage, bucket smenavkarmane-business.

API:
Yandex API Gateway
https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net

Backend/STEN:
Yandex Cloud Function `d4epijnhj7h9sd5ppa66` (`smenavkarmane-api`), Node.js 22, `index.handler`, уже настроенная вне репозитория.

Database:
PostgreSQL в Yandex Cloud.

AI:
Yandex Cloud AI Studio / YandexGPT. Браузер напрямую к AI не обращается.

## 3. Что находится в main

Главные точки:
- src/App.tsx — маршруты;
- src/components/Layout.tsx — основной shell;
- src/pages/AI.tsx — главный экран STEN;
- src/pages/Unlock.tsx — персональная разблокировка;
- src/contexts/AuthContext.tsx — серверная JWT-сессия без offline-auth;
- src/lib/api.ts — API Gateway client;
- src/lib/backend.ts — named API adapter;
- src/lib/operationalModel.ts — frontend-модель финансовых понятий;
- src/pages/PnL.tsx — P&L;
- src/pages/PnLImportPage.tsx — Excel/CSV import;
- src/pages/Finances.tsx — фактические финансовые данные;
- src/pages/AdvancedAnalytics.tsx — экономика;
- src/pages/Budget.tsx — бюджет;
- src/pages/Settings.tsx — тема, блоки, локальная очистка, справка.

## 4. STEN

Frontend отправляет запросы через /ask.

STEN UI не показывает внутреннее имя модели, технические credentials или model URI.

Документы:
- PDF;
- DOCX;
- XLSX;
- XLSM;
- CSV;
- TXT;
- MD;
- JSON;
- XML;
- HTML.

История текущего диалога сохраняется локально в браузере.

Финансовые цифры должны приходить из backend/calculation core. Отсутствующие факты нельзя превращать в нули.

## 5. Персональная разблокировка

Пользовательский вход — только /auth/unlock.

В UI удалены:
- login;
- signup;
- forgot password;
- change password;
- email authentication.

Персональный код хранится только на стороне backend/secret store и не публикуется в репозитории.

После успешной разблокировки используется JWT как техническая серверная сессия.

При отсутствии сети или недоступности API локальная оболочка не считается аутентифицированной; облачные данные и AI недоступны.

## 6. UI

Цель:
спокойный premium B2B/fintech интерфейс.

Темы:
- светлая;
- системная;
- тёмная.

Нет:
- glassmorphism;
- aurora;
- декоративного визуального шума;
- fake KPI;
- demo charts.

Финансовые значения используют tabular/monospace numerals.

На вспомогательных окнах есть X в верхней панели. Модальные окна имеют собственную кнопку закрытия и закрываются по Escape.

## 7. Удалённый мусор

Из main удалены:
- старые password/login/signup/forgot/change-password страницы;
- password UI компоненты;
- mock Marketing;
- mock Macro Analytics;
- mock Financial Analytics;
- старые demo chart компоненты;
- duplicate public/openapi.yaml;
- старый backend-era auditor.py;
- obsolete external AI agent scripts;
- obsolete password reset migration.

Остальные файлы удаляются только после проверки references.

## 8. Object Storage

Deploy workflow публикует только frontend dist/.

SPA:
- index.html — home;
- 404.html — error shell.

Workflow задаёт явные MIME-типы для HTML, JS, CSS, SVG, JSON и manifest.

Важно: весь bucket нельзя очищать при frontend deploy, потому что Object Storage может содержать пользовательские документы.

## 9. API контракт

Главный:
POST /auth/unlock
GET /auth/me
POST /ask
GET /ai/documents
POST /ai/documents/upload
POST /api/pnl/calculate

OpenAPI:
openapi.yaml.

Старый login/password UX в OpenAPI удалён.

## 10. Работа без сети

Без сети могут отображаться только публичная оболочка и локальные UI-настройки. Аутентификация не обходится локально.

Без сети недоступны:
- JWT-разблокировка через API;
- облачные данные;
- AI;
- новые документы;
- PostgreSQL запросы.

После восстановления соединения вход выполняется обычным серверным /auth/unlock.

## 11. Проверки

Перед production:
1. npm ci;
2. npm run typecheck;
3. npm run build;
4. проверить dist/index.html;
5. проверить dist/assets;
6. проверить manifest;
7. проверить service worker;
8. проверить HTML для /;
9. проверить HTML для /unlock;
10. проверить JS/CSS MIME;
11. проверить online unlock;
12. проверить /ask;
13. проверить документы;
14. проверить P&L.

Build не является доказательством здоровья backend, PostgreSQL или AI.

## 12. Главный инженерный принцип

Не делать:
ошибка → догадка → patch → новая ошибка.

Делать:
факт → причина → точечное изменение → typecheck → build → CI → integration smoke.

main — единственная истина.

## 13. YandexGPT

Production AI: Yandex Cloud AI Studio / YandexGPT.

Model URI: gpt://<folder_id>/yandexgpt/latest или явно выбранная актуальная модель.
BASE URL: https://ai.api.cloud.yandex.net/v1

AI credentials хранятся только в Yandex Cloud secrets/Lockbox и не попадают во frontend/Git.

Ollama, Qwen и localhost:11434 не являются частью продукта и не должны возвращаться.

## 14. Следующий production gate

Нужно получить реальный успешный GitHub Actions run после текущей серии изменений.

После этого отдельно подтвердить:
API Gateway → Cloud Function → PostgreSQL → Yandex AI Studio/YandexGPT → ответ STEN.

Только после фактического smoke test считать систему боевой.

## 15. Полная инструкция владельца

Актуальная подробная инструкция:
docs/STEN_USER_GUIDE.md

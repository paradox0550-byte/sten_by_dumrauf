# Dumrauf Restaurant Operator — что необходимо добавить в backend

Дата: 2026-11-07
Основание: аудит main commit 453362638ded2daa03483448fb2d6833732efbfd и исследование отраслевых решений.
Назначение: техническое ТЗ для последующей реализации. Это не команда на немедленное изменение production.

## 0. Решение по текущему backend

Не переписывать backend с нуля.

В main уже есть значимая основа:
- Telegram update/message ingestion и дедупликация в telegramMonitor.js;
- Telegram группы и привязка chat → organization/restaurant;
- AI классификация в telegramSecretary.js;
- пакетная обработка в telegramSecretaryWorker.js;
- AI findings с approve/reject и исходным сообщением;
- operational_observations / operational_actions;
- жизненный цикл задачи с выполнением и независимой проверкой;
- event history для находок и задач;
- telegram_outbox, доставки, утренние/вечерние дайджесты и эскалации;
- настройки режима, уведомлений, часового пояса;
- таймерный worker в Yandex Cloud Function;
- начальный Telegram сценарий /sten_check на 4 контрольные точки.

Следовательно, переписывать 3 500+ строк не нужно. Нужно выделить новый операционный домен и соединить существующие механизмы в непрерывный цикл.

## 1. Критические блокеры в main

### 1.1 AI-анализ не является оперативным
В handler timer событие worker запускает daily_ai_analysis с уникальностью по CURRENT_DATE. Это означает, что автоматический AI batch в текущем main ограничен одним успешным запуском в день, до 50 сообщений за запуск. Это не подходит для управления сменой в реальном времени.

Нужно:
- очередь необработанных сообщений;
- near-real-time worker с небольшим интервалом или очередь событий;
- обработка по restaurant/chat partition;
- ограничение параллелизма и стоимости;
- backoff, lease, retry, dead-letter;
- приоритеты: food_safety/critical/urgent выше обычных сообщений;
- idempotency по update_id и chat_id + message_id + analyzer_version;
- метрики задержки и backlog.

Важно: не вызывать LLM синхронно в webhook. Webhook должен быстро принять и сохранить update, затем вернуть 2xx после надёжного сохранения; worker выполняет анализ отдельно.

### 1.2 Разные webhook-пути в main ведут себя по-разному
В main POST /api/ingest/message после сохранения и claim вызывает handleOperationalTelegramUpdate для callback_query и обычных новых сообщений.
В main POST /api/telegram/webhook только сохраняет/claim/complete update, но не вызывает handleOperationalTelegramUpdate. Также он отвечает 200 даже при processing error. Это критическая функциональная разница.

PR #289 создан для унификации общего pipeline и корректной retry-семантики. Его необходимо проверить, принять отдельно и только после этого планировать deploy. Не регистрировать новый webhook вслепую: у одного bot token только один активный webhook URL.

### 1.3 Нынешний Secretary — классификатор, не управляющий
telegramSecretary.js различает issue/task/commitment/urgent/information/ignore и строит proposal только для части типов с confidence >= 0.75. Контекст prompt ограничен недавними сообщениями; нет полноценного состояния смены, SOP, ответственных и операционных правил.

Нужно добавить нормализованную модель событий и контекст ресторана.

### 1.4 Нет полноценного диалогового движка
handleOperationalTelegramUpdate сейчас поддерживает ограниченный сценарий /sten_check, callback кнопки, выбор контрольной точки, результат и сохранение наблюдения. Нет общего state machine для диалога: уточнить событие, выбрать исполнителя, срок, запросить доказательство, подтвердить решение, напомнить и эскалировать.

### 1.5 Сообщения — в основном текст/caption
telegram_messages сохраняет message_text/caption и raw_json. Worker анализирует message_text. Не реализован полноценный pipeline для фото, документов, голосовых, видео и альбомов как операционных доказательств. Нужны безопасная загрузка Telegram file, metadata, OCR/transcription/vision и связь с событием/задачей.

### 1.6 Отсутствует устойчивый операционный контекст
Нужна серверная модель:
- ресторан и его часовой пояс;
- зоны/департаменты: кухня, зал, бар, склад, касса и т.д.;
- роли и сотрудники;
- матрица ответственности и замещения;
- смены и ожидаемые отчёты;
- чек-листы и версии;
- SOP/регламенты/стандарты;
- правила эскалации и допустимой автономности;
- критичные контрольные пороги;
- график событий/дедлайнов.

Нельзя позволять LLM самостоятельно угадывать, кому назначить задачу или какой стандарт применить.

## 2. Новые backend-модули

Рекомендуемая структура, названия условные:

backend/restaurant-operator/
- eventNormalizer.js — преобразование текста/медиа в нормализованное событие;
- eventClassifier.js — тип, severity, confidence, сущности;
- eventCorrelator.js — связь сообщений в цепочку/инцидент/смену;
- restaurantContext.js — роли, зоны, SOP, расписания, стандарты;
- policyEngine.js — проверка полномочий и уровня автономности;
- workflowEngine.js — state machine для смен, событий, задач, handover;
- dialogueEngine.js — состояние диалога с сотрудником/руководителем;
- commandDispatcher.js — только allowlisted actions;
- evidenceService.js — фото/файлы/голосовые доказательства;
- operatorWorker.js — очередь и обработка;
- operatorScheduler.js — дедлайны, контрольные точки, отчёты, эскалации;
- operatorAudit.js — аудит действий агента;
- schemas.js — строгие Zod схемы для LLM output и API.

Существующие telegramMonitor.js, telegramSecretary.js, telegramSecretaryWorker.js и telegramControl.js не удалять; мигрировать функциональность постепенно, сохраняя совместимость.

## 3. Нормализованная модель событий

Добавить таблицу operational_events:
- id UUID;
- organization_id UUID;
- restaurant_id UUID;
- chat_id TEXT NULL;
- message_id TEXT NULL;
- telegram_update_id BIGINT NULL;
- topic_id/message_thread_id TEXT NULL;
- source_type (telegram_text, telegram_photo, telegram_voice, telegram_document, manual, integration);
- event_type из закрытого enum;
- category;
- severity (info, low, medium, high, critical);
- confidence numeric;
- status (reported, acknowledged, needs_clarification, accepted, in_progress, completed_unverified, verified, rejected, reopened, closed);
- title, summary, details;
- reported_by_user_id / source_sender_id;
- assigned_to_user_id / assigned_role_id;
- due_at;
- occurred_at, detected_at, created_at, updated_at;
- related_event_id / parent_event_id;
- analysis_version;
- payload_json JSONB;
- source_snapshot_json JSONB.

Индексы: organization_id + restaurant_id + status + severity + detected_at; unique idempotency key по источнику и версии анализа; индексы chat/time.

Отдельная operational_event_evidence:
- event_id;
- file_id/secure storage key;
- mime type, size, hash;
- evidence_type;
- captured_at;
- uploaded_by;
- OCR/transcript/vision metadata;
- verification status.

Отдельная operational_event_links:
- event_id;
- related task/finding/shift/checklist/incident id;
- relation type.

Сохранять оригинальное сообщение неизменным. Исправленный текст — новая версия/событие редактирования; историю нельзя терять.

## 4. Модель смены и отчётности

Добавить:
- restaurant_shifts: restaurant, business_date, shift_type, opened_at, closed_at, manager_id, status;
- shift_requirements: обязательные отчёты/чек-листы по ролям и зонам;
- shift_submissions: кто, когда и что отправил, источник, версия, статус;
- shift_handover_items: открытые проблемы, ответственные, сроки, подтверждение следующей сменой.

Сценарии:
- opening_due → запросить старт-лист;
- opening_submitted → распарсить обязательные поля;
- missing/contradictory fields → запросить уточнение;
- opening_ready → статус только при выполнении обязательных требований;
- closing_due → собрать закрывающие отчёты;
- shift_handover → перенести незавершённые задачи в следующую смену.

Система должна поддерживать текстовый отчёт в свободной форме и структурированный ответ через inline кнопки/форму Mini App. Не заставлять сотрудников переписывать весь процесс с нуля.

## 5. Матрица ответственности

Нужна таблица restaurant_responsibility_rules:
- organization_id, restaurant_id;
- event_type / category / zone / shift_type;
- primary_role_id / primary_user_id;
- backup_role_id / backup_user_id;
- approver_role_id;
- verifier_role_id;
- SLA minutes;
- escalation chain;
- active_from/active_to;
- version.

При отсутствии ответственного — не назначать случайного сотрудника. Создать событие needs_owner и запросить управляющего.

Сопоставление упоминания имени в чате с user ID должно быть отдельным контролируемым resolver с неоднозначностью. Не назначать по совпадению строки без проверки.

## 6. Policy Engine — безопасная автономность

Добавить restaurant_agent_policies:
- mode: observer / copilot / operator;
- event_type/action_type;
- enabled;
- max_severity;
- requires_approval;
- max_value / max_scope, если применимо;
- allowed_roles;
- allowed_hours;
- cooldown;
- max_actions_per_window;
- policy_version;
- updated_by/updated_at.

Каждое действие проходит policy engine. LLM не выбирает уровень своих полномочий.

Классы:
A. Автоматически разрешённые: acknowledgement, запрос обязательного отчёта, напоминание по известному дедлайну, типовая задача из утверждённого шаблона при однозначном ответственном.
B. Только подтверждение менеджера: переназначение, изменение срока/приоритета, новая задача без шаблона, изменение стоп-листа в учётной системе, компенсация гостю, заказ продукта.
C. Только человек: кадровые санкции, зарплата, закупка/платёж, изменение цен/меню/SOP, окончательное закрытие критического food-safety инцидента.

Нужен emergency kill switch на organization/restaurant/chat/agent/action category.

## 7. Диалоговый движок

Добавить durable conversation_sessions:
- chat/user/organization/restaurant;
- session_type;
- current_state;
- context_json;
- expires_at;
- last_interaction_at.

Поддержать команды и естественный язык:
- «стоп-лист обновился»;
- «почему блюдо до сих пор в стопе?»;
- «кто не сдал открытие?»;
- «назначь исправить холодильник»;
- «готово» + фото;
- «передай следующей смене»;
- «что сейчас критично?».

Движок обязан:
1. определить intent;
2. проверить контекст и права;
3. при нехватке данных задать один конкретный вопрос;
4. сформировать preview действия;
5. проверить policy;
6. выполнить разрешённое действие;
7. прочитать запись обратно из БД;
8. подтвердить сотруднику только сохранённый результат;
9. оставить event/audit trail.

## 8. Обработка медиа

Добавить:
- Telegram getFile + безопасную загрузку;
- лимиты размера/типа, MIME sniffing, malware scan при возможности;
- object storage private bucket, signed short-lived URLs;
- OCR для фото чек-листа/стоп-листа/документа;
- speech-to-text для voice/audio;
- image understanding для фото санитарии/готовности/поломки;
- evidence hash, author, timestamp, message link;
- запрет на вывод «проверено» только по факту наличия фото.

Модель должна отличать фото-отчёт, скриншот, старое фото, нечёткое изображение и недостаточное доказательство. При сомнении — ручная проверка.

## 9. Очередь, SLA и наблюдаемость

Нужен отдельный queue/worker loop:
- webhook: verify secret → persist raw update → enqueue → acknowledge;
- worker: claim lease → normalize → classify → correlate → policy → action proposal/allowed action → persist → deliver;
- retry with exponential backoff and jitter;
- dead-letter queue;
- per-chat ordering where necessary;
- idempotent outbound messages;
- max AI spend per restaurant/day;
- provider timeout/circuit breaker;
- priority queue;
- processing_runs with model, prompt version, tokens/cost, duration, error;
- dead-letter review and replay tool.

Сохранить текущие telegram_updates и telegram_outbox, если их схема позволяет. Новые очереди добавлять только после оценки текущей схемы и нагрузки.

## 10. API additions (proposed)

- GET /api/operator/overview
- GET /api/operator/events
- GET /api/operator/events/:id
- POST /api/operator/events/:id/acknowledge
- POST /api/operator/events/:id/clarify
- POST /api/operator/events/:id/accept
- POST /api/operator/events/:id/reject
- POST /api/operator/events/:id/assign
- POST /api/operator/events/:id/verify
- POST /api/operator/events/:id/reopen
- GET /api/operator/shifts/current
- GET /api/operator/shifts/:id
- POST /api/operator/shifts/:id/submit
- GET/PUT /api/operator/responsibility-rules
- GET/PUT /api/operator/policies
- GET /api/operator/agent-runs
- GET /api/operator/agent-runs/:id
- POST /api/operator/pause
- POST /api/operator/resume

Не создавать маршруты механически, пока не определены реальные контракты и права. Все запросы строго scoped by organization and accessible restaurant; клиент не является источником доверенного restaurant_id.

## 11. Роли AI внутри продукта

Не строить пять автономных агентов, которые независимо пишут в чат. Лучше один управляющий orchestrator + специализированные ограниченные skills:
- Shift Controller;
- Kitchen & Stop-list;
- Service & Guest Recovery;
- Food Safety;
- Equipment & Maintenance;
- Team & Staffing;
- Closing & Handover.

Каждый skill возвращает типизированный event/proposal. Только orchestrator/policy engine решает, можно ли выполнить действие.

## 12. Тесты и acceptance criteria

Обязательные сценарии:
- одно сообщение, повторный webhook, edited message — нет дубликатов;
- одинаковые тексты из двух ресторанов — нет cross-tenant утечки;
- чат без binding — нет автоматического действия;
- Telegram sender без активной привязки пользователя — нет персональных команд;
- несколько сотрудников с похожими именами — уточнение, а не случайное назначение;
- «готово» без контекста — уточнение;
- фото не соответствует задаче — completed_unverified, не verified;
- критичная санитарная жалоба — немедленная эскалация по политике;
- стоп-лист изменён повторно — состояние актуализируется, не дублируются уведомления;
- событие пришло во время недоступности AI — сохраняется и обрабатывается после восстановления;
- AI timeout/provider failure — webhook не теряет сообщение;
- отключённый агент/kill switch — никаких outbound действий;
- неверная политика/роль — отказ и audit;
- отчёт открытия не полный — смена не помечается готовой;
- исполнитель не может сам подтвердить независимую проверку.

Метрики CI: classification fixture accuracy, policy tests, tenant isolation, idempotency, retry, state machine transition coverage, API RBAC.

## 13. Вопросы инфраструктуры до реализации

- Подтвердить реальную настройку Yandex Timer и частоту вызова. Не считать, что она существует только потому, что обработчик написан.
- Подтвердить webhook URL каждого bot token через getWebhookInfo. У одного токена только один активный webhook.
- Проверить privacy mode и права бота в каждой группе. Telegram по умолчанию ограничивает видимость групповых сообщений; бот должен получать полный поток разрешённым способом (например, администратор группы/отключённый privacy mode).
- Проверить, какие группы и темы включены, и согласовать доступ сотрудников.
- Не менять секреты, webhook, API Gateway, Function или DB без отдельного разрешения.
- Для Mini App проверить PR #291 отдельно; текущий initData verifier сам по себе ещё не выдаёт Dumrauf session и не решает привязку пользователя.

## 14. Этапы реализации

P0 — надёжность данных:
- принять и протестировать единый webhook pipeline (#289);
- проверить webhook/Timer/permissions;
- near-real-time worker + очередь;
- event schema и idempotency.

P1 — полезный операционный мозг:
- контекст ресторана, роли, SOP;
- structured events;
- открытия/закрытия, стоп-лист, инциденты;
- персональные напоминания и handover.

P2 — управление задачами:
- автоматическое назначение по матрице;
- доказательства выполнения;
- независимая проверка;
- escalation policies.

P3 — контролируемая автономность:
- policy engine;
- operator mode;
- allowlisted commands;
- kill switch;
- audit + agent run history.

P4 — multimodal:
- фото, документы, голосовые;
- OCR, transcription, vision;
- качество evidence.

P5 — расширение:
- другие мессенджеры/интеграции через adapters;
- межресторанные паттерны и рекомендации;
- benchmark и постоянная оценка.

## 15. Что НЕ делать сейчас

- Не переписывать весь backend.
- Не заменять Yandex Cloud/Gateway.
- Не менять DB schema в production без миграционного PR.
- Не включать автоматическое назначение всем сотрудникам.
- Не активировать autonomous mode для финансовых/кадровых/food-safety решений.
- Не создавать интерфейсные кнопки для несуществующих API.
- Не утверждать, что таймер, анализ, отправка или проверка работают в production без end-to-end проверки.


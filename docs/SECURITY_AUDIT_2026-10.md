
# Security Audit — 2026-10

**Дата:** 2026-10-08  
**Аудитор:** Codex (read-only)  
**Base SHA:** e3667e8514a56696e6d558db0ff20badd72f3eb2  
**Объём:** backend/, src/, public/, .github/, package manifests/lockfiles и доступная Git history

> Режим аудита: findings only. В рамках аудита код не изменялся, fixes не выполнялись.

## Сводка

| Severity | Количество |
|---|---:|
| Critical | 0 |
| High | 7 |
| Medium | 10 |
| Low | 5 |
| Info | 5 |

## Executive summary

Основной риск STEN сейчас — authorization boundary внутри одной организации. JWT и SQL parameterization в основных местах выглядят корректно, Service Worker не кэширует API, а current-tree secret scan не обнаружил реальные credential values. При этом несколько mutation endpoints принимают scope от клиента без полного assertScopeAccess, а ряд organization-wide настроек доступен любому authenticated member.

Второй крупный риск — untrusted file parsing: xlsx 0.18.5 используется на upload/import пути и имеет известные security advisories; собственный ZIP/DOCX parser не ограничивает суммарный decompressed size.

Третий риск — AI/input boundary: /ask принимает body.system и body.context как system messages. Это не дало подтверждённого cross-tenant tool bypass, но позволяет пользователю менять приоритеты AI-инструкций.

# Critical

Прямых Critical findings на audited main не подтверждено.

# High

## H-1. P&L write принимает произвольный scope без полного scope authorization

**Файл:** backend/index.js:1483-1501  
**Тип:** scope-leak / authorization / integrity

**Описание:** POST /api/pnl требует requireAuth + requireOrg, но проверяет только restaurant_id. project_id, branch_id и department_id не проходят assertScopeAccess.

**Сценарий атаки:** authenticated member подставляет UUID чужого branch/project/department и отправляет P&L без restaurant_id. Запись выполняется внутри той же organization_id.

**Влияние:** нарушение scope authorization и целостности финансовых данных.

**Рекомендация:** перед записью проверять полный scope через authoritative scope checker.

**Ссылка на код:**
~~~js
const body = parseOr400(PnlWriteSchema, req.body ?? {});
if (body.restaurant_id) await assertRestaurantAccess(req.user, body.restaurant_id);
const cleanRows = body.rows.map(r => ({
  id: r.id || null,
~~~

## H-2. P&L approval не проверяет полный scope

**Файл:** backend/index.js:1528-1548  
**Тип:** authorization / scope-integrity

**Описание:** POST /api/pnl/approve проверяет роль approver и только restaurant_id через assertRestaurantAccess. Project/branch/department scope не проверяется.

**Влияние:** approver может утвердить контур, к которому не имеет scope-доступа.

**Рекомендация:** использовать assertScopeAccess для approval read/write.

**Ссылка на код:**
~~~js
if (!APPROVER_ROLES.has(String(req.user.role || '').toLowerCase()))
  throw httpError(403, 'У Вас нет права утверждать план.', 'FORBIDDEN_APPROVAL');
const s = scopeFromQuery(req.body || {});
if (s.restaurant_id) await assertRestaurantAccess(req.user, s.restaurant_id);
~~~

## H-3. Ingest confirm проверяет только restaurant scope

**Файл:** backend/index.js:2363-2377  
**Тип:** scope-leak / financial-integrity

**Описание:** /api/ingest/message/confirm получает полный scope, но проверяет только restaurant_id. Чужие project/branch/department внутри разрешённого restaurant не проходят полный authorization.

**Влияние:** финансовая запись может оказаться в неправильном рабочем scope.

**Рекомендация:** проверять полный scope и отдельно пересмотреть upsert contract daily_reports/pnl_entries.

**Ссылка на код:**
~~~js
if (!s.restaurant_id)
  throw httpError(422, 'Для подтверждения отчёта необходимо выбрать ресторан.', 'RESTAURANT_CONTEXT_REQUIRED');
await assertRestaurantAccess(req.user, s.restaurant_id);
~~~

## H-4. Organization-wide messenger settings доступны обычному member

**Файл:** backend/index.js:1692-1696  
**Тип:** authorization / data-exfiltration

**Описание:** POST /api/messenger/settings требует только requireAuth + requireOrg. Обычный member может изменить telegram_chat_id / whatsapp_phone для всей организации. /api/reports/send затем использует сохранённого recipient для отправки финансового отчёта.

**Сценарий атаки:** member меняет recipient на контролируемый канал и инициирует отправку отчёта.

**Влияние:** потенциальная утечка финансовой информации.

**Рекомендация:** отдельная permission gate и server-authorized recipients.

**Ссылка на код:**
~~~js
app.post('/api/messenger/settings',requireAuth,requireOrg,async(req,res,next)=>{try{
 const b=parseOr400(MessengerSettingsSchema,req.body??{});
 await queryWithRetry('INSERT INTO messenger_settings(... telegram_chat_id,whatsapp_phone ...)',
   [req.user.organizationId,...,b.telegram_chat_id||null,b.whatsapp_phone||null,...],
~~~

## H-5. Organization units CRUD доступен любому organization member

**Файл:** backend/index.js:1906-1964  
**Тип:** authorization / scope-integrity

**Описание:** создание, переименование и удаление Project/Branch/Restaurant/Department требуют requireAuth + requireOrg, но не role/permission check.

**Влияние:** обычный member может менять саму модель scope и нарушать integrity organizational tree.

**Рекомендация:** отдельная permission gate для control-plane mutations.

**Ссылка на код:**
~~~js
app.post('/api/b2b/org/units', requireAuth, requireOrg, async (req, res, next) => {
  const body = parseOr400(OrgUnitCreateSchema, req.body ?? {});
  ...
});
~~~

## H-6. Untrusted XLSX parsing через xlsx 0.18.5

**Файлы:** backend/package.json, backend/documentProcessor.js:31,33, backend/index.js:1561-1578,2097-2119  
**Тип:** dependency / file-upload / DoS / parser attack

**Описание:** lockfile фиксирует xlsx 0.18.5. Backend принимает пользовательские XLSX/XLSM/XLS и вызывает XLSX.read(). Для SheetJS опубликованы CVE-2023-30533 (prototype pollution) и CVE-2024-22363 (ReDoS). CVE-2024-22363 имеет HIGH DoS classification; CVE-2023-30533 затрагивает версии до 0.19.3.

**Сценарий атаки:** attacker uploads crafted workbook; backend parses attacker-controlled ZIP/XML data.

**Влияние:** parser-level integrity issue и/или CPU denial-of-service.

**Рекомендация:** заменить/обновить parser на security-supported вариант и изолировать parsing untrusted documents.

**Ссылка на код:**
~~~js
function xlsxRows(b){const wb=XLSX.read(b,{type:'buffer',cellDates:true,raw:true}),out=[];
...
if(['xlsx','xlsm','xls'].includes(ext)){const rows=xlsxRows(buffer);
~~~

## H-7. ZIP/DOCX parser не ограничивает decompressed size

**Файл:** backend/documentProcessor.js:6-7  
**Тип:** file-upload / resource-exhaustion

**Описание:** zipEntries() распаковывает entries через inflateRawSync без общего decompression budget. Upload ограничен compressed input, но compressed ZIP может распаковаться значительно больше.

**Влияние:** memory/CPU exhaustion и crash/retry pressure.

**Рекомендация:** hard decompression budget, entry count limit, per-entry limit и sandboxed parser.

**Ссылка на код:**
~~~js
function zipEntries(b){const out=[];let p=0;while(p+30<=b.length){
  ...
  const x=m===0?d:m===8?zlib.inflateRawSync(d):null;
  if(x)out.push({name,data:x,size:us})
}
~~~

# Medium

## M-1. /ask позволяет клиенту добавлять произвольный system prompt

**Файл:** backend/index.js:492-512,2204-2230  
**Тип:** AI injection / prompt-integrity

**Описание:** AskSchema допускает system/context и passthrough(). Затем body.system и body.context вставляются как system messages. Пользователь может менять приоритеты AI-инструкций.

**Влияние:** prompt-policy bypass и некорректные AI conclusions. Прямой cross-tenant tool bypass не подтверждён, поскольку tool policy выполняется backend-side.

**Рекомендация:** system policy должна быть server-owned; user context передавать как untrusted data.

**Ссылка на код:**
~~~js
messages.push({ role: 'system',
  text: (body.system ? String(body.system) + '\n\n' : '') + SYSTEM_PROMPT });
if (body.context) messages.splice(2, 0, {
  role: 'system', text: String(body.context).slice(0, 12000)
});
~~~

## M-2. Memory API не проверяет scope access при create/list

**Файл:** backend/core/memory.js:87-112  
**Тип:** scope-leak / authorization

**Описание:** Memory list/create фильтруют organization_id, но не вызывают authoritative assertScopeAccess. Зная UUID, member может обратиться к memory другого restaurant scope.

**Влияние:** чтение/создание memory в чужом scope внутри организации.

**Рекомендация:** scope validation или явное решение сделать memory полностью organization-wide.

**Ссылка на код:**
~~~js
const params = [user.organizationId];
const where = ['organization_id=$1::uuid'];
if (f.restaurant_id) {
  params.push(f.restaurant_id);
  where.push('restaurant_id=$' + params.length + '::text');
}
~~~

## M-3. Не все 7 AI tools имеют scope policy

**Файл:** backend/core/tools.js:383-430  
**Тип:** authorization / AI tool policy

**Описание:** get_pnl, find_deviations и get_sales имеют assertScopeAccess; get_fot, get_documents, get_memory и get_secretary_context ограничены organization policy.

Часть этого может быть намеренной organization-wide семантикой, но security contract неоднороден.

**Рекомендация:** явно классифицировать каждый tool как organization-wide или scope-bound; scope-bound tools должны иметь authoritative scope gate.

## M-4. queryWithRetry устанавливает app.org_id session-level

**Файл:** backend/index.js:137-151  
**Тип:** RLS / connection isolation

**Описание:** set_config(..., false) задаёт setting на DB session, а connection возвращается в Pool. В audited schema code не найдено CREATE POLICY / ENABLE ROW LEVEL SECURITY. Большинство queries вручную фильтруют organization_id, поэтому фактический cross-tenant leak не доказан.

**Влияние:** будущий query, рассчитывающий на app.org_id, может получить stale org context после pool reuse.

**Рекомендация:** transaction-local setting или гарантированный reset; если RLS является security boundary — explicit policies и tests.

**Ссылка на код:**
~~~js
const client = await db().connect();
try {
  if (opts.orgId)
    await client.query("SELECT set_config('app.org_id', $1, false)", [opts.orgId]);
  return await client.query(text, params);
} finally { client.release(); }
~~~

## M-5. safeQuery не создаёт tenant DB context

**Файл:** backend/index.js:119-126  
**Тип:** RLS / defense-in-depth

**Описание:** safeQuery использует pool.query() и не устанавливает app.org_id. Сейчас чувствительные queries в основном явно фильтруют organization_id, поэтому конкретная утечка не подтверждена.

**Рекомендация:** tenant-scoped DB helper должен быть обязательным для tenant data.

## M-6. Binding DELETE не проверяет доступ к связанному restaurant

**Файл:** backend/index.js:1357-1364  
**Тип:** authorization

**Описание:** DELETE /api/b2b/bindings/:id фильтрует binding id + organization_id, но не проверяет restaurant permission.

**Влияние:** member может удалить binding другого scope и нарушить inbound routing.

**Рекомендация:** загрузить binding, проверить unit scope/permission и только затем delete.

## M-7. Secretary events POST/PATCH принимают body без Zod

**Файл:** backend/index.js:1781-1783  
**Тип:** validation / DoS / integrity

**Описание:** events используют req.body напрямую. title/start_at проверяются вручную, но остальные fields не имеют strict schema/length/type bounds. SQL values parameterized, поэтому SQL injection здесь не подтверждён.

**Рекомендация:** strict Zod contracts для create/patch.

## M-8. Unauthenticated ingest endpoint не имеет rate limit/signature

**Файл:** backend/index.js:2345-2361  
**Тип:** unauthenticated resource abuse / webhook spoofing

**Описание:** POST /api/ingest/message не требует auth, rate limit или provider signature и вызывает AI parsing.

**Влияние:** AI cost abuse, DoS, spoofed inbound messages. Прямой DB write отсутствует, поэтому impact ограничен по сравнению с полноценным write webhook.

**Рекомендация:** provider signature, replay protection, bounded rate limit и cost controls.

## M-9. Frontend JWT хранится в localStorage

**Файл:** src/contexts/AuthContext.tsx:5-31  
**Тип:** session security / XSS impact

**Описание:** Bearer JWT хранится в localStorage. При подтверждённом XSS token доступен JavaScript. Сам XSS sink в текущем audit не подтверждён.

**Рекомендация:** short-lived access token + httpOnly Secure SameSite cookie или эквивалентный stronger browser session boundary.

**Ссылка на код:**
~~~js
const t=localStorage.getItem(TOKEN);
...
if(t)h.Authorization='Bearer '+t;
~~~

## M-10. CORS default '*' является unsafe fail-open/fail-broken default

**Файл:** backend/index.js:41,235-249  
**Тип:** CORS / configuration

**Описание:** отсутствие ALLOWED_ORIGINS даёт '*', одновременно credentials=true. Браузер не разрешает wildcard credentialed CORS, поэтому cross-origin credential leak не подтверждён. Но production policy не должна зависеть от такого default.

**Рекомендация:** deny-by-default или fatal startup при отсутствии explicit production allowlist.

# Low

## L-1. JWT verifier не требует обязательный exp и не проверяет alg claim явно

**Файл:** backend/index.js:299-310  
**Тип:** auth hardening

Подпись всё равно проверяется HMAC-SHA256, поэтому alg:none bypass не подтверждён. Но token без exp принимается, если он криптографически валиден.

**Рекомендация:** require alg=HS256, exp/iat и минимальный claim set.

## L-2. Hardcoded insecure JWT fallback

**Файл:** backend/index.js:34-35  
**Тип:** secret/configuration

Production startup отказывается работать с insecure fallback, поэтому production bypass не подтверждён.

~~~js
const INSECURE_JWT_FALLBACK = 'change-me-in-cloud';
JWT_SECRET: process.env.JWT_SECRET || INSECURE_JWT_FALLBACK,
~~~

## L-3. X-Request-ID принимается от клиента

**Файл:** backend/index.js:969-974  
**Тип:** logging / header integrity

Server принимает и возвращает client-provided X-Request-ID. Это не подтверждённый PII leak, но request ID должен быть server-authoritative или строго validated.

## L-4. Vite dev server network exposure

**Файл:** vite.config.ts:30-31  
**Тип:** development exposure

server.host=true делает dev server сетево доступным. Это не production bundle issue, но повышает риск dev-machine file exposure при запуске в небезопасной сети.

**Рекомендация:** localhost by default.

## L-5. jsPDF 2.5.2 ниже текущей security baseline

**Файл:** package.json:24, package-lock.json  
**Тип:** dependency

Lockfile содержит jspdf 2.5.2. Upstream 4.2.1 содержит security fixes для HTML injection и PDF object injection. В audited source не найден подтверждённый опасный jsPDF call-site, поэтому exploitability в STEN не доказана.

**Рекомендация:** обновить dependency и отдельно проверить attacker-controlled output/annotation APIs.

# Info

## I-1. Auth contract drift

**Файл:** backend/index.js:984-1005

На audited main присутствует GET /auth/me, но POST /auth/login, /auth/unlock, /auth/set-password и /auth/change-password отсутствуют. Старый /auth/unlock явно parked. Frontend всё ещё вызывает POST /auth/login.

Это не bypass, а contract mismatch / availability finding.

## I-2. Service Worker cache boundary

**Файл:** public/sw.js

Проверено: /api/, /ask, /auth/, /ai/, /reports, /fot-analytics и Authorization requests исключены из static cache.

## I-3. x-powered-by disabled

**Файл:** backend/index.js:964-966

app.disable('x-powered-by') присутствует.

## I-4. Current-tree secret scan

Проверены common patterns: AWS access keys, GitHub tokens, PEM private keys, Yandex key names, password123, change-me, common sk- prefixes. Реальных credential values в current tree не найдено. В source присутствует только insecure JWT fallback marker из L-2.

## I-5. AI tool iteration and proposed memory

Проверено:
- model tool arguments парсятся через JSON.parse, не eval;
- tool iteration ограничен;
- proposed memory возвращается AI как proposal и не сохраняется автоматически;
- memory content ограничен 50000 chars.

# SQL injection / validation assessment

## Подтверждено как корректное

- Основные financial SQL queries используют $1... parameters.
- Dynamic UPDATE fields в Secretary выбираются из фиксированного whitelist.
- Org unit UPDATE использует фиксированную колонку name.
- P&L upserts используют parameterized values и ON CONFLICT.
- Number schemas для финансовых расчётов используют finite checks.
- Storage key строится из server-generated organizationId + UUID + sanitized filename.

## Hardening gaps

- Не все mutation endpoints используют parseOr400: прежде всего Secretary events и admin organization PATCH.
- AskSchema и IngestMessageSchema используют passthrough().
- PnlCalculateSchema допускает catchall(z.unknown()).
- Scope identifiers должны проходить единый authoritative scope validation перед любой sensitive mutation.

# File upload assessment

Проверено:
- upload limit: 15 MB;
- filename sanitization присутствует;
- storage key начинается с server-generated organization/UUID;
- presigned URLs в audited backend не выдаются;
- bucket policy фактически не проверяется repository audit;
- MIME type не является достаточной security proof;
- XLSX/DOCX parsing server-side;
- macro execution напрямую не найдено;
- ZIP decompression budget отсутствует — H-7.

# Idempotency / race conditions

- POST /api/pnl использует ON CONFLICT: одинаковый scope/period не создаёт duplicate P&L row.
- POST /reports имеет upsert.
- POST /api/pnl/transactions не idempotent: каждый retry создаёт новый UUID/transaction; idempotency key отсутствует.
- /ask ограничивает tool execution одним round.
- suspendExpiredOrganizations использует WHERE status='active', поэтому повторный sweep идемпотентен; distributed lock не подтверждён.

# Rate limit

Есть:
- AI tools: in-memory 30 calls/min/user.

Недостаточно/нет:
- /ask endpoint-level user limit;
- document upload user limit;
- P&L mutation limit;
- memory mutation limit;
- unauthenticated ingest limit;
- process-local limiter сбрасывается при cold start и не синхронизирован между instances.

# Dependency assessment

## Backend

| Dependency | Locked | Assessment |
|---|---:|---|
| xlsx | 0.18.5 | High — H-6, reachable untrusted parser |
| express | 4.22.3 | No direct current-version finding confirmed |
| pg | 8.23.0 | No direct finding confirmed |
| bcryptjs | lockfile | No direct finding confirmed |
| zod | lockfile | No direct finding confirmed |

## Frontend

| Dependency | Locked | Assessment |
|---|---:|---|
| xlsx | 0.18.5 | Same vulnerable parser dependency |
| jspdf | 2.5.2 | Low — L-5 |
| react-router-dom | 6.28.0 | Older 6.x; current HashRouter Declarative Mode reduces applicability of known navigation advisories |
| vite | 8.2.2 | Outside cited 8.0.0–8.0.15 Windows dev-server affected range; host=true remains a dev exposure |
| zod | 3.23.8 | No direct finding confirmed |

Local npm audit was not executable in this read-only connector environment. Dependency findings are based on lockfiles and published advisories. CI project validation is the authoritative build/test gate.

# Secrets / Git history

## Current tree

No real credential values were found using common secret patterns.

## Last 200 commits

Latest 200 commits were enumerated and commit metadata/messages reviewed. No commit message explicitly advertises a secret leak.

A full byte-level historical secret scan of every blob in all 200 commits is NOT claimed as completed: the available connector does not expose a reliable historical-blob regex scan primitive. This must be treated as an audit limitation, not as proof that history is clean.

# Что НЕ проверено

1. Production ENV/Lockbox/KMS values.
2. Actual Yandex Cloud Function configuration.
3. Actual Object Storage bucket policy/public access.
4. Actual PostgreSQL RLS policies and DB roles.
5. API Gateway WAF/network/DDoS controls.
6. TLS termination/certificate configuration.
7. External MarkItDown service security.
8. YandexGPT quotas/billing controls.
9. Full byte-level historical secret scan across all last 200 commits.
10. Runtime penetration test against production.
11. Manual browser penetration test.
12. Local npm audit execution.

# Следующие шаги

Separate fixes, without implementation in this audit PR:

1. PR: fix scope authorization — P&L write/approval, ingest confirm, memory and all scope-bound mutations.
2. PR: fix organization control plane — role/permission gates for org units, messenger settings and bindings.
3. PR: harden file parsing — remove xlsx 0.18.5, add decompression budgets and parser isolation.
4. PR: harden AI boundary — server-owned system prompt and explicit untrusted user context.
5. PR: webhook security — provider signatures, replay protection, rate limits and cost controls.
6. PR: session security — stronger browser session boundary than localStorage JWT.
7. PR: auth contract — implement/synchronize email/password lifecycle, bcrypt, rate limiting and lockout.
8. PR: dependency baseline — update jsPDF and run complete npm audit.
9. PR: database RLS — explicit policies and transaction-local org context if RLS is required security boundary.
10. PR: historical secret scan — Gitleaks/TruffleHog/GitHub secret scanning over full history.

# Audit conclusion

**STATUS: NOT SECURITY-CLEAR.**

No Critical bypass was confirmed on audited main. Basic JWT signature validation, SQL parameterization in the main financial queries, Service Worker API cache exclusion and current-tree secret hygiene are positive controls.

However, the security gate should remain red until at least H-1/H-2/H-3 (scope authorization), H-4/H-5 (organization-member privilege), H-6/H-7 (untrusted file parsing) and M-2/M-8 (memory scope and unauthenticated AI-consuming webhook) are addressed in separate PRs.

This PR contains findings only. No backend/frontend/.github/.env/package files were changed.

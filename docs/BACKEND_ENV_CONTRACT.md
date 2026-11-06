# STEN Backend Runtime Contract — 5.4.1

This contract describes variables read by the backend source in `backend/`.
It is not a copy of the current Yandex Cloud environment. Secret values must never be committed to Git or printed in CI logs.

## Required production configuration

| Variable | Type | Purpose |
|---|---|---|
| `NODE_ENV` | config | Set to `production`. |
| `ALLOWED_ORIGINS` | config | Exact comma-separated frontend origins. Required in production. |
| `JWT_SECRET` | secret | Signs STEN session JWTs. No fallback is allowed in production. |
| `DB_HOST` | config | Managed PostgreSQL endpoint. |
| `DB_PORT` | config | PostgreSQL connection port; default 6432. |
| `DB_NAME` | config | Database name. |
| `DB_USER` | config | Database user. |
| `DB_PASSWORD` | secret | Database password. |
| `DB_POOL_MAX` | config | PostgreSQL pool size; default 2. |
| `DB_IDLE_TIMEOUT_MS` | config | Pool idle timeout; default 30000 ms. |
| `DB_SSL_MODE` | config | Leave unset/default for verified TLS. `disable` is rejected in production; no insecure override is supported. |
| `YC_FOLDER_ID` | config | Yandex Cloud folder used to resolve the YandexGPT model URI. |
| `YANDEXGPT_API_KEY` | secret | YandexGPT API key. |
| `OBJECT_STORAGE_BUCKET` | config | Private backend bucket for uploaded documents. Never point this at the public website bucket. |
| `OBJECT_STORAGE_ENDPOINT` | config | S3-compatible Object Storage endpoint; defaults to Yandex Object Storage. |
| `AWS_ACCESS_KEY_ID` | secret | S3-compatible access key when static credentials are used. |
| `AWS_SECRET_ACCESS_KEY` | secret | S3-compatible secret key when static credentials are used. |
| `GOOGLE_CLIENT_ID` | config | Expected Google OAuth client ID; backend checks token `azp` (authorized party), falling back to `aud`. Must match frontend `VITE_GOOGLE_CLIENT_ID`. |

**TLS rule:** Yandex Cloud Functions provides the managed-database CA at `/usr/local/share/ca-certificates/yandex-internal-ca.crt`; backend reads it and uses `rejectUnauthorized: true`. Do not disable certificate verification to make a deployment pass. If the platform CA file is unavailable, the backend fails closed.

**Storage boundary:** `OBJECT_STORAGE_BUCKET` must reference a private data bucket with anonymous read/list disabled. Do not use `smenavkarmane-business` if it remains the public frontend bucket. Confirm the private bucket and its IAM permissions before creating the new function version.

## Feature-specific secrets

| Variable | When needed |
|---|---|
| `ADMIN_BOOTSTRAP_PASSWORD` | Temporary administrator bootstrap only. Keep `ADMIN_BOOTSTRAP_FORCE=false`; remove the bootstrap password after confirming the admin account has a password. |
| `IIKO_CREDENTIALS_ENCRYPTION_KEY` | Required if iiko credentials are stored. Keep the exact existing key: changing it can make stored credentials unreadable. |
| `MARKITDOWN_TOKEN` | Shared secret for the MarkItDown function when token authentication is enabled. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token; also used as fallback for the monitor bot. |
| `TELEGRAM_MONITOR_BOT_TOKEN` | Optional dedicated monitor-bot token; takes precedence over `TELEGRAM_BOT_TOKEN`. |
| `TELEGRAM_MONITOR_SECRET` | Dedicated `/api/telegram/webhook` monitor endpoint secret header validation. |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook secret header validation. This is the variable the webhook actually checks. |
| `WHATSAPP_APP_SECRET` | WhatsApp webhook signature validation, if WhatsApp inbound is enabled. |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp outbound messaging, if enabled. |

## Optional configuration

- `ADMIN_EMAIL`, `ADMIN_ID`, `ADMIN_ROLE`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_BOOTSTRAP_FORCE`, `DEFAULT_ORG_ID` — administrator bootstrap.
- `JWT_TTL_SECONDS` — JWT lifetime.
- `DEBUG` — leave disabled in production unless temporary diagnostics are approved.
- `YANDEXGPT_BASE_URL`, `YANDEXGPT_TIMEOUT_MS`, `YANDEXGPT_MODEL`, `YANDEXGPT_MAX_TOKENS`, `YANDEXGPT_TEMPERATURE` — AI settings; defaults exist for model, timeout, token count and temperature.
- `VISION_OCR_URL` — OCR endpoint; default points to Yandex Vision OCR.
- `MARKITDOWN_URL`, `MARKITDOWN_ENABLED`, `MARKITDOWN_TIMEOUT_MS` — MarkItDown integration. When enabled, `MARKITDOWN_URL` must use the dedicated `/markitdown/{proxy+}` Gateway route and point to the separate converter function; enable only after that function and route are verified reachable.
- `OBJECT_STORAGE_REGION` — preferred storage region. `AWS_DEFAULT_REGION` is accepted as a fallback.
- `YC_BUCKET_NAME` — legacy fallback for `OBJECT_STORAGE_BUCKET`; prefer `OBJECT_STORAGE_BUCKET` and do not configure both with different values.
- `PORT` — used only by the optional `backend/server.js` container/local adapter; it is not required by the Yandex Cloud Function entrypoint.
- `TOOL_MAX_ITERATIONS` — AI tool iteration limit.
- `PNL_APPROVER_ROLES` — optional P&L approval role override.
- `WHATSAPP_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` — WhatsApp integration configuration.
- `CORS_ORIGIN` — legacy fallback; use `ALLOWED_ORIGINS`.

## Present in the supplied Cloud list but not consumed by backend 5.4.1

Do not treat these as active backend requirements:

| Variable | Finding |
|---|---|
| `API` | Not read by backend code. |
| `DB_SSL_ALLOW_INSECURE` | Not read by the current PostgreSQL SSL resolver; no insecure override exists. Do not add it to Cloud Function configuration. |
| `NETWORK_ID` | Not read by backend code; VPC/network is a Cloud Function resource setting. |
| `ASK_RATE_LIMIT`, `ASK_RATE_WINDOW_SEC` | Not read by backend code. AI tool policy currently has its own fixed per-user limit in `backend/core/policy.js`; these variables do not configure it. |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Not used by the current Google Identity Services browser-token flow. |
| `TELEGRAM_MONITOR_SECRET` | Not read by backend code. The webhook validates `TELEGRAM_WEBHOOK_SECRET`. |
| `UNLOCK_CODE_HASH` | Legacy PIN authentication is disabled; `/auth/unlock` returns HTTP 410. Do not include this variable in the next function version. |
| `MARKITDOWN_AUTH_MODE` | Declared in runtime configuration but not consumed by the current MarkItDown bridge; token behavior is controlled by `MARKITDOWN_TOKEN`. |

The frontend Google client ID is a build-time GitHub Actions variable `VITE_GOOGLE_CLIENT_ID`, not a Vite secret and not a backend secret. Never put a Google client secret into a `VITE_*` variable.

## Do not rotate during migration

- Do not rotate `IIKO_CREDENTIALS_ENCRYPTION_KEY` without proving that all existing encrypted iiko credentials decrypt successfully with the proposed key.
- Secret migration and secret rotation are separate operations.
- Never store secret values in GitHub, this document, build artifacts, logs or browser bundles.

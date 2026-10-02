This repository contains the frontend, production backend source and API contracts. Backend runtime secrets are still external to Git and must never be copied into Vite/frontend variables.

## Secrets — external secret store only
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- JWT_SECRET
- YANDEXGPT_API_KEY
- DB_PASSWORD

Use Yandex Cloud Lockbox / runtime secret configuration or the equivalent protected backend secret store. Never commit values, print them in CI logs, or expose them in browser bundles. The runtime must receive a bcrypt hash, never the plaintext 4-digit code.

## Backend configuration
- DB_USER
- DB_NAME
- DB_HOST
- OBJECT_STORAGE_BUCKET
- OBJECT_STORAGE_ENDPOINT
- YC_FOLDER_ID
- DEFAULT_ORG_ID
- YANDEXGPT_MODEL
- YANDEXGPT_TIMEOUT_MS
- DEBUG

Recommended production posture: DEBUG=0 unless temporary diagnostics are explicitly required. AI configuration remains server-side; the frontend knows only the API Gateway URL.

## STEN AI contract
The backend must call Yandex Cloud AI Studio/YandexGPT. The frontend must never receive YANDEXGPT_API_KEY, database credentials, JWT secret or. If YandexGPT is unavailable, return a safe diagnostic error rather than a fake answer.


## MarkItDown document normalization
- MARKITDOWN_URL — server-side HTTPS invocation URL of the dedicated MarkItDown Cloud Function.
- MARKITDOWN_ENABLED — `true` only after the converter function is deployed and reachable; otherwise STEN keeps the legacy extraction fallback.
- MARKITDOWN_TIMEOUT_MS — conversion request timeout, default 60000 ms.
- MARKITDOWN_TOKEN — protected secret shared only between STEN backend and MarkItDown function.
- The browser never calls MarkItDown directly.
- Document flow: upload → MarkItDown → normalized Markdown → STEN deterministic parsing/evidence storage → YandexGPT.
- For Excel/P&L, MarkItDown is the normalization step, but STEN retains the deterministic XLSX parser for plan/fact/source-cell fields.

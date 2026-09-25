This repository contains the frontend, production backend source and API contracts. Backend runtime secrets are still external to Git and must never be copied into Vite/frontend variables.

## Secrets — external secret store only
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- JWT_SECRET
- YANDEXGPT_API_KEY
- DB_PASSWORD
- UNLOCK_CODE_HASH (bcrypt hash, cost 12)

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
The backend must call Yandex Cloud AI Studio/YandexGPT. The frontend must never receive YANDEXGPT_API_KEY, database credentials, JWT secret or unlock code. If YandexGPT is unavailable, return a safe diagnostic error rather than a fake answer.

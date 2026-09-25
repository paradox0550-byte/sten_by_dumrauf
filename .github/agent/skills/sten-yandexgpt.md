# Skill: STEN YandexGPT

Production AI is Yandex Cloud AI Studio / YandexGPT only.

Canonical path:
Frontend → API Gateway /ask → STEN backend/Cloud Function → PostgreSQL/documents/tools → Yandex AI Studio/YandexGPT → response.

Rules:
- browser never calls Yandex AI directly;
- credentials stay in server secrets/Lockbox;
- model URI is configured server-side, e.g. gpt://<folder_id>/yandexgpt/latest;
- no local model runtime or provider-specific client in frontend;
- no fake fallback answer when AI is unavailable;
- unavailable AI must return a diagnostic error that the UI can display safely;
- facts and financial values come from evidence/tools, not model invention.

# STEN — production contract

## Frontend

Production frontend is a static Vite build deployed to Yandex Object Storage bucket smenavkarmane-business.

Canonical site:
https://smenavkarmane-business.website.yandexcloud.net

The repository does not deploy the backend.

## API

Frontend API:
https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net

The browser calls the API Gateway only. It never derives the API host from window.location and never calls the AI service directly.

Main contracts:
- POST /auth/unlock
- GET /auth/me
- POST /ask
- GET /ai/documents
- POST /ai/documents/upload
- POST /api/pnl/calculate

## AI

Production AI is YandexGPT through Yandex Cloud AI Studio.

The browser never receives AI credentials. The backend/Cloud Function is responsible for authenticating to Yandex AI Studio and calling the configured text-generation model.

Canonical model configuration should use a YandexGPT model URI such as:
`gpt://<folder_id>/yandexgpt/latest`

The AI Studio text-generation endpoint is:
`https://ai.api.cloud.yandex.net/v1`

The exact model URI and credentials are environment/secret configuration, never frontend source.

Use a service account with only the required AI permissions. API keys must remain outside the repository; Yandex documents the `yc.ai.languageModels.execute` scope for text generation. citeturn1search4turn1search1

Ollama, OLLAMA_BASE_URL, Qwen and localhost:11434 are not production architecture and must not be reintroduced.

## STEN behavior

/ask remains the stable application contract. The backend prepares organization-scoped documents, memory and deterministic tool results first; YandexGPT interprets that evidence and produces the answer.

Financial values are calculated by deterministic backend code. The model must not invent missing figures. If evidence is missing, STEN must explicitly say that the fact is unavailable.

## Auth

The user-facing authentication flow is personal unlock. Email, login, password, registration and password-reset UI are intentionally removed from the frontend.

The backend may retain its technical JWT session because the API still needs an authenticated request context.

## Object Storage SPA

Object Storage website hosting must use:
- index.html as the home page;
- 404.html as the error page.

The deploy workflow explicitly sets MIME types for HTML, JavaScript, CSS, SVG, JSON and manifest files.

The workflow must not delete the entire bucket because the bucket can contain user documents.

## Production verification

Before calling the release ready:
1. npm run typecheck
2. npm run build
3. verify dist/index.html
4. verify dist/assets
5. verify manifest and service worker
6. verify HTML at /
7. verify HTML at /unlock
8. verify JavaScript MIME type
9. verify CSS MIME type
10. verify API URL points to Gateway
11. verify online unlock
12. verify /ask through the Gateway
13. verify document upload and retrieval
14. verify P&L calculation against real data
15. verify Gateway → Cloud Function → Yandex AI Studio → YandexGPT → STEN response

A green frontend build does not prove that PostgreSQL, the API Gateway, Cloud Function or YandexGPT is healthy. Those boundaries require a real integration test.

## Current document/P&L production path

STEN document upload is processed server-side before it becomes available to the model. XLS/XLSX/XLSM files are parsed with sheet/row/cell provenance; CSV/TXT/MD/JSON are decoded as text; DOCX text is extracted from the Word document package; text-based PDF content is extracted when present. The original binary remains in Object Storage and extracted evidence is stored with the organization-scoped document record.

P&L Excel import is a two-step financial write: parse → show mapped PLAN/FACT rows and source cells → explicit confirmation → POST `/api/pnl` → readback. Unmapped but labeled financial rows are preserved instead of being silently discarded.

Budget and Dashboard read the same confirmed `/api/pnl` scope and period. They do not maintain a second manual financial source. Missing values remain `—`.

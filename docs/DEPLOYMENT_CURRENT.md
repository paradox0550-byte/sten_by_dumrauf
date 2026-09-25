# STEN — текущий контур деплоя

## Production

- Static site: https://smenavkarmane-business.website.yandexcloud.net
- API Gateway: https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net
- Cloud Function: d4epijnhj7h9sd5ppa66 (smenavkarmane-api)
- Runtime: Node.js 22
- Database: PostgreSQL in Yandex Managed Service
- AI: Yandex Cloud AI Studio / YandexGPT

## YandexGPT configuration

Production backend must use Yandex AI Studio Text Generation API, not a local model runtime.

Recommended environment contract:
- FOLDER_ID — Yandex Cloud folder ID
- MODEL_NAME — YandexGPT model URI, e.g. gpt://<folder_id>/yandexgpt/latest
- BASE_URL — https://ai.api.cloud.yandex.net/v1
- API_KEY — secret, supplied outside source control

Yandex documents this Cloud Functions pattern and the model URI format. citeturn1search1

The API key must stay in Yandex Cloud secrets/Lockbox or an equivalent secret store and never enter frontend code, Git history, .env committed files or build artifacts.

## Function deployment contract

Yandex Cloud Functions uses the native module.exports.handler entrypoint from the deployed `smenavkarmane-api` Node.js 22 function (`index.handler`). Do not add a second HTTP adapter when the current Gateway v1.0 handler already returns { statusCode, headers, body }.

## Request normalization

The deployed function accepts API Gateway request variants and normalizes the path before routing.

## STEN agent

/ask is the canonical STEN route. STEN loads organization-scoped document evidence and memory, executes deterministic tools, then asks YandexGPT for the final response.

Financial values are calculated by deterministic backend code; YandexGPT is used for interpretation and language generation. Missing evidence must remain missing and must never be converted into a guessed number.

## Authentication

The personal workspace uses POST /auth/unlock with a 4-digit code. The backend compares it only against a bcrypt cost-12 hash stored as UNLOCK_CODE_HASH and returns a JWT. Legacy email/password UX is not part of the product.

## CI gate

Production deployment must validate:
1. frontend typecheck;
2. frontend build and relative Object Storage assets;
3. backend syntax and STEN tool registry;
4. exact backend ZIP contents;
5. Yandex Cloud Function version creation;
6. GET /healthz after deployment;
7. real /ask integration through YandexGPT.

A green frontend build alone is not proof of AI health.

## Backend GitHub Actions deployment

The repository now has `.github/workflows/deploy-backend.yml` for the real Yandex Cloud Function `smenavkarmane-api`.

GitHub repository **Variables** required by the workflow:
- `YC_FOLDER_ID` — Yandex Cloud folder containing the function.
- `YC_DEPLOY_SA_ID` — service account used by GitHub Actions to deploy versions.
- `YC_NETWORK_ID` — network ID for the function (`dumm` must be supplied as the actual network ID, not the network name).
- `YC_DB_HOST`
- `YC_DB_PORT`
- `YC_DB_NAME`
- `YC_DB_USER`
- `YC_LOCKBOX_JWT_SECRET`
- `YC_LOCKBOX_UNLOCK_CODE`
- `YC_LOCKBOX_DB_PASSWORD`
- `YC_LOCKBOX_YANDEXGPT_API_KEY`
- `YC_LOCKBOX_AWS_ACCESS_KEY_ID`
- `YC_LOCKBOX_AWS_SECRET_ACCESS_KEY`

The last six values are **Lockbox secret references**, not secret values. The deploy service account must have permission to resolve them. The runtime service account is the existing `github-deployer`.

The workflow validates the backend, deploys `nodejs22 / index.handler / 256Mb / 90s`, attaches the configured VPC network, and then checks the API Gateway `/healthz` endpoint.

This workflow does not copy `backend/function.zip`; it packages the authoritative `backend/` source at deploy time so the deployed version cannot silently lag behind `main`.

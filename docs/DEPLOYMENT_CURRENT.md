# STEN — текущий контур публикации

## Production passport supplied by operator

The following settings were supplied in the infrastructure inventory on 2026-11-04. They are an operator-provided baseline, not a live verification performed by this repository audit.

- Cloud Function: `smenavkarmane-api` / `d4epijnhj7h9sd5ppa66`
- Active version reported: `d4ejrc3ko6koqo1l6dup` / `$latest`
- Runtime: Node.js 22
- Entrypoint: `index.handler`
- Memory: 1 GB
- Timeout: 90 seconds
- Concurrency: 1
- Runtime service account: `serviakk` / `ajeoat76avsvv6jtmjar`
- API Gateway: `qww` / `d5d5p4eof6ra03bsva7a`
- Gateway URL: `https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net`

## Gateway function bindings in repository source (not live-verified)

- Node API: `d4epijnhj7h9sd5ppa66`, tag `$latest`; the `/healthz` and `/{proxy+}` integrations must target this same function.
- MarkItDown: `d4e4ai8895c3kq3b0ds5`, tag `$latest`; only `/markitdown/{proxy+}` targets this separate converter.
- `api-gateway.yaml` does not set `service_account_id`. The Cloud Function runtime service account `serviakk` is not proof of Gateway invocation permission. Confirm the Gateway invocation model in Yandex Console; if the functions are private, confirm a dedicated invoker identity has `functions.functionInvoker` on both functions. Do not invent or silently reuse an identity.
- These are source-file bindings, not proof that the currently deployed Gateway has imported this spec or that the IDs/tags/permissions match live Cloud resources.

## Source of truth

- Backend source: complete `backend/` directory.
- Function entrypoint: `index.handler`.
- Runtime package version: `5.4.1`.
- Canonical Yandex API Gateway specification: root `api-gateway.yaml`.
- The former duplicate `api-gateway-spec.yaml` has been removed from this branch; use only `api-gateway.yaml` as the canonical gateway source.
- `api-spec.yaml` is the maintained application API contract; CI checks exact method/path parity against registered Express routes. It is not the gateway integration file.

Do not deploy only `backend/index.js`: it imports runtime modules from `backend/core/`, `backend/finance/`, `backend/integrations/`, `backend/telegramMonitor.js`, `backend/telegramSecretary.js`, `backend/telegramSecretaryWorker.js`, `backend/operationalControl.js`, `backend/markitdownClient.js` and `backend/documentProcessor.js`. The Python converter under `backend/markitdown/` is a separate Cloud Function and must not be bundled into the Node.js API archive.

## GitHub automation

- `.github/workflows/ci.yml` validates frontend and backend and uploads a frontend build artifact.
- There is no frontend deploy workflow in this branch. `.github/workflows/ci.yml` validates and builds artifacts only; frontend publication is a separate manual operator action.
- There is no `.github/workflows/deploy-backend.yml` in the repository.
- Backend and API Gateway publication are manual operator actions. This repository audit does not publish to Yandex Cloud.

## Manual backend package

1. Use the reviewed PR branch after its CI is green.
2. Download the repository source and take the complete contents of `backend/`.
3. Build a source archive with `index.js`, `package.json`, `package-lock.json`, `core/`, `integrations/` and all runtime modules at the archive root. Do not nest them under another `backend/` directory.
4. Use the Yandex Cloud Console Node.js 22 source-archive flow and its dependency installation mechanism. Keep the entrypoint `index.handler`, memory and timeout unchanged unless separately approved.
5. Create a new function version; do not delete the previous version.
6. Update API Gateway from the canonical root `api-gateway.yaml` only after confirming the function version and integration target.
7. Run the smoke checks in `docs/smoke-backend.md`. Do not treat an HTTP 200 from `/healthz` alone as proof that every dependency and business route works.

## Shared FOT database prerequisite

The new shared FOT endpoints require the reviewed SQL migration `backend/migrations/20261104_fot_shared_persistence.sql`. Before publishing backend 5.4.1 with these routes:

1. Verify the active PostgreSQL cluster and take a backup / recovery point.
2. Apply the migration manually using the steps in `backend/migrations/README.md`.
3. Verify all three FOT tables and their indexes exist.
4. After backend publication, run scoped read/write/readback and cross-restaurant access tests.

The migration is not executed by backend startup. Do not deploy the frontend feature against a database where the migration has not been applied. No migration or cloud change was performed by this repository task.

## Required release gate

- Backend tests pass.
- The source archive contains the complete backend runtime tree.
- Production environment matches `docs/BACKEND_ENV_CONTRACT.md`.
- PostgreSQL TLS verification is enabled with the correct CA.
- The existing iiko encryption key is preserved.
- The dangerous startup P&L deletion is absent.
- API Gateway routes all application paths to the same function and MarkItDown only to its dedicated converter.
- Smoke checks pass before traffic is considered healthy.

Financial calculations remain deterministic backend logic. YandexGPT interprets data but must not invent missing financial values.

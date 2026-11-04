# Backend Manual Release Bundle — 5.4.1

This file is the operator guide, not an embedded copy of selected backend files. The authoritative source is the complete `backend/` directory in the reviewed GitHub branch.

## Important

Do not copy only `backend/index.js`. The function imports modules from `core/`, `integrations/` and other backend files. A partial three-file bundle is not a valid release.

## Build the source archive

From the repository root, on the reviewed branch:

### Linux / macOS

```bash
cd backend
zip -r ../sten-backend-5.4.1.zip index.js package.json package-lock.json core finance integrations documentProcessor.js markitdownClient.js operationalControl.js telegramMonitor.js telegramSecretary.js telegramSecretaryWorker.js
```

### PowerShell

```powershell
Compress-Archive -Path backend\* -DestinationPath sten-backend-5.4.1.zip -Force
```

Before upload, inspect the archive. Its root must contain:

- `index.js`
- `package.json`
- `package-lock.json`
- `documentProcessor.js`
- `markitdownClient.js`
- `telegramMonitor.js`
- `telegramSecretary.js`
- `telegramSecretaryWorker.js`
- `core/`
- `integrations/`

The archive intentionally excludes tests, local `node_modules`, `server.js`/Dockerfile (Cloud.ru container adapter) and `markitdown/` (a separate Python Cloud Function). Do not bundle the Python MarkItDown converter into the Node.js API function.

## Yandex Cloud Function settings

Use the operator-confirmed function settings as the baseline:

- Runtime: `nodejs22`
- Entrypoint: `index.handler`
- Memory: 1 GB
- Timeout: 90 seconds
- Runtime service account: `serviakk`

Do not change VPC, service account, memory, timeout or concurrency as part of a source-code copy.

## API Gateway

Use the root file `api-gateway.yaml`. Do not use old dated snapshots under `docs/` or the old wrapped 4.3.0 spec.

- `api-gateway.yaml` — canonical Yandex Gateway integration.
- `api-gateway-spec.yaml` — identical compatibility copy.
- `api-spec.yaml` — application API contract only; not the Gateway import file.

## Environment

Use `docs/BACKEND_ENV_CONTRACT.md` as the source of truth. Do not copy unused legacy variables as if they were required. Do not put values in GitHub or this document.

Required production TLS material: `DB_SSL_CA_BASE64`. Never enable insecure TLS as a workaround.

Preserve the existing `IIKO_CREDENTIALS_ENCRYPTION_KEY`. No rotation is part of this release.

## Release sequence

1. Review PR and wait for green CI.
2. Download the exact PR branch commit.
3. Build and inspect the complete source archive.
4. Upload as a new Cloud Function version; keep the previous version for rollback.
5. Import the canonical `api-gateway.yaml` in the Gateway editor only after verifying the function integration.
6. Run `docs/smoke-backend.md`.
7. Confirm real P&L readback, AI, document upload and Telegram webhook behavior before considering the release complete.

No production deployment is performed by this repository change.

# Backend Manual Release Bundle — 5.4.1

This file is the operator guide, not an embedded copy of selected backend files. The authoritative source is the complete `backend/` directory in the reviewed GitHub branch.

## Important

Do not copy only `backend/index.js`. The function imports modules from `core/`, `finance/`, `integrations/` and other backend files. A partial bundle is not a valid release.

## Build the source archive

From the repository root, on the reviewed branch:

### PowerShell

```powershell
Set-Location backend
Compress-Archive -Path index.js,package.json,package-lock.json,core,finance,integrations,documentProcessor.js,markitdownClient.js,operationalControl.js,telegramMonitor.js,telegramSecretary.js,telegramSecretaryWorker.js -DestinationPath ..\sten-backend-5.4.1.zip -Force
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
- `operationalControl.js`
- `finance/`
- `core/`
- `integrations/`

The archive intentionally excludes tests, local `node_modules`, `server.js`/Dockerfile (container adapter) and `markitdown/` (a separate Python Cloud Function). Do not bundle the Python MarkItDown converter into the Node.js API function.

## Yandex Cloud Function settings

Use the operator-confirmed function settings as the baseline:

- Runtime: Node.js 22
- Entrypoint: `index.handler`
- Memory: 1 GB
- Timeout: 90 seconds
- Runtime service account: `serviakk`

Do not change VPC, service account, memory, timeout or concurrency as part of a source-code copy. These values are an operator-provided baseline, not a live cloud verification.

## API Gateway

Use the root file `api-gateway.yaml` as the only canonical Yandex Gateway integration file.

- `api-gateway.yaml` — Gateway integration to the Node API function and separate MarkItDown function.
- `api-spec.yaml` — application API contract only; not the Gateway import file.

The source-level route parity test checks backend routes against `api-spec.yaml` and the Gateway integration targets. It cannot prove that the deployed Gateway has been imported or that invocation permissions are correct.

## Environment and TLS

Use `docs/BACKEND_ENV_CONTRACT.md` as the source of truth. Do not copy unused legacy variables as if they were required. Do not put secret values in GitHub or this document.

Yandex Cloud Functions provides the managed-database CA at:

`/usr/local/share/ca-certificates/yandex-internal-ca.crt`

Backend reads this file directly and keeps `rejectUnauthorized: true`. `DB_SSL_CA_BASE64` is not required. Do not disable certificate verification.

Preserve the existing `IIKO_CREDENTIALS_ENCRYPTION_KEY`. No rotation is part of this release.

## Release sequence

1. Review PR and wait for green CI on the exact head commit.
2. Download the exact reviewed branch commit.
3. Build and inspect the complete source archive.
4. Upload as a new Cloud Function version; keep the previous version for rollback.
5. Confirm the Gateway backend and MarkItDown function IDs, tags and invocation permissions in Yandex Console.
6. Import the canonical `api-gateway.yaml` only after those bindings are confirmed.
7. Run `docs/smoke-backend.md`.
8. Confirm real P&L readback, AI, document upload, Telegram webhook and payroll scope behavior before considering the release complete.

GitHub Actions are validation-only. No frontend, backend, MarkItDown or API Gateway production deployment is triggered by CI or PR merge. Publication remains a manual operator action.

No production deployment is performed by this repository change.

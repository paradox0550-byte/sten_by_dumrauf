# Skill: Deploy Smoke

Before declaring frontend production-ready:
1. npm ci
2. npm run typecheck
3. npm run build
4. verify dist/index.html, assets, manifest and service worker
5. verify built JS/CSS do not contain server secrets
6. verify configured API URL is the Gateway, not AI/DB
7. verify SPA fallback for the deployed hosting model
8. verify MIME types for JS/CSS
9. run real /auth/unlock and /ask smoke tests only when external services are reachable.

Build success alone is never proof of backend, PostgreSQL or YandexGPT health.

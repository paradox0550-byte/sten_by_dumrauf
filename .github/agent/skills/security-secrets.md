# Skill: Security & Secrets

Treat all credentials as sensitive even when only names are supplied.

Scan source, workflow, docs intended for deployment, generated bundles and config for secret values. Never commit API keys, DB passwords, JWT secrets, unlock codes, access keys or private endpoints that are intended to be secret.

Required separation:
- frontend: public API base URL only;
- backend: DB credentials, JWT secret, object-storage credentials, YandexGPT API key and unlock secret;
- CI: GitHub/Yandex secrets only.

Flag hardcoded authentication hashes/codes in client JavaScript as a security issue because a 4-digit client-side verifier can be brute-forced. Prefer server verification; offline mode must be explicitly threat-modelled.

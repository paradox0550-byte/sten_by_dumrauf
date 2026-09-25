# Skill: API Contract

Goal: keep frontend, Gateway, backend and OpenAPI aligned.

Checks:
- every frontend endpoint exists in the documented contract or is explicitly marked external/unverified;
- request/response field names match actual usage;
- auth headers and error envelopes are consistent;
- no direct AI/provider/database calls from the browser;
- no invented fallback endpoint;
- upload/save flows have a real persistence path and refresh path.

For /ask: frontend sends model-agnostic user input; backend owns retrieval, tools, evidence and YandexGPT invocation. Do not put API keys, folder IDs or model credentials into Vite env/client bundles.

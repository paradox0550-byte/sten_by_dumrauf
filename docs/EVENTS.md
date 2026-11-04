# Frontend event contract

This document defines the browser events emitted by the shared API client.

| Event | When emitted | Consumer action |
|---|---|---|
| `sten-auth-expired` | A protected request returns HTTP 401 (login endpoints are excluded) | Clear authenticated UI state and navigate to sign-in |
| `sten-service-unavailable` | A request fails due to timeout, network failure, or HTTP 5xx while the browser is online | Show a single service-unavailable state; repeated failures are deduplicated |
| `sten-service-restored` | The first successful API response after the client entered unavailable state | Dismiss the unavailable state and refresh stale views if needed |

## Important distinctions

- HTTP 403 with `ORG_ACCESS_CLOSED` means the organization is unavailable; it is **not** an expired authentication session. Keep the token and let the UI explain the organization-access problem.
- Other 403 responses are authorization/scope failures, not authentication expiry.
- HTTP 401 is the only response that triggers `sten-auth-expired` for protected routes.
- The API client owns event emission. Feature pages should listen to these event names, not dispatch competing auth/service events.
- Events carry no payload. Consumers must fetch fresh server state rather than infer details from the event itself.

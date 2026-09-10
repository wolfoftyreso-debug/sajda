# Scoped account REST API

Endpoint: `/api/v1/account`. Every request requires `Authorization: Bearer <scoped-Sajda-key>`. Account identity and environment come from the verified key. Keep keys in server or integration secrets; website cookies and legacy operator search keys are not accepted here. Responses are private and never cached.

| Request | Scope | Input |
| --- | --- | --- |
| `GET ?resource=membership` | `account:read` | No additional fields. |
| `GET ?resource=saved-domains` | `saved:read` | Optional `cursor` from the previous page's `nextCursor`. |
| `POST ?resource=saved-domains` | `saved:write` | JSON `{domain, registrarPrice?, estimatedValue?, confidenceScore?, rationale?}`. |
| `DELETE ?resource=saved-domains` | `saved:write` | JSON `{domain}`. |
| `GET ?resource=trading-status` | `trading:read` | Run status and current access, without candidate details. |
| `GET ?resource=trading` | `trading:read` | Optional integer `offset` (0–10000), `limit` (1–100, default 25). |
| `POST ?resource=trading` | `trading:run` | JSON `{action:"start", requestKey}`. |
| `POST ?resource=trading` | `trading:run` | JSON `{action:"advance", runId}` or `{action:"cancel", runId}`. |
| `POST ?resource=trading` | `trading:quote` | JSON `{action:"refresh_quote", runId, domain, requestKey}`. |

All mutation bodies require `Content-Type: application/json` and are limited to 8 KiB (the underlying Trading action limit is 1 KiB). Extra fields, extra query parameters, arrays in scalar query parameters, arbitrary owner IDs, unsupported actions and malformed UUIDs are rejected. Exact domain search remains at `/api/v1/domains`; account operations are not exposed by the legacy operator key.

Responses preserve the product handler's body and HTTP status. A successful membership response has `{accountId, requestId, membership}`; saved-list responses have `{items, nextCursor, requestId}`. A Trading report includes dated candidates, current run metadata, `totalCandidates` and `nextOffset`; status and mutation responses include run/access metadata without repeating every candidate. Expired membership cannot read a private Trading report. Scopes never substitute for active membership.

Failures have `{code, error, requestId}`. Authentication uses 401 with `WWW-Authenticate: Bearer`; missing scope or entitlement is 403; invalid input is 400; unsupported methods are 405 with `Allow`; provider/database failures are 503. Throttling uses 429 and `Retry-After` when available. Correlation IDs are echoed in `X-Request-Id`. No provider secrets, SQL error messages or credential values are returned.

Start and quote requests require a UUID `requestKey`. Reuse it for retries of the same intended action, including after a timeout. Quote keys are bound to one run and domain. Saves upsert by owner/domain, and removing a missing saved domain succeeds. Each explicit `advance` can perform another work batch; it is not an idempotent status check. Reading membership, lists, status and reports never starts or advances Trading work.

All account integrations share the 120 requests/minute account key limit, and the existing product-specific limits remain active. The database, research engine, membership, saved-domain and quote handlers are the same ones used by the website and [MCP](MCP.md). There are no payment, purchase, automatic buying or billing modification actions.

Example using a configured server secret:

```ts
const response = await fetch(`${process.env.SAJDA_BASE_URL}/api/v1/account?resource=membership`, {
  headers: { Authorization: `Bearer ${process.env.SAJDA_API_KEY}` },
});
const account = await response.json();
if (!response.ok) throw new Error(account.code);
```

Use HTTPS on a configured Sajda deployment. If sending an Origin header, it must match the request's configured host origin. No cross-origin CORS policy is enabled.

# Sajda Developer API

Sajda publishes a small, no-key surface for modest public integrations and a
separate protected route for approved server-side use. They share the same
registry evidence model, but they are intentionally not the same product tier.

## Public API — available now

The stable public domain-search contract is:

```text
POST /api/v1/public/domains
Content-Type: application/json
```

No key, signup, billing flow, or browser credential is required. CORS is
enabled for JSON requests, but the endpoint accepts no cookies and deliberately
rejects an `Authorization` header. A protected key belongs only on a trusted
server and must use `/api/v1/domains` instead.

```sh
curl --request POST "https://YOUR-SAJDA-ORIGIN/api/v1/public/domains" \
  --header "Content-Type: application/json" \
  --data '{
    "query": "calm scheduling for small clinics",
    "tlds": ["com", "dev"],
    "count": 10,
    "locale": "en",
    "creativeMode": "medium"
  }'
```

The public v1 endpoint permits only this strict body schema:

| Field | Rule |
| --- | --- |
| `query` | Optional naming theme, maximum 100 characters. |
| `domains` | Optional list of 1–10 unique, fully-qualified domains using one of the selected audited TLDs. |
| `tlds` | Required list of 1–11 unique supported public TLDs: `com`, `net`, `org`, `app`, `dev`, `ai`, `xyz`, `info`, `biz`, `se`, `nu`. |
| `count` | Optional integer from 1–10; defaults to 10. |
| `locale` | Optional `en`, `sv`, `es`, `fr`, or `zh`; defaults to `en`. |
| `providers` | Optional list of public provider IDs; defaults to `loopia`. |
| `creativeMode` | Optional `light`, `medium`, `heavy`, or `deep`. |

Unknown body properties, missing/unsupported TLDs, duplicate values, and
non-JSON bodies return `400` or `415`; a body above 6 KiB returns `413`.
The public v1 API intentionally
does not accept Swipe, advanced brief analysis, arbitrary criteria, backend-only
providers, provider credentials, or URL/query-string API keys.

The endpoint shares a best-effort, in-memory **6 requests per IP per minute**
budget with Sajda's anonymous search product. It returns `X-Request-Id`,
`X-Sajda-Public-Api-Version`, `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on `429`.
Those limits protect a registry-facing public service; they are not a paid
plan, durable quota, service-level agreement, or usage ledger.

The following public read-only endpoints need no key as well:

```text
GET /api/openapi
GET /api/fact-signals?tld=com&limit=6
```

`/api/domain-search` remains Sajda's broader anonymous **product** endpoint.
It is CORS-enabled for the consumer search UI, but its advanced and Swipe
fields are not the stable public developer contract. New integrations should
use `/api/v1/public/domains`.

## Protected integration API — development and preview

> Neon-backed self-service keys are deployed and verified in development and
> protected preview. The production key migration has not been applied. This
> is not a production rollout or a purchasable API plan.

`POST /api/v1/domains` is a narrow, authenticated domain-search API for trusted server-side
integrations. It uses the same bounded candidate generator, authoritative
registry verification, and transparent provider comparison as Sajda's
anonymous search surface.

The Neon-backed control plane lets verified, signed-in Sajda users create,
list and revoke their own keys through the same-origin developer routes:

```text
GET    /api/developer/api-keys
POST   /api/developer/api-keys       { "name": "Preview service", "scopes": ["domains:search"], "expiresInDays": 90 }
DELETE /api/developer/api-keys?id=<key-uuid>
```

The browser control plane uses the genuine Sajda session cookie and matching
`X-Sajda-Account`; mutations require the same origin. An API key cannot manage
other keys. Native key management uses the authenticated native gateway, not
a fabricated browser cookie or origin.

`POST` returns a 256-bit opaque `sj_live_…` or `sj_test_…` key **once** as
`apiKey`. Copy it straight to the integration's trusted server. The dashboard
never persists the raw key in browser storage; later list responses show only
name, safe prefix, last four characters, scopes, environment, timestamps, and
revocation state. Keys expire after 90 days by default, with a 365-day maximum.
Sajda stores only a SHA-256 digest of the complete raw token in the server-only
Neon table `sajda.developer_api_keys`, protected by RLS with no browser policies.

Use a generated key with `domains:search` for `POST /api/v1/domains` or the
domain tools at `/api/mcp`. Other explicitly selected scopes enable the
documented [account API](./ACCOUNT-API.md) and [MCP tools](./MCP.md); they do not
grant paid membership or billing actions. Do not put a key in a frontend bundle,
source control, URL, analytics event, support ticket, or client-side environment
variable. The control-plane session is not an integration API key.

The machine-readable OpenAPI 3.1 document is available at:

```text
GET /api/openapi
```

The protected search endpoint is:

```text
POST /api/v1/domains
Authorization: Bearer <Sajda API key>
Content-Type: application/json
```

It uses the same strict body schema shown above.

Example:

```sh
curl --request POST "https://YOUR-SAJDA-ORIGIN/api/v1/domains" \
  --header "Authorization: Bearer $SAJDA_INTEGRATION_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "query": "quiet planning tools for teams",
    "tlds": ["com", "dev", "ai"],
    "count": 10,
    "locale": "en",
    "providers": ["loopia", "cloudflare", "spaceship"],
    "creativeMode": "medium"
  }'
```

A response can contain `available`, `taken`, or `unknown`. Only an
authoritative configured registry response can result in `available`; an
`unknown` result is never permission to register or buy a domain. Provider
prices remain separate from availability and are not a checkout quote.

## Required deployment configuration

Development and protected preview use the reviewed migrations under
`db/migrations/`, including `0013_developer_api_keys.sql`. Production migration
and rollout remain pending. Keep preview data isolated from production.
`DATABASE_URL` and `BETTER_AUTH_SECRET` are server-only; browser authentication
uses Sajda's same-origin `/api/auth` service backed by Neon. Do not publish
database credentials or configure a direct Neon browser auth endpoint.
Missing database/key storage fails closed rather than using an in-memory key
or quota fallback.

`SAJDA_API_KEY_HASHES` remains supported only as a server-only legacy fallback
for integrations that were provisioned before the database key flow. It
accepts comma- or newline-separated `client_id:sha256_hex` values and cannot
be created, listed, or revoked from the dashboard. It applies only to the
legacy protected domain-search route, never private account APIs or MCP. New
integrations should use a self-service key in a migrated environment.

## Limits and production boundary

Protected domain search allows **4 requests per account and environment per
minute**, shared across that owner's keys, REST `/api/v1/domains` and MCP domain
tools. Neon stores this fixed-minute bucket durably; changing keys, adapters
or Vercel instances does not reset it. REST returns:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix seconds)
- `Retry-After` on `429`
- `X-Request-Id` on every response

Key-backed API traffic also shares a **120 requests per account/environment
per minute** bucket. Key management has its own **20 requests per minute**
bucket and a maximum of **10 active keys per account/environment**. Expired or
revoked keys cannot authenticate. Storage failures return a safe error rather
than permitting unmetered requests.

These are durable rate limits, not monthly allowances, paid entitlements or a
billable usage ledger. The introductory search allowance remains browser-local;
durable free/account/monthly search quotas are not implemented. The anonymous
public API retains its separate best-effort per-IP limit described above.
Do not sell an SLA or paid API usage plan until usage metering, entitlements,
billing and operations controls are separately implemented. See
[API-PLATFORM.md](./API-PLATFORM.md).

## Local verification

The loopback QA server (`npm run serve:qa`, default port 8095) executes the real
Vercel handlers, including both developer search routes:

```text
http://127.0.0.1:8095/api/v1/public/domains
http://127.0.0.1:8095/api/v1/domains
```

The public route needs no key. Real key lifecycle tests require the development
Neon database, reviewed migrations and genuine verified account sessions.
The separate legacy full-app server's loopback-only, in-memory key harness is
not evidence of persistent-key or deployed Vercel behavior.
The anonymous `/api/local-search` route stays loopback-only and unauthenticated;
enabling a v1 key does not widen that local route.

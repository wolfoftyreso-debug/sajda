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

## Protected integration API — Neon migration pending

> The self-service API-key flow is being moved to Neon-backed Vercel APIs.
> It is not available to new accounts until Neon Auth, ownership checks and
> durable key storage are deployed together. The route documented below is
> retained as a compatibility contract, not as a live self-service promise.

`POST /api/v1/domains` is a narrow, authenticated domain-search API for trusted server-side
integrations. It uses the same bounded candidate generator, authoritative
registry verification, and transparent provider comparison as Sajda's
anonymous search surface.

The future Neon-backed control plane will let signed-in Sajda users create,
list and revoke their own keys through the same-origin developer routes:

```text
GET    /api/developer/api-keys
POST   /api/developer/api-keys       { "name": "Production service" }
DELETE /api/developer/api-keys?id=<key-uuid>
Authorization: Bearer <Neon Auth session>
```

`POST` returns a 256-bit opaque `sj_live_…` or `sj_test_…` key **once** as
`apiKey`. Copy it straight to the integration's trusted server. The dashboard
never persists the raw key in browser storage; later list responses show only
name, safe prefix, last four characters, scope, timestamps, and revocation
state. Sajda stores only a SHA-256 digest of the complete raw token in a
server-only table protected by RLS with no browser policies.

Use the generated token only with `POST /api/v1/domains`. Do not put it in a
frontend bundle, source control, URL, analytics event, support ticket, or
client-side environment variable. The control-plane session is not a
substitute for an integration API key.

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

Provision Neon through the Vercel Marketplace, then apply the provider-neutral
migrations under `db/migrations/` to an isolated preview branch before
Production. `DATABASE_URL` is server-only. Neon Auth provides the signed-in
session; `VITE_NEON_AUTH_URL` may expose only the public auth endpoint, never
the database URL or password. The self-service key route stays disabled until
this complete server-side path is verified.

`SAJDA_API_KEY_HASHES` remains supported only as a server-only legacy fallback
for integrations that were provisioned before the database key flow. It
accepts comma- or newline-separated `client_id:sha256_hex` values and cannot
be created, listed, or revoked from the dashboard. New integrations should
use a self-service key.

## Limits and production boundary

The protected Domains API allows **4 requests per key per minute** and returns:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix seconds)
- `Retry-After` on `429`
- `X-Request-Id` on every response

Creation is additionally limited to **5 keys per signed-in user per hour** and
**10 active keys per user**. Key creation/revocation is real; it is not a
billing, registrar, marketplace, or transfer endpoint. The search limiter is
still process-local and intentionally conservative, not a durable billable
usage quota: Vercel instances do not share memory. Do not sell an SLA or paid
usage plan until durable usage metering, entitlements, billing, webhooks, and
operations controls are separately implemented. See `docs/API-PLATFORM.md`.

## Local verification

The local server exposes both developer search routes at:

```text
http://127.0.0.1:8095/api/v1/public/domains
http://127.0.0.1:8095/api/v1/domains
```

The public route needs no key. On `127.0.0.1`, the full-app server also exposes
a **loopback-only, in-memory `sj_test_…` key harness** at
`/api/developer/api-keys`. It stores only hashes, supports the same
list/create/revoke contract, works with local `/api/v1/domains`, and erases every
test key when the process restarts. It is deliberately unavailable to remote
clients and is not a substitute for the future Neon-backed user key control
plane. `SAJDA_API_KEY_HASHES` can still test legacy protected keys locally.
The anonymous `/api/local-search` route stays loopback-only and unauthenticated;
enabling a v1 key does not widen that local route.

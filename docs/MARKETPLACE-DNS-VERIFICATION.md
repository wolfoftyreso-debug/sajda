# Marketplace DNS-TXT verification

> Status: **not live.** This is the former Supabase-based verifier contract,
> retained as design input for the Neon/Vercel replacement. Do not configure
> its credentials or expose the endpoint in a new deployment.

`POST /api/marketplace/verify-domain` is Sajda's server-side DNS-TXT control
check for a seller's domain listing. It is not a registrar integration, DNS
proxy, transfer service, payment endpoint, credential vault, or public API.

The browser first creates a marketplace listing and requests a proof through
the authenticated Supabase RPC. That returns a short-lived record name and
token to the seller. Once the seller has added the token, the browser may call
this same-origin route with its Supabase access token. The route reads the
proof and its listing itself, resolves only the stored
`_sajda.<listed-domain>` TXT record, and compares the complete TXT value to
the issued token. It never accepts a hostname, a DNS server, a token, a
registrar login, or a transfer code from the request.

## Vercel configuration

Set these **server-only** Vercel Project Environment Variables for every
environment that has marketplace verification enabled:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` must never use a `VITE_` prefix and must never be
placed in `.env` files committed to the repository, browser configuration, or
client-side logs. The route validates the seller's bearer session with this
server-only client and invokes the service-role-only
`record_marketplace_domain_control_result` RPC.

The browser still needs its separately scoped public configuration when sign-in
is enabled:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Apply the marketplace migration before exposing this endpoint:

```text
supabase/migrations/20260825120000_marketplace_domain_listings.sql
```

The shared `consume_function_rate_limit` migration must also be present:

```text
supabase/migrations/20260820173000_production_hardening.sql
```

`vercel.json` gives the function a ten-second execution budget. Place a Vercel
WAF rule in front of the deployment as a coarse additional abuse control.

## Request contract

```http
POST /api/marketplace/verify-domain
Content-Type: application/json
Authorization: Bearer <seller-supabase-access-token>

{ "proofId": "11111111-2222-4333-8444-555555555555" }
```

The body is limited to 1 KiB and accepts exactly one field: `proofId`. The
bearer token is required. This route does not send CORS headers: it is a
same-origin seller workflow, not a third-party client integration.

Success returns `200`:

```json
{
  "verified": true,
  "listingStatus": "active",
  "message": "Domain control verified. The listing is now active.",
  "requestId": "req_example"
}
```

If DNS is still propagating or the exact token cannot yet be observed, the
challenge remains open and the route returns `202` with
`code: "dns_not_ready"`. It does **not** reject a seller just because a
resolver has not caught up.

Errors are JSON with a machine-readable `code` and a server-generated
`requestId`; the same request ID is also returned in `X-Request-Id`. Important
responses are:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid_request` | Bad JSON or anything other than one UUID `proofId` |
| `401` | `authentication_required` / `invalid_session` | Missing or invalid seller bearer session |
| `404` | `proof_not_found` | Proof does not belong to the authenticated seller, or does not exist |
| `409` | `proof_not_pending` / `listing_integrity_error` / `verification_state_changed` | The stored proof/listing is no longer eligible to verify |
| `410` | `proof_expired` | The short-lived challenge expired and is recorded as expired |
| `429` | `rate_limited` | Four verification attempts per seller per five minutes; `Retry-After` is supplied |
| `503` | `marketplace_verifier_unavailable` / `dns_unavailable` | Server configuration, database rate limiter, or DNS resolver is unavailable |

The only public outcome of an exact token match is a call to
`record_marketplace_domain_control_result` with `p_verified: true` and
`p_publish: true`. No automatic purchase, payout, registrar transfer, or
credentials exchange is part of this endpoint.

## Test and deployment checks

```sh
npm run check:vercel
npm run build:vercel
```

Use a protected Vercel Preview or `vercel dev` with non-production Supabase
credentials for an end-to-end DNS test. The loopback full-app server is for
the public search experience and does not hold a Supabase service-role key;
it intentionally does not emulate marketplace verification.

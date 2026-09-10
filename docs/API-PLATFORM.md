# Sajda domain-search API platform — security architecture

> Current storage is Neon behind Vercel Functions. Do not provision or extend
> the retired Supabase implementation; see [NEON-VERCEL.md](./NEON-VERCEL.md).

Status: **Neon self-service keys are deployed and verified in development and
protected preview; production key migration and paid API billing are not
complete.** Verified Sajda account owners can create, list and revoke scoped
server-side keys for REST and MCP. Protected search uses a durable Neon
account/environment rate limit shared across both adapters. Sajda also
publishes a no-key contract at `POST /api/v1/public/domains` with a separate
best-effort per-IP limit. Neither surface is a paid developer plan, monthly
allowance or billable usage ledger. The consumer routes
(`/api/domain-search` and `/api/deep-review`) remain anonymous product
features and must not be relabeled as paid access.

This document defines the boundary required before Sajda can sell API access to
domain search or Deep Review. It intentionally does not cover registrar account
credentials, domain transfer, payment-card storage, or any marketplace custody
flow.

## Current baseline and gap

| Area | Present now | Required for a paid API |
| --- | --- | --- |
| Vercel search | Anonymous per-instance IP throttles; protected REST/MCP searches share a durable 4-per-minute account/environment bucket | Agreed plan-period limits, metering and audit before paid API access |
| Private workspace | Verified same-origin cookie or native session; scoped API keys enter allowlisted shared handlers through trusted internal delegation | Preserve current owner and feature-entitlement checks across every adapter |
| Billing | Trading commerce code exists; no paid developer API product or usage billing is activated | A separately reviewed API billing/entitlement design and lifecycle verification |
| API keys | Neon digest-only storage, one-time display, exact scopes, expiry/revocation, verified ownership and environment binding | Immutable audit events and any explicitly approved organisation/plan model |
| Usage | Durable account/environment API request and domain-search minute buckets | Account free/monthly entitlements and immutable billable usage events, if activated |

The public engine's in-memory rate-limit maps remain best-effort because
serverless instances do not share memory. Protected REST/MCP additionally use
the durable Neon buckets; these still are not monthly quotas or billing
records. The one-search browser trial uses local storage, not an enforceable
account allowance. Durable free/monthly quotas remain an implementation gate.

## Product boundary

The versioned surface distinguishes a no-key public contract from a protected
integration preview:

```text
POST /api/v1/public/domains      published, anonymous and strictly bounded
POST /api/v1/domains             authenticated server-side key
POST /api/mcp                    scoped Streamable HTTP MCP, not an ordinary REST operation
GET/POST/DELETE /api/v1/account  scoped, allowlisted account operations
GET/POST/DELETE /api/developer/api-keys  signed-in user key control plane
POST /api/v1/deep-reviews        planned, machine-to-machine
GET  /api/v1/usage               planned, authenticated key metadata only
```

`/api/v1/public/domains` uses the consumer route's conservative per-IP,
per-runtime registry budget. It accepts no `Authorization` header, has no
customer identity, and exposes no account data. It is deliberately safe to use
from a browser, but it is not a substitute for a paid service.

`/api/v1/domains` is a protected server-to-server domain-search contract, not a customer-paid
API: it has self-service key creation, expiry and immediate revocation, but no
API plan, monthly entitlement or billable usage ledger. The dashboard uses a
verified same-origin Sajda cookie session backed by Neon; native management
uses the native session gateway. Generated keys authenticate protected REST
and MCP calls, not the key-management endpoint. Existing anonymous routes
remain public product routes with their own conservative limits. Private
saved-domain and Trading operations retain their actual owner/membership
checks; possessing a scope does not create a feature entitlement.

Use an explicit API version in both the path and response contract. Return a
request ID (`X-Request-Id`) on every response and an ISO-8601 `checkedAt` value
for registry/price evidence. Availability, price, trademark and ownership
claims retain the current Sajda semantics: `unknown` is never converted to
`available`, and a screening signal is not a purchase recommendation.

## API-key lifecycle

### Format and one-time display

Use opaque, random customer secrets, not user names, tenant names, or JWTs.
The live key format is:

```text
sj_live_<public-key-id>_<32-byte-random-secret>
sj_test_<public-key-id>_<32-byte-random-secret>
```

- `sj_live` and `sj_test` make environment mistakes visible and allow preview
  traffic to be isolated.
- Generate the key ID and secret with a cryptographically secure server-side
  RNG. The key ID is only a lookup handle; it is not authorization.
- Reveal the complete value once, immediately after creation, over HTTPS. The
  dashboard stores and later renders only the prefix, last four characters,
  name, creation/last-use/expiry/revocation timestamps, and scopes.
- Never return a raw key in a list endpoint, audit record, error, email,
  analytics event, support export, or client-side storage.

### Hash, verify, rotate, revoke

The current implementation stores a SHA-256 digest of the complete 256-bit raw
key and no recoverable secret. Authentication parses the environment/key-ID
segments, reads one server-only row, computes the candidate digest, and uses a
constant-time comparison. It does not scan every key or decrypt a stored key.
The random secret is sufficiently high entropy that a database hash is not a
practical offline recovery path.

Revocation is an immediate server-side `revoked_at` state change. A replacement
key may overlap the old one briefly while an integration is updated. A future
rotation release may add a server-only keyed verifier/HMAC version and immutable
audit events without changing the one-time-display promise.

## Tenants, plans, quotas, and usage

The current `sajda.developer_api_keys` and `sajda.developer_api_quotas` Neon
tables are RLS-enabled with no browser policies and revoked public grants.
Only server-side database connections access them; no raw key is stored.
The quota primary key is environment, hashed owner and bucket. PostgreSQL
atomically applies a fixed-minute **4 domain searches** limit, shared across
all of an owner's keys and REST/MCP calls, plus **120 API requests per minute**.
Key management uses a separate **20-per-minute** bucket and permits at most
**10 active keys per account/environment**. Rotation or a different Vercel
instance cannot reset these buckets; unavailable storage fails closed.

This implements rate control, not a lifetime free-search balance, monthly plan
allowance or paid API entitlement. Neither the price catalog nor key creation
grants those capabilities. Any future commercial model needs explicit product
approval before implementation.

Previously proposed paid-API model, not a description of deployed tables or
an approved new pricing model:

| Record | Responsibility |
| --- | --- |
| `tenants` | Organisation identity, owner, status, Stripe customer ID, created timestamps |
| `tenant_members` | User-to-tenant role (`owner`, `admin`, `developer`, `viewer`) |
| `api_plans` | Server-authored plan code, per-operation quota and rate policy, feature flags |
| `subscriptions` | Stripe IDs, state, billing period, entitlement version; written only by webhook processor |
| `api_keys` | Tenant, public key ID, verifier/hash version, scope, expiry, revoke/last-use metadata; never a raw secret |
| `api_usage_events` | Immutable accepted/rejected metering record with tenant/key/operation/request ID/units/status |
| `api_idempotency` | Tenant + route + caller-provided idempotency key + request digest + stored response reference |
| `api_audit_log` | Security-relevant actions such as key created/revoked, plan change, webhook received, and access denied |

Keep `api_plans` and final subscription entitlements server-owned. A browser
may request Checkout but cannot select arbitrary limits or set `paid=true`.
For every accepted billable call, run a single transaction/RPC that:

1. resolves active key, tenant, scope, and entitlement;
2. applies the per-key and per-tenant rate bucket;
3. increments the period quota only if it remains within the plan;
4. writes one immutable usage event; and
5. returns the remaining quota and reset time.

The meter must fail closed when the authoritative store is unavailable. It is
fine for an anonymous product search to be unavailable; it is not acceptable to
silently give a paying key unlimited service because the quota store timed out.

## Authentication and authorization

| Actor | Authentication | Authorization |
| --- | --- | --- |
| Browser dashboard | Same-origin Sajda cookie session backed by Neon | Fresh verified owner, matching account header and same-origin mutation checks; safe key metadata only |
| Native app | Account-bound native session | Allowlisted native gateway and trusted internal delegation; no API-key management via an integration key |
| Customer server/CLI/MCP client | `Authorization: Bearer sj_live_…` or `sj_test_…` | Active, unexpired key; exact scope; owner/environment binding; shared quota; underlying private-feature checks |
| Billing provider | Raw request + verified Stripe signature | Event allowlist and idempotent event store; never browser origin/session |
| Internal operator | Separate admin identity and audited elevated role | Least privilege; no shared super-key or production customer-key export |

Require a domain-search scope and review-specific scopes per operation. Do not
accept a Supabase publishable/anon key, a service-role key, an OpenAI key, a
registrar credential, or a Stripe credential as a Sajda customer credential.
Database credentials and application/provider secrets remain server-only;
none is interchangeable with a generated Sajda integration key.

## Billing boundary for any future paid API

Stripe Checkout / Billing creation belongs in a server endpoint authenticated
by the dashboard session. Price IDs, customer IDs, and plan mapping are
server-controlled. A return URL or success page is informational only; it must
not enable an entitlement.

Create a dedicated webhook route, separate from public search and customer API
routes. It must:

1. accept the raw body, `POST` only, over HTTPS;
2. verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` before parsing or
   performing a state change;
3. atomically persist the verified provider event with a unique Stripe event
   ID, then project the subscription/entitlement exactly once; and
4. return a fast `2xx` after durable receipt, with retries/reconciliation for
   failed projection.

Handle the narrow event set needed for the product, such as completed checkout,
subscription updates/deletions, paid invoices, and failed payment status. Use
the subscription/customer object from Stripe as the source of billing truth;
do not trust client redirects or client-submitted plan IDs. Stripe requires the
raw request body for signature verification and recommends its official
libraries for that work: [Stripe webhooks](https://docs.stripe.com/webhooks).
Stripe also supports idempotent API requests; use a server-generated
idempotency key for Checkout/session creation and store the associated local
intent: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

The repository already contains the Stripe dependency and
`/api/billing-webhook` for Trading commerce. Their presence does not activate
API billing, monthly search quotas or production payments. Do not advertise a
paid API until its own approved contract, migrations, usage metering and
billing lifecycle review are complete.

## Rate limits, idempotency, and audit

- Preserve the current durable owner/environment limits across REST and MCP.
  Any future per-key or organisation limiter must not let key rotation bypass
  the owner limit. Coarse Vercel/WAF protection is additional; do not rely on
  `x-forwarded-for` as customer identity.
- Return `429` with `Retry-After`, a machine-readable error code, and request
  ID. Never disclose whether an unknown key ID exists.
- For write-like or billable POSTs, require `Idempotency-Key`. Store a digest of
  method + route + canonical request body. Reuse with the same digest returns
  the original result; reuse with a different digest returns `409`.
- Generate audit entries from trusted server context: tenant/key ID, actor,
  route, outcome, request ID, policy version, timestamp, and bounded usage
  units. Redact `Authorization`, raw keys, webhook payload secrets, card data,
  and unneeded search text. Define retention/deletion policy before launch.
- Keep a stable incident path: revoke key, disable tenant, replay a saved
  verified Stripe event, and reconcile usage without touching raw secrets.

## Vercel and secrets

Use separate **Development**, **Preview**, and **Production** environments:

| Environment | Customer key prefix | Billing | Data / review expectation |
| --- | --- | --- | --- |
| Development | `sj_test` only | Stripe test data only, if enabled later | Local fixtures and non-production database |
| Preview | `sj_test` only | Never live charges | Protected preview plus isolated test webhook/database |
| Production | `sj_live` only | Live Stripe only after release gate | Production database, production webhook, monitored rollback |

Store `DATABASE_URL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, AI-provider keys and registrar credentials only as
server-side project environment variables. The current database key verifier
does not require a separate HMAC secret because keys use 256-bit random
secrets and SHA-256 digest-only storage.
Never use a `VITE_` prefix for them; Vite compiles `VITE_*` values into the
browser bundle. Vercel environment variables are scoped to Development,
Preview, and Production and require a new deployment to take effect; see
[Vercel environment variables](https://vercel.com/docs/environment-variables).

Protect preview deployments, use separate Stripe test/live credentials and
webhook endpoints, and never point a preview build at the production paid-API
database. Vercel's preview/production environment model is described in
[Vercel environments](https://vercel.com/docs/deployments/environments).

## Release gates

Do not launch paid API access until all gates pass:

1. Reviewed migrations create private tenant/usage/billing tables with
   least-privilege grants and RLS where dashboard access is required.
2. The live key flow continues to show raw value once, store only a verifier,
   support revocation, and pass key lifecycle/security tests.
3. `/api/v1` contract tests cover invalid/malformed/revoked/expired/wrong-env
   keys, scope denial, quota exhaustion, and no secret in log/error output.
4. Durable rate-limit/quota and idempotency tests pass under concurrency.
5. Stripe test-mode webhook signature, replay, duplicate, out-of-order, and
   failed-payment tests pass; production uses distinct webhook and secret.
6. Vercel Preview is protected and uses test-only secrets. Production deploy is
   reviewed, monitored, backed up, and has an explicit rollback path.
7. Registrar and AI data use is contractually permitted, rate-bounded, and
   accurately represented in the developer contract.

Until then, the safe product statement is: Sajda has an anonymous search app
and a **preview developer-contract foundation**, not a purchasable API.

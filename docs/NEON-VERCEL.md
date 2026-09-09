# Neon + Vercel architecture

Sajda's control plane is **Vercel**. The frontend, same-origin API, self-hosted
Better Auth 1.7.3 server, deployments, environment settings and runtime logs
belong to the existing Vercel project. Postgres is the Neon Marketplace resource
managed through Vercel; this does not require a separately managed Neon project.
Supabase and the external managed Neon Auth service are not the active runtime.

```text
React/Vite → same-origin /api/* → Vercel Node Functions → Neon Postgres
                                   ├─ Better Auth → account/session tables
                                   ├─ account email → Resend HTTP API
                                   └─ brief/review → Vercel AI Gateway (OIDC)
```

The browser never receives a database connection, server secret or Resend key.
Authentication is a first-party, HTTP-only cookie flow, not a browser JWT flow.

## Current environment status

The operator confirmed "allt i vercel" on 2026-09-08. `hypbit/sajda` uses the
existing `sajda-postgres` Free resource in Frankfurt, connected to Preview and
Development. On 2026-09-09, a separate `sajda-production` Free resource was
provisioned through Vercel for Production only (`damp-violet-87929357`). All nine
migrations, `0000` through `0008`, are applied to both resources. The new production
database has no accounts, billing customers or Plus grants; no pilot data was copied.
Production has a separately generated Sensitive auth secret. This infrastructure
setup is not a production release approval: email and sandbox payment gates remain.
Per-deployment database-branch isolation must be verified separately; a resource
attached to both Preview and Development is not proof of isolated branches.

The new `0002_vercel_auth.sql` migration has been applied to the existing
preview/development-connected database. It adds five `public.sajda_auth_*`
tables alongside the earlier application schema. Independently generated
`BETTER_AUTH_SECRET` values are configured for Preview and Development. Preview
is marked Sensitive; Development uses Vercel's readable development setting
(`--no-sensitive`), as required for that environment. The values are distinct.
Neither is a Production secret; do not copy either into Production.

The [account-tested preview](https://sajda-le2vto5x8-hypbit.vercel.app) is READY and its
account APIs have been exercised over deployed HTTP. See the
[account verification record](VERCEL-ACCOUNT-VERIFICATION-2026-09-08.md) for the
exact test scope and remaining release gates.

AI now uses Vercel AI Gateway with OIDC, an atomic Neon allowance and a project
budget. See [Gateway deployment and verification](VERCEL-AI-GATEWAY-2026-09-08.md)
for the latest preview, actual provider tests and configuration boundaries.

Resend credentials and a verified sender domain have **not** been configured.
Signup, password-reset requests and verification resend therefore fail closed
with `503 email_not_configured`. Public domain search remains usable. No real
account email has been delivered or verified, and this is not a full release GO.

Contact messages target `dev@hypbit.com`; account recovery remains private to the
account owner. See [Resend and contact setup](RESEND-CONTACT.md) for the sender
prerequisites, existing Hypbit DNS observations and verification boundaries.

## Environment configuration

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel Functions only | Pooled Neon runtime connection |
| `DATABASE_URL_UNPOOLED` | Migration/admin process only | Direct connection for controlled migrations |
| `BETTER_AUTH_SECRET` | Server only; environment-specific, Sensitive in Preview | Better Auth signing/encryption secret; at least 32 characters |
| `BETTER_AUTH_URL` | Optional server configuration | Explicit approved application origin, not an external auth-service URL |
| `RESEND_API_KEY` | Server only; sensitive | Transactional email delivery credential |
| `SAJDA_EMAIL_FROM` | Server configuration | Valid sender mailbox, optionally with display name, on a verified sending domain |

Generate each auth secret from 48 cryptographically random bytes, store it in
the selected Vercel environment and never print or commit it in operational
notes. Redeploy after changing environment configuration. The build derives
`VITE_ACCOUNT_AUTH_ENABLED` from a nonempty database URL and a sufficiently long
server secret; a manually set public flag cannot enable an unconfigured server.
This build gate is not a database-connectivity or email-delivery test.

Vercel deployment metadata supplies the exact deployment and branch origins via
`VERCEL_URL` and `VERCEL_BRANCH_URL`. The production project URL is admitted only
in the Production environment. `BETTER_AUTH_URL` can add an explicit HTTPS
origin; it must not contain credentials, a non-root path, query or fragment.
Origins are not inferred from an arbitrary request host and there is no wildcard
preview-origin allowance. A new alias/custom domain needs explicit approved
configuration if it is not supplied by the deployment metadata.

Outside Vercel, development may use its own secret, isolated database and an
exact `http://127.0.0.1:<port>` or `http://localhost:<port>` origin through
`BETTER_AUTH_URL`. HTTP loopback exceptions are disabled in Vercel. Match the
chosen hostname and port consistently in the browser and local API runtime.

Legacy `NEON_AUTH_BASE_URL` or browser URL settings may still exist in old
environments, but are not used by the current account server. The Vercel build
explicitly blanks `VITE_NEON_AUTH_URL`, legacy Supabase browser credentials and
known browser-prefixed database/auth/email secrets. `NEON_AUTH_COOKIE_SECRET`
is not used. Do not configure the external Neon Auth service for this flow.
Build sanitization is defense in depth, not permission to create `VITE_` secrets.

## Identity, sessions and saved-domain authorization

`/api/auth/*` routes to the Vercel-hosted Better Auth handler. The app exposes
only the required signup, signin, signout, session, verification and password
recovery actions. Better Auth owns password hashing and token lifecycle; this
implementation is not a custom password verifier.

- Passwords require 12–128 characters. Signup requires email verification and
  does not automatically sign the user in. Verification links expire after one
  hour; reset links expire after 30 minutes. Reset revokes existing sessions.
- Sessions last up to seven days, with a one-day update interval. Cookies are
  HTTP-only, SameSite=Lax and Secure on HTTPS. Session cookie caching is disabled.
  Auth JSON responses strip raw session tokens and sensitive session metadata.
- Saved-domain APIs validate the current database-backed session, its expiry,
  identity and verified email before accessing account data. Logout/revocation
  is not governed by a cached browser JWT's remaining lifetime.
- Reads, upserts and deletes filter by the authenticated account ID. Repeated
  saves/deletes are idempotent; reads use keyset pagination.
- `X-Sajda-Account` pins a request to the initiating account and must match the
  server-verified user. This header is an identity-switch race guard, **not** an
  authentication credential. Browser account changes cancel pending work and
  discard stale responses so one account's list cannot populate another's view.
- Mutations require the exact same origin and reject cross-site requests.
  Approved origins come from server configuration, not user-controlled input.
- Database-backed auth rate limits cover login, signup and email requests.
  Logs expose safe event/correlation information, not passwords, tokens, reset
  links, connection strings or provider response bodies.

Saved availability, prices and valuations remain historical snapshots, not a
promise of current availability or a commercial entitlement. This account slice
does not finish billing, paid entitlements, background monitoring, marketplace
persistence, search history or owned-domain management.

## Transactional account email

`api/_shared/account-email.ts` sends Swedish verification/reset messages using
Resend's HTTPS API. It renders both plain text and escaped HTML, validates the
recipient and action URL, refuses redirects, applies a ten-second timeout, and
uses a hashed idempotency key rather than exposing the token in a header.
Action links must use HTTPS, except for local loopback outside Vercel.

Missing or invalid key/sender configuration never produces a false delivery
success. A provider failure becomes a controlled error without leaking its raw
response or link token. A successful provider response means accepted delivery,
not proof that the message reached the user's inbox.

Before enabling public signup, select the real sending domain, verify it with
the provider, configure the server-only key and sender in the intended Vercel
environment, redeploy and inspect received verification and reset messages.
Test the links on that actual deployment and verify the resulting account state.
Do not substitute captured test links for this delivery gate. Native Marketplace
provisioning is an available Vercel-managed route, but no Resend provisioning or
DNS changes have been performed as part of this documentation update.

## Database and migrations

The auth runtime uses a bounded `pg.Pool` against the pooled Neon URL with
`sslmode=verify-full`, including certificate verification. Do not pass a startup
`options=-c search_path=...` setting to this pool: Neon transaction pooling rejects
that startup parameter. Better Auth uses the verified default `public` schema
and explicit `sajda_auth_*` model names instead.

Initial migration sequence (the current complete ledger is `0000`–`0008`):

1. `0000_neon_foundation.sql`: application schema and migration foundation.
2. `0001_saved_domains.sql`: saved-domain persistence.
3. `0002_vercel_auth.sql`: `public.sajda_auth_user`, `sajda_auth_session`,
   `sajda_auth_account`, `sajda_auth_verification` and `sajda_auth_rate_limit`.

Auth tables enforce ownership foreign keys, unique user email/session tokens,
provider-account identity and rate-limit keys, with relevant lookup indexes.
RLS is enabled and `PUBLIC` has no privileges. The server role must be the table
owner or an explicitly privileged role; these are not browser-accessible Data
API tables. Keep this role and its credentials exclusively on the server.

Applied migrations are immutable. The JWT-related comment in `0001` records
the architecture at the time that migration was applied; it is now historical.
**Do not edit that file to update the comment:** doing so changes its recorded
checksum. Describe the current flow here and make future schema changes through
a new forward migration. Do not rewrite existing user or saved-domain records
merely to change terminology.

The historical `supabase/` directory must not be applied to Neon. It contains
Supabase-specific auth, RLS, Edge Functions, Realtime and cron helpers.

### Controlled migration tool

```sh
# Local file/checksum inspection only; no database connection.
node scripts/migrate-neon.mjs --plan

# First verify DATABASE_URL_UNPOOLED targets the intended isolated branch.
node --env-file-if-exists=.env.local scripts/migrate-neon.mjs --check
node --env-file-if-exists=.env.local scripts/migrate-neon.mjs --apply
node --env-file-if-exists=.env.local scripts/migrate-neon.mjs --check
```

`--check` is read-only. `--apply` is explicit, uses a transaction and advisory
lock, and records each filename/checksum in `sajda.schema_migrations`. Changed
or unknown applied migrations, out-of-order history and unchecked legacy ledgers
stop the run. The web build does not automatically apply migrations.

Confirm branch identity before any database mutation. Managed integration
webhooks can supply branch-specific deployment connections which may differ
from values returned by a generic `vercel env pull`. Never substitute Production
because its connection is available locally. Establish production isolation,
account retention/deletion and expired rate-limit record pruning before launch.

## Verification evidence and release gates

Historical 2026-09-08 account evidence: the local integration harness passed 27 checks against the selected
real preview/development Postgres resource. The subsequent preview integration
run also passed 27 combined checks: **19 real deployed account HTTP checks plus
8 local setup/reset/rate-limit checks** against the same database. The deployed
route/API smoke suite passed 48 checks; the final automated suite passed 87 tests.
The Vercel build/deployment is READY, database health returned HTTP 200 connected,
and runtime logs were inspected. Dedicated QA fixtures were removed.

Verification and reset links were captured only by an injected CLI test-email
sink, not delivered by Resend or to an inbox. Local signup/verification/reset
checks are not presented as deployed email journeys. The
[2026-09-08 account verification record](VERCEL-ACCOUNT-VERIFICATION-2026-09-08.md)
contains the precise local/deployed split, browser observations and repaired
runtime defects. The sender domain is still awaiting the operator's choice;
Production is now separately connected and migrated as described above, but
remains unapproved for launch until the external communication and commerce gates pass.

Required before approving the account release:

- Verify the intended preview database branch and its separation from Production.
- Preserve the passed preview deployment, `/api/health`, migration and runtime
  checks, and rerun them after any configuration or implementation changes.
- Exercise signup, real received verification email, login and password reset
  on the deployed origin, including a failed/expired link and safe retry.
- Exercise save/return/delete with two verified accounts, refresh, logout and
  rapid account switching; reject missing, expired and foreign sessions.
- Verify same-origin rejection, auth rate limits, duplicate requests and safe
  provider failure without raw secrets in logs or responses.
- Test desktop/mobile browsers and navigation with real first-party cookies.
- Configure and verify Production separately before promotion. Mail, billing,
  entitlement and other commercial gates remain distinct requirements.

## Historical investigation

The [2026-09-08 connection ledger](VERCEL-NEON-CONNECTION-2026-09-08.md) is retained
as evidence of the initial Marketplace connection, two initial migrations and
the then-deployed public API checks. Its managed Neon Auth `INVALID_ORIGIN`,
external account-linking and JWT observations describe a **superseded auth
implementation**, not requirements of the current self-hosted Better Auth flow.
Its migration counts and deployment URL are point-in-time facts, not a current
release certification. Do not alter that history to make old checks appear to
have tested the new implementation.

## Primary references

- [Vercel Postgres integrations](https://vercel.com/docs/postgres)
- [Managed Vercel integration and preview branching](https://neon.com/docs/guides/vercel-managed-integration)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Sending email from Vercel](https://vercel.com/kb/guide/sending-emails-from-an-application-on-vercel)
- [Resend Vercel Marketplace integration](https://resend.com/docs/guides/vercel-marketplace-integration)

The repository's pinned Better Auth version and current `api/_shared/account-*`
implementation are the source of truth for the behavior documented above.

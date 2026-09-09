# Vercel-hosted accounts — verification 2026-09-08

## Scope and verdict

**Account infrastructure: verified on Preview. Public registration: blocked by email configuration. Production launch: NO-GO.**

Operator decision: frontend, APIs, authentication and sessions run in the existing
`hypbit/sajda` Vercel project. PostgreSQL is the existing Vercel-managed Neon
Marketplace resource `sajda-postgres` (`spring-paper-89655503`), not Supabase.
The external managed Neon Auth service is no longer used by this build.

Preview: https://sajda-le2vto5x8-hypbit.vercel.app

Deployment: `dpl_3xdRXpaJw8kAH5izQx4B3Xn2jEGi`, READY, runtime region `fra1`,
target `null` (Preview). No production promotion or production database connection.

## Implemented

- Better Auth 1.7.3 hosted by one Vercel Node Function at `/api/auth/*`.
- Existing pooled Postgres connection; five application-owned `sajda_auth_*`
  tables added by transactional migration `0002_vercel_auth.sql`. All three
  migration checksums verified after application; no pending migration.
- Server-only signing secrets configured separately for Preview and Development.
  Preview secret is marked Sensitive. No browser database or signing secret.
- Secure, HttpOnly, SameSite=Lax, host-only session cookies in Preview. No
  session token in JSON responses, browser localStorage or Bearer transport.
- Server-side current-session lookup for saved domains; logout and password
  reset revoke access. Verified email remains mandatory. Client-supplied account
  ID is only a race guard and cannot authorize another user's records.
- Strict deployment-origin validation and same-origin mutation guards. JSON
  and request-size limits, owner-scoped SQL, idempotent saves/deletes, database
  rate limiting, safe correlation IDs and controlled errors.
- Genuine Resend HTTP adapter with Swedish verification/reset messages, timeout,
  idempotency and controlled failure handling. Provider credentials and a verified
  sender are **not configured**. Signup/reset-request/resend endpoints return
  `email_not_configured` before creating an account or claiming an email was sent.
- Frontend uses the same-origin Better Auth SDK. New-password UI and server both
  require 12–128 characters. Email-configuration feedback is localized in five
  languages. Public search remains usable without an account.

## Actual evidence

| Layer | Result |
| --- | --- |
| Full local quality command | Lint, app/server TypeScript, SEO policy, browser/DB boundary, Node syntax, Vercel TypeScript, UI contracts passed |
| Final automated tests | 87 passed, 0 failed |
| Local production build | Passed; emitted bundle forbids external Neon Auth/Supabase connections and public server credentials |
| Vercel build and deployment | Passed; preview inspected through Vercel API |
| Dependency audit | 0 reported vulnerabilities; this is not a complete security guarantee |
| Local handler + real Postgres integration | 27 checks passed |
| Preview account integration run | 27 combined checks: 19 real deployed HTTP checks, 8 local setup/reset/rate-limit checks against the same preview Postgres |
| Deployed route/API smoke checks | 48 passed; database health HTTP 200, connected |
| Browser | Actual preview login/signup UI rendered without initial console errors; signup showed the truthful missing-email message, not a false verification success |
| Cleanup | Dedicated QA users, credentials, sessions and saved rows removed; final counts for each of those tables were zero |

The account integration runs create two unique `@example.test` QA identities.
Verification and reset links are produced by the real auth library but captured
only in CLI process memory by an injected mail callback. No public test bypass
exists, and no inbox delivery is claimed.

The 19 deployed checks cover anonymous denial, two verified-user logins, cookie
restoration, save/upsert, persistence, cross-user reads and deletes, account-change
rejection, forged ownership, cross-origin denial, logout, replayed revoked cookie,
returning login, saved-state retention, post-reset session denial and old/new
password behavior. Signup/verification, reset execution and concurrency limiter
checks used local handlers against real Postgres; they were not represented as
deployed email journeys.

## Runtime defects discovered and repaired

1. Neon pooled connections reject the `search_path` startup option. Removed it;
   verified the default `public` schema and explicitly enforce TLS `verify-full`.
2. Better Auth verification redirects may have an empty body labelled JSON.
   Adapter now preserves redirects rather than throwing a JSON parse error.
3. `pg` normally returns BIGINT as text. The limiter's millisecond arithmetic
   consequently produced a malformed retry time. A connection-local safe-integer
   parser fixes this without changing other consumers; seven concurrent attempts
   correctly allowed five and rejected two with usable retry timing.

Regression tests cover these boundaries. Applied migrations are immutable;
their historical comments describing older auth/startup choices are superseded
by the current implementation and this record, not edited after application.

Vercel runtime logs were inspected. An intentionally incorrect-password test
produced a sanitized library warning. Missing email configuration is likewise
reported as a controlled error with request correlation, not a crash.

## Remaining gates

1. Operator must select a controlled sender domain. Configure Resend through
   Vercel Marketplace, then verify actual inbox delivery and click-through for
   signup and password recovery. No DNS or provider purchase was performed.
2. Production domain, isolated production database, deployment configuration and
   full production account smoke test remain unverified.
3. This account slice does not complete billing, paid entitlements, marketplace
   persistence, history, owned domains or background monitoring. The earlier
   release ledger still applies to those separate features.

Sources used for implementation: [Better Auth installation](https://better-auth.com/docs/installation),
[PostgreSQL](https://better-auth.com/docs/adapters/postgresql),
[rate limiting](https://better-auth.com/docs/concepts/rate-limit),
[email/password](https://better-auth.com/docs/authentication/email-password),
[Vercel rewrites](https://vercel.com/docs/routing/rewrites#wildcard-path-forwarding),
[Vercel request headers](https://vercel.com/docs/headers/request-headers),
[Resend on Vercel](https://vercel.com/marketplace/resend).

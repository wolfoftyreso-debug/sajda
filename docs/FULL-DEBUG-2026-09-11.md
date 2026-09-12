# Sajda full debugging pass — 2026-09-11

## Release status

**Not release-approved for the new Trading journal yet.** Fixes and new portal
code are local, not pushed or deployed during this pass. Migration
`0018_trading_scenarios.sql` is pending in the checked development database.
No production data, credentials, paid entitlement, DNS, payment or email was
changed. Existing unrelated provider-logo work was preserved.

Current deployed evidence refers to the older READY preview
`sajda-dyaa7z3cw-hypbit.vercel.app`, reached through
`https://sajda-test-hypbit.vercel.app`; it does not verify the new local code.

## Confirmed issues fixed

| Priority | Defect | Fix / regression evidence |
| --- | --- | --- |
| P1 | Better Auth's inactivity-reset counter eventually rejects normal sustained Trading session polling. | Reproduced through the installed SDK. Atomic PostgreSQL consume with anchored windows for `/get-session`; burst caps and stricter credential/recovery windows retained. |
| P1 | A transient background session failure unmounts the account editor and can destroy an unsaved draft. | Retain only previously verified, unexpired in-memory display identity on transient errors; hard expiry, authoritative denial, logout and account change still clear it. Private requests still require a fresh session. |
| P2 | Browser Back or an in-app link silently loses a dirty scenario. | Official data-router blocker plus localized leave/stay dialog; beforeunload for hard navigation; owner-aware cleanup. Real browser cancellation retained text and restored input focus. |
| P2 | Half-cent cash flows round incorrectly due to binary floating point. | Exact decimal/rational calculation. `$0.75` less `18%` now yields `$0.62`; 500 deterministic reference cases plus boundary tests. |
| P2 | Invalid Unicode / NUL reaches PostgreSQL JSON, mixed-case UUIDs can mismatch receipts, and mutable input/owner state can drift while awaiting auth. | Strict PostgreSQL-safe text, canonical UUIDs, cloned normalized inputs and initiating owner snapshots; malformed provider receipts/errors fail closed. |
| P2 | An older available quote can undermine newer known registered evidence after expiry. | Retain the known registration veto; unknown or stale data never becomes a buy signal. |
| P2 | Selected domains can silently change, load/save errors are ambiguous and mobile form controls are too small. | Stable selection, distinct retryable errors, named-panel focus, 16px mobile fields. |
| P2 | Edit search scrolls to a tall card area instead of the search field. | Compact form scroll target and explicit field focus; verified in the final browser build. |
| P2 | Health readiness and the local QA adapter omit newer storage/routes. | Required tables/columns added to readiness; all public API files inventoried and mapped; HTTP smoke suite expanded from 55 to 66 checks. |

No P0 exploit was confirmed by this pass. That is not a claim that every security
boundary or all production failure modes have been exhaustively exercised.

## Actual verification

### Local automated checks

- `npm run check`: **1,277 passed, 7 skipped, 0 failed**; includes ESLint,
  frontend/server TypeScript, language contracts, SEO policy, Neon boundary,
  syntax, tests and mounted UI contracts.
- **73 English-source dictionaries, zero key/placeholder mismatches** across
  five languages. This is contract coverage, not certification by native speakers.
- Final `npm run build:vercel`: passed; 22 static Swedish SEO routes and
  server-secret/public-bundle checks passed.
- Final `npm run build:native`: passed against the configured HTTPS test API
  origin. This builds the separate JavaScript bundle; no Xcode compile, code
  signing, physical iPhone or TestFlight verification was performed.
- `npm audit --omit=dev`: zero reported production dependency advisories at
  check time. This does not prove absence of application vulnerabilities.
- `git diff --check`: passed.

The seven opt-in tests not run by the default suite cover account deletion,
membership SQL, two AI allowance runtime checks, contact runtime, native commerce
SQL and Trading scenario SQL. Mocked/fake provider coverage is not real payment,
mail delivery or committed account persistence evidence.

### Local real HTTP and browser

- **66/66 read-only HTTP checks** passed after the final build and QA server
  restart: public routes/assets/404s, private API denials, forged owner rejection,
  cron protection, malformed webhook rejection, OpenAPI and public input checks.
  The local adapter deliberately has no database credentials: its health returned
  expected `503/not_configured`, not a successful persistence check.
- Real exact domain lookup `example.com`: correctly Taken; no false availability.
  A Loopia published TLD price was explicitly not an exact-domain quote. One
  Porkbun request timed out and fell back without manufacturing a verified price.
  USD conversion and explicit original-currency fallback were both observed.
- Guest search allowance, subsequent search/swipe gate, contact required-field
  validation, pricing and the shared Sajda sign-in path to Trading were exercised.
  No contact email was sent and no password reset was submitted.
- Final built root → pricing → Trading routes load without browser errors;
  route navigation starts at the top. Edit search focuses the visible field.
- Real Trading component fixture: Radar → twin → scenario → save → journal →
  edit; risk sort, absent evidence, math boundaries, validation, selection and
  draft protection. Dialog tested at 320 and 390px, earlier desktop at 1280px;
  no horizontal overflow in reviewed screens. Keep editing retains the draft;
  browser Back is intercepted; explicit leave discards it. Focus returns to the
  initiating link or input. No browser errors were observed.
- The Trading fixture uses synthetic observations, a simulated account and
  in-memory transport. It cannot verify real Neon journal persistence and
  explicitly refuses production builds.

### Deployed read-only checks

- Vercel CLI inspected the READY preview, alias and runtime logs.
- **55/55 HTTP checks** passed on the previously deployed release; health was
  connected. The expanded 66-check suite was run locally, not on this old release.
- The browser restored an existing test-account session and loaded its saved
  Trading report without JavaScript errors. No new scan was started.
- The sampled 24-hour Vercel error log returned three `DEP0169` deprecation
  warnings, including one session HTTP 429. The SDK limiter defect was separately
  reproduced; the warning's exact dependency origin remains unknown. A short log
  sample is not proof that all production requests succeed.

### Database checks

- Read-only migration check against the dedicated Neon development project:
  18 applied entries, migration 0018 pending.
- Actual Neon HTTPS and PostgreSQL TCP connectivity succeeded.
- Expanded storage readiness returned false with missing journal storage.
- New limiter SQL planned successfully using actual PostgreSQL `EXPLAIN`,
  without `ANALYZE` or data mutation.
- Subsequently ran `scripts/check-account-rate-limit-postgres.ts` against the
  pinned development database with explicit opt-in: **five real SQL checks
  passed** (stable session anchor, 60 accepted then saturated denial, expired
  window reset, stricter credential window and monotonic clock handling).
  All mutations, including pruning, were enclosed in one rolled-back transaction.
  Rollback was verified with **zero residual test keys**, zero schema changes,
  zero provider calls. This was a single connection, not a multi-worker load test.

## Remaining release gates

1. Apply additive migration 0018 to the intended environment through the approved
   migration workflow, then run the opt-in real scenario SQL test.
2. Deploy the matching frontend/API and repeat the expanded HTTP/browser checks.
3. With entitled test accounts, save → reload → logout/login → update a scenario;
   verify a different owner and a non-Trading account cannot access it. Exercise
   concurrent updates/idempotent retries against real storage.
4. Test external transactional email delivery and Stripe sandbox entitlement
   lifecycle separately; neither was exercised in this debugging pass. Plans in
   the inspected UI are explicitly not yet available to purchase.
5. Compile/sign and test the native application on Apple tooling and real devices.

Real resale history, licensed comparable sales, calibrated market forecasts,
automated monitoring and purchase execution are not established by scenario
math or these tests. They must not be represented as verified capabilities.

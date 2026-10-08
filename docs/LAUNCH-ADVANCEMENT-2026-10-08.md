# Launch advancement — 2026-10-08

Unrestricted commercial launch remains **NO-GO** until the external gates below
are evidenced. This increment prepares and tests implementation; it does not
silently enable live purchases, indexing, OAuth providers or production monitors.

## Changes and verified boundaries

### Subscription coherence

A real Stripe TEST reproduction confirmed that the old portal could switch a
monthly subscription's Price immediately while its paid full-period invoice still
belonged to the previous plan. The strict entitlement evaluator then returned no
grant. The customer-facing operation was incoherent, not evidence of free access.

The exact existing Sajda TEST portal was inspected, changed to cancel-only and
read back. Cancellation at period end, invoice history and payment-method changes
remain available. No catalog duplication, live transaction or existing-customer
change was made. The application checks the actual safe portal contract before
offering checkout or opening billing management. Immediate plan switches are not
advertised; all five languages explain the supported cancellation/re-subscription
path. Returning customers can choose an enabled plan after their subscription ends.

Actual provider IDs, cleanup and local-versus-deployed verification levels are in
[the commerce evidence](COMMERCE-RELEASE-2026-10-08.md). Manual prorated changes in
the Stripe dashboard are still outside the supported entitlement model.

The real hosted Stripe TEST journey subsequently passed on the current local
handlers and isolated Preview Neon: card decline without access, successful retry
on one Checkout Session, authentic signed CLI delivery, Trading membership,
duplicate delivery, invalid-signature rejection, period-end cancellation with
retained access and immediate TEST cancellation with access revoked. Exact fixture
cleanup confirmed zero remaining database fixtures and active subscriptions; the
one TEST payment was refunded. This is not deployed callback, real account-auth,
automatic provider-retry, renewal, inbox-delivery or live-commerce proof.

### Session reads and account isolation

Only simultaneous preflight/background session reads are coalesced. A settled
session is never cached as authorization, and post-response checks remain fresh.
The deterministic SDK test demonstrates five simultaneous preflights using one
GET; this is not a claim that every real journey now uses five times fewer requests.

Identity changes, logout, deletion and expiry invalidate older reads and private
responses. One consumer's cancellation does not abort other consumers. A mutation
already sent before an identity change may have completed; it is not automatically
replayed or reported as a proven failed write. Native transport and server rate
limits remain unchanged.

### Production schema preparation

Fresh official Vercel environment pulls, without repository `.env` fallback,
confirmed distinct Preview and Production Neon endpoints/databases. Production's
Neon project identity matched its explicit production confirmation variable.

The reviewed additive migrations `0022_brand_reports.sql`, `0023_brand_checks.sql`
and `0024_brand_monitors.sql` were applied transactionally to Production. They
create new account-owned report/check/monitor tables, constraints and triggers;
they do not backfill or modify existing customer records. Readback: **25 applied,
0 pending** in both environments. This is schema evidence, not production user-flow
verification. All four production report/check/monitor/scheduler flags remain off.

Production validation now rejects inconsistent report/check/monitor flags, a
missing or duplicate monitor cron, inappropriate cadence, wrong worker duration
and an absent or reused auth/scheduler secret. It does not claim migration or
provider delivery proof from environment flags.

### Email provider readiness

The approved production sender is `Sajda <noreply@mail.sajda.com>`. A fresh operator
key could read Resend's current domain inventory; the approved domain is absent.
An authorized attempt to create only that domain returned a domain-capacity/plan
block. No domain was created and no safe Sajda-only older domain was identified
for removal. No unrelated domain was deleted and no plan, fee or DNS was changed.

The read-only readiness checker validates exact domain identity, sending status,
verification and disabled account-email tracking. Its output never claims inbox
delivery. Contact messages still target `dev@hypbit.com`; recovery/deletion links
go only to the account owner. See [email evidence and operation](RESEND-CONTACT.md).

### Current web origin

The project domain inventory contains only verified `sajda-eight.vercel.app`.
Current Production canonical and Better Auth origins both match
`https://sajda-eight.vercel.app`; the actual health endpoint reported connected
Neon. This is a controlled Vercel alias, not proof of ownership of `sajda.com` or
`sajda.dev`. No origin/DNS/protection configuration was changed in this increment.

## Remaining external gates

1. Confirm the intended owned web domain and authoritative DNS access, or explicitly
   retain the controlled Vercel alias. Keep canonical, auth and provider callbacks
   aligned. Do not change root MX records or unrelated services.
2. Release an explicitly approved Resend domain slot or approve account capacity.
   Obtain actual provider-generated records, verify `mail.sajda.com`, then prove
   contact, verification, reset and deletion mail delivery and one-use links.
3. Create/configure the requested Google, X, GitHub and Apple provider apps and
   verify their real account lifecycles. Credential-free configuration cannot
   complete provider consent or Apple enrollment.
4. Establish a stable accessible TEST webhook destination and prove deployed
   checkout, delivery, account entitlement, returning-user and failure paths.
   Do not rotate an unknown existing signing secret or confuse a local CLI
   listener with the permanent hosted callback. Live activation follows only
   after legal/consumer and sandbox gates; no live debit is authorized here.
5. Obtain the operator's decisions in [legal release decisions](LEGAL-RELEASE-DECISIONS.md),
   including enabled recipients, retention, consumer-contract execution and
   operational owners. Engineering tests are not legal approval.

Apple Developer enrollment, signing, StoreKit sandbox, physical-device accessibility
and TestFlight are a separate app release track. The native product bundle builds
against the controlled backend alias and passes its exclusion policy, but it is
not a signed iOS application or proof of a native backend journey.

## Safety and evidence policy

Preview tests allocate synthetic accounts, never reset the existing demo account
or customer password, and remove only their exact owned fixtures. Protected Preview
access uses official Vercel authentication; protection is not disabled. Environment
Secret placeholders are unknown values, not credentials. Provider history may remain
after synthetic customer cleanup. Historical receipts remain historical and are not
rewritten as permission for a new production release.

## Continued release work — later 2026-10-08 pass

This later pass supersedes the earlier **25 applied** schema count above, not
the historical evidence or the **NO-GO** commercial release verdict.

- Fresh official Preview/Production environment pulls confirmed separate Neon
  project and normalized database identities. The migration CLI now requires a
  reviewed non-secret target manifest, linked Sajda project/team, matching Neon
  project and exact database/role/pool-direct pair. Apply also requires the
  reviewed immutable migration-set SHA256. See [migration operation](NEON-VERCEL.md).
- Operator CLI transport now uses actual `pg` TCP certificate-verified TLS to
  the Neon proxy and checks the server-reported database/role before starting a
  transaction. Internal Neon backend-hop TLS is not inferred from this check.
  Unknown COMMIT results no longer claim rollback; a fenced read-only check is
  required before retrying. Untrusted migration ledger details are not echoed.
- Production preflight found zero checkout/customer rows, no new offer columns,
  no add-on ledger and no enabled checkout/live/add-on flag. Reviewed additive
  migrations `0025`, `0026`, `0027` were applied in one transaction: nullable
  offer/return snapshots, their constraint correction, and a new retry ledger.
  No existing user, provider, price, entitlement, DNS or deployment was changed.
  Both databases now report **28 applied, zero pending**, with immutable
  plan hash `80c0a7fe6c295e463d8c37facde3f48556142bb09b61b75ab6311065bbce6776`.
  Existing Production `/api/health` returned HTTP 200, database connected, after
  the apply. This is schema/health evidence, not production commerce approval.
- The retired auth QA transport no longer sends passwords/session cookies as
  child-process arguments. Its replacement keeps exact-origin protected
  Preview access in memory and removes only its two disposable owned accounts.
  Real compiled Preview login, saved-work/reload/isolation, returning login,
  logout, expiration and session-renewal boundaries passed. Deployed password
  change/replay/revocation used a locally captured real-SDK token. No inbox or
  deployed signup claim is made. Exact SHA, viewport, receipt and cleanup are
  recorded in [auth lifecycle evidence](AUTH-LIFECYCLE-VERIFICATION.md).
- Account email receipts are bounded to 16 KiB within a ten-second deadline.
  Safe logs correlate kind, request hash, status and validated provider ID,
  never recipient/body/action URL/code/credential. There is no automatic resend
  after an unknown outcome. Provider acceptance is not inbox delivery.
  Fresh Resend reads still find the approved sender domain absent; no email or
  configuration write was performed by that readiness check.

These improvements do not close sender/DNS, social-provider, permanent deployed
webhook, live-payment, legal-operator or signed iOS release gates. Stripe TEST
renewal/portal evidence belongs in [the Trading add-on record](TRADING-ADDON.md);
local CLI-signed delivery must never be relabeled as a permanent deployed hook.

Local release regression completed before the final read-action timing correction:
`npm run check:ci` passed with **2,239 tests, 2,231 passed, zero failed and eight
opt-in PostgreSQL suites skipped**. Language contracts covered 104 English-source
dictionaries; lint/types, SEO/Neon/UI policies, Vercel build and 85 local HTTP
checks passed. The local runtime intentionally had no injected database and
reported `not_configured`/503; this is not a deployed database-health result.
Later QA-tooling changes receive their own fresh syntax/lint/refusal checks.
The subsequent correction makes Trading add/remove actions unavailable in the
last 120 seconds before renewal, matching the strict mutation boundary while
preserving billing management. Its 120/121-second regression was observed
failing before the fix. After the fix, 135 targeted commerce/client/UI/probe
tests, server types, targeted lint, 41-file syntax checks and a fresh Vercel
build passed. This is not a rerun of the earlier full suite; the next GitHub CI
and deployed checks must identify their actual source commit.
The native product bundle also rebuilt against the controlled HTTPS Vercel alias
and passed provider/secret and SEO/service-worker exclusion. No iOS compilation,
signing, TestFlight, StoreKit transaction or physical-device claim is made.
The fresh network-backed `npm audit --omit=dev` returned zero known production
dependency vulnerabilities. This is not a claim that the development toolchain
has no advisories or that dependencies alone constitute a security review.

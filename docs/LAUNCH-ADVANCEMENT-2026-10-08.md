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

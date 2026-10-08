# Sajda transactional email and contact

## Current provider inspection, 2026-10-08

This section supersedes the older infrastructure observations below. It is not
a production email or inbox-delivery sign-off.

- The existing, authorized Resend account is reachable through the fresh
  Development credential. Read-only domain-list and domain-detail calls returned
  HTTP 200. No key value was printed, committed or returned by the checker.
- Fresh Vercel metadata shows `RESEND_API_KEY` as a Secret scoped to Production,
  Preview and Development. Fresh Production export correctly omits that Secret.
  Production's sender is already `Sajda <noreply@mail.sajda.com>`; the fresh
  Development sender is `Sajda <noreply@hypbit.com>`.
- The current Development domain `hypbit.com` is provider-verified, with sending
  enabled, open/click tracking disabled and region `eu-west-1`. This does **not**
  verify the approved Production sender or application email flows.
- The complete provider list contains ten domains and does not contain
  `mail.sajda.com`. Creating only that approved domain returned HTTP 403
  `validation_error`: the provider reports a domain-capacity/plan restriction.
  A subsequent read confirmed no domain was created; one bounded same-target
  retry returned the same restriction. No provider DNS records for the Sajda
  subdomain are available yet and none are invented here.
- No unrelated sending domain was deleted, no plan was upgraded, no DNS or
  Production configuration was changed, and no test message was sent. The
  connected Gmail mailbox is not the operator's `dev@hypbit.com` mailbox; a
  narrow search for recent Sajda messages addressed to that operator returned
  no matching evidence. Absence in that mailbox is not proof of non-delivery.
- A final read-only provider-list check at `2026-10-08T11:53:57.673Z` confirmed
  that `mail.hypbit.com` is also absent. The existing `hypbit.com` root sender
  is shared infrastructure, not an identified Sajda-only slot that may be
  removed safely.

The next external step is to provide an authorized Resend domain slot: either
the operator explicitly selects an unused domain to remove after impact review,
or approves additional domain capacity. Then create/verify `mail.sajda.com`
using the exact provider-generated records, keeping inbound root MX intact.
Only after verification may a labeled test message and controlled account
verification/reset tests establish actual delivery and link behavior.

### Repeatable, read-only provider check

`scripts/check-email-readiness.mjs` checks the approved sender's configuration,
bounded provider pagination, exact domain identity, verified status, enabled
sending and disabled authentication-email tracking. It uses GET requests only,
does not send mail or modify configuration, and emits issue codes rather than
provider bodies, credentials or authentication links. A sending-only key may
correctly report `provider_read_permission_denied`; use an authorized operator
credential for this one-off check, not broader permissions in application code.

After configuring a suitable local or Development operator environment:

```powershell
node --env-file=.vercel/.env.launch-email.development.local scripts/check-email-readiness.mjs
```

The current Development sender intentionally produces
`email_sender_domain_mismatch` under the default approved-domain check. A
successful result is `provider_configuration_verified`, with
`delivery: "not_tested"` and `emailsSent: 0`. It is not a release-gate substitute
for actual received verification/reset/contact/deletion messages and a deployed
one-use recovery test. Ten synthetic checker tests cover fail-closed behavior,
pagination, unknown settings, permission/provider failures and secret-safe output.
The actual read-only checker returned `provider_configuration_verified` for
the current Development `hypbit.com` diagnostic, and
`sender_domain_not_registered` for the approved Production sender checked with
the authorized Development operator credential. The Production Secret was not
retrieved. The default CLI check using fresh Development configuration correctly
exited 1 with `email_sender_domain_mismatch` before any provider request.
The checker tests and 43 existing contact/account-email/deletion-mail tests
passed; no synthetic test sent real email.

## Delivery contract

- `/contact` submits to the same-origin Vercel Function `/api/contact`.
- Contact messages are sent only to **dev@hypbit.com**. The visitor's validated
  email is `reply_to`, never `from`; browser fields cannot override the recipient.
- Password reset and verification messages go only to the account's email.
  `dev@hypbit.com` is the support Reply-To, not a copy recipient. Recovery links
  must never be forwarded to an operator.
- Both flows use the server-only `RESEND_API_KEY` and `SAJDA_EMAIL_FROM`.
  No value belongs in browser-prefixed environment variables or source control.
- The approved production sender is `Sajda <noreply@mail.sajda.com>`. The release
  configuration rejects other sender domains so an older Hypbit sender cannot
  silently reach production.
- A successful provider response means accepted for sending, not inbox delivery.
  Missing configuration, rejection or ambiguous responses must not display success.

## Abuse control and retries

Contact has its own Postgres guard, separate from AI/search allowances: maximum
50 attempts in a rolling 24-hour window, 3 per IP and 1 per minute, with 2 active
30-second leases. Identical retries retain their submission UUID and Resend key,
including after a display-language change. Changed payloads using the same UUID
are rejected. Pending retries stop after 3 attempts or 23 hours, before Resend's
24-hour idempotency window. Accepted submissions do not send a second email.

Database rows contain keyed hashes and timestamps, not the visitor's message,
name, email or raw IP. Rows older than 30 days are cleaned opportunistically on
a later committed reservation; this is not a guaranteed 30-day deletion job.
Email providers and the support mailbox retain the actual message according to
their configured policies. The browser keeps the draft only in memory.

Successful structured logs correlate the UI `requestId` with the email's
`submissionId`, without logging contact text, credentials or recovery tokens.

## Operator setup

1. Use the existing Resend account where possible. Verify the domain's status in
   its dashboard; DNS records alone do not prove which account controls it or
   whether sending is approved.
2. Create/use a project-specific, sending-only API key scoped to the verified
   sender domain. Store it as Sensitive `RESEND_API_KEY` in Sajda's selected
   Vercel environment, not in chat. Configure `SAJDA_EMAIL_FROM` exactly as
   `Sajda <noreply@mail.sajda.com>`.
3. Disable click/open tracking for authentication links. Keep root inbound MX
   records intact. A separate sending subdomain can isolate reputation but must
   be verified through the actual authoritative DNS provider.
4. Apply the additive contact guard migration before enabling the contact API.
   Keep Preview/Development and Production credentials and data separated.
5. Redeploy the selected preview after configuration. Exercise a synthetic contact
   message to dev@hypbit.com and verify actual receipt. Then test password reset
   for an explicitly controlled test account: receipt, correct host, expiry,
   one-time redemption and session revocation. Never send other users' recovery
   links to support for testing.

## Observed infrastructure, 2026-09-08

`hypbit.com` uses Route 53 authoritative nameservers, not this Vercel team's DNS.
Existing root MX is `mail.aamos.systems`; **do not replace it**. Resend-related
DKIM and an SES return-path under `send.hypbit.com` are present in EU West 1.
That is evidence of previous configuration, not verification of current Resend
account access or delivery.

The native Vercel Resend installation attempt stopped with
`integration_terms_acceptance_required`. It did not create a Resend resource or
provision credentials. Existing Resend login is preferred to creating duplicates.
No DNS records have been changed. No sender verification or real inbox delivery
has been proven in this implementation pass.

## Verified implementation, 2026-09-08

- [Vercel preview](https://sajda-78dxor735-hypbit.vercel.app/contact), deployment
  `dpl_4FhCyn2XPG9L9poZxBU2WyjX1BJx`, READY. No Production promotion.
- Final application check: lint, application/server TypeScript, boundary and UI
  checks pass; 150 tests pass, 2 explicit database opt-ins skipped in that suite.
- Contact database opt-in run separately: 16 checks against actual Postgres,
  including concurrency, quotas and idempotency. All 19 exclusively owned test
  rows were removed; no AI calls or outgoing emails.
- Account regression: 27 checks using local actual handlers and real Postgres,
  including one-use reset, old-password denial and session revocation. Mail links
  were captured only in process memory. Two owned test users removed, no existing
  users modified.
- Additive `0004_contact_submissions.sql` applied to the Preview/Development
  database. Five migrations applied, zero pending; applied migrations are frozen.
- Eight contact HTTP checks pass locally and on the deployed preview: route,
  method/origin/type/size validation, rejected recipient override/honeypot and
  honest unconfigured response.
- Full deployed read-only smoke: 49 HTTP/HTML/API checks pass; database health
  is 200/connected. Two earlier runs hit local CLI transport deadlines; the
  verifier now uses two CLI processes and a separate bounded startup deadline.
  These are transport checks, not a page-performance benchmark.
- Actual browser tests: local empty-form focus, retained draft on failed request,
  language switching and corrected metadata; mobile375px viewport has no horizontal
  overflow. Deployed contact submission and reset request both correctly report
  unavailable email instead of success. The contact-to-reset navigation works.
- Preview runtime logs correlate controlled `contact_unavailable` and
  `email_not_configured` failures without exposing message text, tokens or mail keys.

**Email activation remains blocked:** the existing Resend account is not signed
in here, and Sajda has neither `RESEND_API_KEY` nor a verified `SAJDA_EMAIL_FROM`.
The Resend login tab is left for the operator. This is not a working-email or
production-launch signoff.

## References

- [Resend domain verification and sending subdomains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend Vercel integration](https://resend.com/docs/guides/vercel-marketplace-integration)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)

This document records prerequisites, not a production release approval.

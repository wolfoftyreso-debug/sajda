# Grok launch execution order

Status: **external launch work required**. This is an execution order, not a
request for another audit. It records the repository state observed on
2026-10-05 and tells an authorized operator agent exactly what must be completed
before unrestricted production launch.

## Fixed scope

- Repository: `https://github.com/wolfoftyreso-debug/sajda.git`
- Release branch: `codex/launch-hardening`
- Reviewed release commit: `825d076`
- Current remote `main`: `c01565e`
- Current public Vercel alias: `https://sajda-eight.vercel.app`
- Latest verified release preview: `https://sajda-kg0n0tw09-hypbit.vercel.app`
- Vercel project: `hypbit/sajda`
- Database architecture: Vercel-managed Neon Postgres and application-owned
  Better Auth. Do not enable Supabase or Neon Auth.
- Operator: Landvex AB. Support/contact recipient: `dev@hypbit.com`.
- Selected account-email sender domain: `mail.sajda.com`.
- Web plans: Free USD 0, Basic USD 9/month, Premium USD 19/month and Trading
  USD 49/month. `shared/plans.ts` is the price source of truth.

Production currently serves `main`, not the release branch. The public alias
returns HTTP 200 but also `X-Robots-Tag: noindex, nofollow`. Do not change that
header or merge the release branch merely to make the deployment appear live.

## Non-negotiable operating rules

1. Work in the order below. Do not skip a failed gate.
2. Never paste API keys, OAuth secrets, P8 material, database URLs, Vercel
   protection bypasses, session cookies or reset links into chat, Git, issues,
   screenshots, command arguments or reports. Use provider secret inputs.
3. Inspect an external account before creating objects. Reuse the intended
   project/product/webhook when it already exists; do not create duplicates.
4. Preview first. Production flags remain off until the corresponding preview
   lifecycle has passed.
5. A provider HTTP 200 is not inbox delivery, a Stripe success URL is not an
   entitlement, and a READY deployment is not a golden-path pass.
6. Do not perform a live debit, accept a paid/legal agreement, alter DNS with
   outage risk, enroll Landvex in Apple programs or publish legal commitments
   without an authorized human's confirmation at that exact boundary.
7. Preserve `dev@hypbit.com` as the fixed contact recipient. Account recovery,
   verification and deletion messages go only to the account owner.
8. Return evidence using the template in
   `LAUNCH-EXTERNAL-EVIDENCE.template.json`; redact all credentials and personal
   data.

## 0. Establish the exact baseline

Run from a clean checkout:

```text
git fetch --all --prune
git checkout codex/launch-hardening
git pull --ff-only origin codex/launch-hardening
git rev-parse HEAD
npm ci
npm run check:ci
npm audit --omit=dev
```

Expected reviewed commit is `825d076`. If remote HEAD is newer, inspect the
diff and repeat the complete gate rather than resetting to the old commit. The
production audit must remain zero vulnerabilities. The five currently known
high advisories are confined to the Tailwind 3 development toolchain and are
not permission for an unreviewed Tailwind 4 migration.

**Evidence:** commit SHA, clean status, command exit codes, test count, build
result and production-only audit result.

## 1. Establish the final public origin before OAuth

Inspect Vercel Domains and the authoritative DNS provider. The present canonical
origin is the Vercel alias above; it is not evidence that a final branded domain
has been selected. If `sajda.com` or another final origin is not already owned
and authorized for Sajda, stop only this gate and request that single decision.
Do not invent ownership.

Once authorized:

1. Attach the chosen hostname to `hypbit/sajda` without changing mail DNS.
2. Set production `SAJDA_CANONICAL_ORIGIN` and `BETTER_AUTH_URL` to the same
   origin, without a trailing path.
3. Keep `SAJDA_SEO_INDEXING=noindex` through all remaining launch tests.
4. Verify HTTPS, HTTP-to-HTTPS, selected www/non-www behavior, canonical tags,
   legal/support links, `/robots.txt`, `/sitemap.xml` and `/api/health`.

Do not replace root MX records while configuring the website or Resend.

**Evidence:** domain ownership/configuration view, DNS readback, response headers
and exact canonical/auth origins. No credentials.

## 2. Activate and prove transactional email

The intended sender is `Sajda <noreply@mail.sajda.com>`. Production currently
uses a Hypbit sender; that is not the selected final state.

1. Use the existing authorized Resend account if possible.
2. Add `mail.sajda.com` and copy the exact Resend-provided DNS records into the
   authoritative DNS provider. Do not guess record values and do not replace
   inbound MX records.
3. Wait for Resend to report the domain verified.
4. Create or reuse a Sajda-specific sending key. Store it as Vercel Sensitive
   `RESEND_API_KEY`, first in Preview. Set `SAJDA_EMAIL_FROM` to the sender above.
5. Disable open/click tracking for authentication messages.
6. Deploy a fresh preview and test, with controlled addresses:
   - contact form received at `dev@hypbit.com`, with visitor as Reply-To;
   - verification email received by the new account owner;
   - reset email received by the account owner;
   - links use the intended preview origin, expire and cannot be replayed;
   - unavailable provider state is shown honestly.
7. Only after those checks, copy the scoped configuration to Production and
   repeat receipt/link tests on the final origin.

**Evidence:** Resend domain status, redacted provider delivery IDs, received
message headers, sender/recipient/Reply-To, link host, expiry/replay results and
application request IDs. Never include a live link or token.

## 3. Configure the four social identity providers

One Sajda account serves every plan. There is no separate Trading login.
Configure each provider against the final origin:

```text
https://FINAL-ORIGIN/api/auth/callback/google
https://FINAL-ORIGIN/api/auth/callback/github
https://FINAL-ORIGIN/api/auth/callback/twitter
https://FINAL-ORIGIN/api/auth/callback/apple
```

The X provider uses the internal identifier `twitter`. Configure server-only
pairs: `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
`TWITTER_CLIENT_ID/SECRET`, and `APPLE_CLIENT_ID/SECRET`. For Apple, use the
reviewed web Service ID and configure `APPLE_APP_BUNDLE_IDENTIFIER` separately
when it differs from the Service ID. Never place these values in `VITE_`
variables.

Test every provider in a clean private session:

- new account;
- returning account;
- cancelled consent;
- denied/invalid callback;
- safe `next` return path;
- linking behavior for an existing verified email;
- logout and return visit;
- no duplicate account or cross-account session.

If Apple Developer enrollment does not yet exist, record Apple as blocked; do
not fabricate an Apple secret and do not relax the production build gate.

**Evidence:** provider app ID names (not secrets), registered callback strings,
test timestamps, resulting Sajda user IDs hashed/redacted and application logs
without tokens.

## 4. Complete Stripe sandbox before enabling sales

Inspect the existing Stripe test account and catalog first. The reviewed code
expects exact recurring monthly amounts of USD 9, USD 19 and USD 49. Reuse
matching Price objects when present. Checkout endpoint is `/api/billing` and the
webhook endpoint is:

```text
https://ORIGIN/api/billing-webhook
```

1. Resolve the Stripe account activation/terms state with the authorized human
   if the provider requires acceptance. Do not accept agreements on their
   behalf.
2. Keep `STRIPE_MODE=test`. Configure test secret, webhook secret, exact Basic,
   Premium and Trading Price IDs, and Billing Portal configuration in Preview.
3. Enable one Preview checkout flag at a time, then all three only after their
   individual tests pass.
4. Execute successful and declined payment, cancel/abandon, retry, duplicate
   checkout, refresh/back, delayed and duplicate webhook, subscription update,
   failed renewal, cancellation at period end, reactivation and portal access.
5. Verify Neon commercial state and server-side entitlement after every event.
   The success page must never grant access by itself.
6. Test cross-provider guards against Apple records using fixtures/sandbox as
   documented; do not open both live purchase surfaces concurrently without the
   remaining lifecycle decision.
7. Keep Production checkout flags false until consumer terms are approved and
   the same test matrix passes on the final production configuration. A real
   live debit requires explicit human approval.

**Evidence:** redacted Stripe object/event IDs, event delivery/replay results,
Neon state transitions, UI entitlement observations and zero false grants.

## 5. Complete the legal and operational decisions

Use `LEGAL-RELEASE-DECISIONS.md` and `APP-PRIVACY-INVENTORY.md`. Do not replace
missing facts with generic generated policy text. An authorized Landvex reviewer
must approve:

- purposes, roles and lawful bases for actual enabled flows;
- retention criteria for account data, inactive accounts, logs, backups,
  counters, support mail, research evidence and financial records;
- enabled vendor/recipient matrix, processing locations, agreements and
  transfer safeguards;
- web offer features/quotas, taxes, renewal, cancellation, complaints,
  statutory remedies and applicable withdrawal flow/durable receipt;
- operational owners for privacy requests, support, incidents and refunds.

Reconcile the approved facts into all five public languages and re-run language,
legal-route, account-deletion and commerce tests. Obtain legal review where the
operator requires it; do not describe engineering output as legal approval.

**Evidence:** dated approver identity/role, approved fact matrix, source commit,
public policy URLs and passed tests. Do not commit confidential contracts.

## 6. Run the release candidate as a real product

After gates 1–5 are complete, deploy `codex/launch-hardening` to a protected
Preview and run:

```text
npm run check:ci
npm audit --omit=dev
```

Then exercise the deployed golden paths on 320, 375, 390, 430, tablet and
desktop viewports:

- English fallback plus OS-selected Swedish/Spanish/French/Chinese and manual
  switching;
- exact domain search, creative search, all TLD swipe paths and one-step paid
  undo;
- name packages, language choice and explicit explanation when fewer than the
  requested count can be verified;
- Brand Index lookup and self-assessment;
- account registration, all sign-in methods, recovery, saved work, return
  visit, API keys, account MCP/REST, deletion;
- public ChatGPT/Claude/Grok/Perplexity/developer connector tools;
- Basic, Premium and Trading access/denial boundaries;
- Trading start/follow/stop/refresh/export and scheduled-worker behavior with
  only reviewed sources;
- contact, pricing, terms, privacy, error/empty/loading/success states;
- keyboard, focus, labels, dialogs, VoiceOver-oriented semantics and no
  horizontal overflow.

Inspect Vercel runtime logs after the run. No unexplained 5xx, secret leakage,
cross-account access or false availability/price/ownership claim is acceptable.

**Evidence:** deployment ID, commit, sanitized run transcript, viewport matrix,
provider tests, database cleanup record and log query window.

## 7. Merge, production deploy and indexing

Only after gates 1–6 pass:

1. Rebase/merge the reviewed branch through normal GitHub review. Do not force
   push `main` and do not bypass the required GitHub/Vercel check.
2. Verify the production deployment was built from the merged SHA.
3. Repeat the production smoke, auth, email and non-destructive commerce checks.
4. Confirm rollback ownership and previous deployment.
5. Change `SAJDA_SEO_INDEXING=index`, redeploy, and verify that HTML/headers,
   robots and sitemap now agree. Submit/inspect the final sitemap in search
   tooling only after that readback.

If any production gate fails, leave the prior production alias active and keep
indexing disabled. A merged commit is not permission to promote a broken build.

## 8. Apple/App Store track

This can proceed in parallel after the final domain/account backend is stable,
but it does not block a separately compliant web launch.

Human boundary: Landvex must enroll in Apple Developer, accept applicable
agreements and provide tax/banking/trader facts. After that, Grok may complete
the technical work described in `APP-STORE-COMMERCE.md`:

- app record and bundle `com.hypbit.sajda`;
- signing and Sign in with Apple;
- one monthly subscription group with reviewed Basic/Premium/Trading products;
- server notification URL `/api/app-store-webhook`;
- server-side IAP environment and product mapping;
- Sandbox purchase/decline/cancel/pending/renewal/grace/refund/revocation;
- restore, account switch/deletion, physical-device and TestFlight tests;
- App Privacy, DSA trader, support/privacy/review metadata.

Do not enable `SAJDA_APP_STORE_PURCHASES_ENABLED` or production verification
until the complete sandbox matrix and signed archive pass.

## 9. Separate non-blocking Tailwind 4 hardening

The production dependency audit is clean. The remaining advisories are in the
Tailwind 3 development build chain; the available automated fix is a breaking
Tailwind 4 upgrade. Perform this only on a dedicated branch after launch gates:

1. capture reference screenshots for all major routes/viewports;
2. use the official migration path, not `npm audit fix --force`;
3. run the full gate and visual comparison;
4. inspect generated CSS size, focus/hover/dark/responsive states;
5. merge only with no unexplained visual or build regression.

This is not a reason to ship a blind framework migration in the release branch.

## Grok completion response

Return only:

1. gate-by-gate status: `verified`, `failed`, `blocked` or `not_started`;
2. evidence references and timestamps;
3. exact changes made and commit/deployment IDs;
4. unresolved external decision, if any, phrased as one concrete question;
5. release verdict: `GO`, `GO WITH CONDITIONS` or `NO-GO`.

Do not return another generic backlog. Fix every safely fixable failure, rerun
its test, and report only remaining blockers.

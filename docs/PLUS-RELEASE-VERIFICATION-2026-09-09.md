# Sajda Plus — release verification, 2026-09-09

> Historical first-pass record. The operator subsequently confirmed the fixed
> USD 2,000/month price: see [the price-contract follow-up](PLUS-PRICE-CONTRACT-2026-09-09.md).
> References to a preliminary price below describe that earlier pass, not the
> current commercial contract. They do not imply that payment or email gates passed.

## Verdict

**NO-GO for public paid production.** The updated Vercel preview and isolated
production database are real. Stripe sandbox transactions, delivered Resend
email and a commercially useful Lost Domains result set are not yet verified.
No live payment, subscription, DNS change or production account was created.

This record describes the current implementation pass, not a certification of
every historical feature in the repository.

## Implemented

- Separate Vercel-managed Neon Production resource, Frankfurt, free plan,
  managed Neon Auth disabled. Auth remains the existing same-origin Vercel
  Better Auth service. AI remains Vercel AI Gateway.
- Independent production auth secret, explicit verified Vercel canonical/auth
  origin and production database identity. Production configuration fails closed
  without required mail settings. Crawling, cron and live commerce have separate
  gates; no scheduled crawl or live checkout was activated.
- Stripe SDK/server endpoints, durable customer ownership, unique pending
  checkouts, fenced worker leases, event deduplication, paid-invoice access and
  finite environment-scoped entitlements. Old checkout creation can recover after
  a lost response; stale billing reads reconcile missed webhooks. A success URL
  alone never activates Plus. Billing does not grant Swipe undo.
- Source-policy manifest/CLI and two reviewed CC BY-SA community category pages.
  Fixed source extraction selects project Website links and excludes definition,
  repository, demo and footer noise. The old example.com control source was
  disabled, not deleted. Historical reports remain intact.
- Clearer Plus copy, signed-in identity, diagnostic evidence/risk details,
  licensed-source attribution, explicit USD preliminary price, safe billing
  redirects, account-switch guards and subscription-status refresh recovery.
- Health now checks required schema as well as connectivity. Complete recursive
  server TypeScript checking replaces an incomplete manually maintained file list.
  Test websocket collisions were removed. Functions are configured in Frankfurt
  alongside Neon; this is not a measured latency claim.

## Actual infrastructure evidence

| Environment | Vercel resource | Neon project | Schema/data check |
| --- | --- | --- | --- |
| Preview + Development | sajda-postgres | spring-paper-89655503 | Migrations 0000–0008 applied; existing pilot preserved |
| Production only | sajda-production | damp-violet-87929357 | Empty baseline checked; all nine migrations applied atomically; zero accounts, billing customers and Plus grants afterward |

Preview and Development share their resource; per-preview branch isolation is
not claimed. Production is a distinct database, not a copy of preview. The
approved project alias is `https://sajda-eight.vercel.app`; ownership of sajda.dev
or sajda.com is not assumed. Production indexing remains disabled.

First implementation preview: `https://sajda-1x4oa3sag-hypbit.vercel.app`,
deployment `dpl_EbP8gA2MAthMNpXn7t6qJa8VzeuM`, READY, target Preview, actual
Function region `fra1`. Production was not deployed/promoted.

Final deliverable: `https://sajda-ocljqmizg-hypbit.vercel.app/plus`, deployment
`dpl_Goy5Q1t1zeJ2rUftNdzyTijVykc6`, READY Preview, actual region `fra1`.
Three preview iterations were exercised. The final version repeated all 52 HTTP
checks, health 200, raw-webhook transport boundary and the read-only real
login/Plus/logout/foreign-owner/re-login test. The final Swedish 320px browser
view shows the entire word "domänkandidater" on one line with 30px text and
no horizontal overflow. Temporary viewport overrides were reset. Use the
user-delivered share link to pass Vercel deployment protection; do not disable
project-wide protection or put test credentials in this document.

## Verification actually performed

- Full `npm run check`: **374 passed, 0 failed, 2 opt-in tests skipped**
  (376 total), including lint, app/server TypeScript, SEO/Neon boundary, node
  syntax, all API modules and UI contracts. Provider mocks remain mocks.
- Final mobile heading-size adjustment: all 28 focused Plus UI/billing/copy
  tests passed afterward, plus scoped ESLint. The smallest viewport receives a
  smaller heading so the Swedish compound word is not split mid-word.
- Real Neon commerce harness: **14 checks passed**, including ownership,
  unique pending checkout, transactional event/grant consistency, lease fencing,
  finite paid period, failed renewal, cancellation, refund hold and namespace
  isolation. All synthetic fixtures rolled back; zero Stripe requests.
- Vercel build and preview deployment passed; dependency audit reported zero
  known vulnerabilities. Deprecated transitive-package notices remain.
- **52 deployed HTTP checks passed**, including public routes, intended 404s,
  OpenAPI, strict invalid input, private API denial, cache/security behavior and
  mandatory database health 200/connected.
- Real deployed password login/session, verified pilot Plus access, two enabled
  sources, foreign-account denial, logout denial and persistent report after
  re-login passed. Billing correctly reports unconfigured/no checkout. This
  read-only pass started no crawl and consumed none of the pilot's crawl quota.
- Actual Vercel webhook transport: absent signature returns 400; a signature-like
  header plus original multiline JSON reaches the expected unconfigured-provider
  boundary (503). This verifies raw-body transport, **not** a real Stripe signature,
  event delivery or payment lifecycle.
- In-app browser: anonymous page, Swedish language, password login, account
  identity, empty findings, nested diagnostics and source/risk text inspected.
  Widths 320, 390 and 1440 had no horizontal overflow; mobile and desktop
  screenshots inspected. No browser console warnings/errors observed.
- Runtime logs inspected. One expected `billing_not_configured` event was caused
  by the deliberate transport test; login emitted the known Node DEP0169
  dependency deprecation warning but returned successfully. Neither is presented
  as a successful live payment test.

## Algorithm evidence and limits

The final live bookmarks source probe returned nine primary project websites
(previously thirteen mixed links), including Betula, Digibunch, Faved, Karakeep
and LinkAce. Only source HTML/robots was fetched during that probe. A prior
bounded default-engine check made actual RDAP/DNS/HTTP observations for three
registered domains; none became a registrable finding. Mail lookup was unknown
in that local probe. Common Crawl returned historical source-page hints only,
not available domains or proof of ownership.

This is not yet proof of a valuable top-30 feed, former corporate ownership,
historical link value, market valuation or domain-provider availability. The
UI correctly separates diagnostic registered/unknown/excluded domains from
findings and displays no unverified purchase button. Selected source policy
reviews expire on 2026-09-16 and require re-review rather than silent renewal.

## Connected systems and actual blockers

- **Vercel/Neon CLI:** used for actual environment/resource inspection, free
  isolated production provisioning, scoped configuration, migrations, preview
  deployment, health and logs. Installed Neon skill guidance informed pooled
  runtime/direct migration handling and explicit environment separation.
- **Browser:** actual deployed UX and logged-in pilot checked; Stripe approval
  and Resend login state inspected.
- **Primary web sources:** source HTML, license, robots and official Stripe,
  Vercel and Neon documentation used. Plugin-management guidance was used to
  determine actual available access rather than assume listed connectors existed.
- **Stripe:** sandbox integration attempt stopped at
  `integration_terms_acceptance_required`; no resource was provisioned. The
  operator must accept Vercel/Stripe terms, then the sandbox can be connected.
- **Resend:** still logged out; server key and verified sender unavailable.
  Contact recipient remains dev@hypbit.com; reset/verification mail must go only
  to the account holder. No delivery, inbox receipt or recovery-link journey is
  claimed. Existing inbound email DNS was preserved.
- Unrelated Gmail, Apollo, design and marketing data were not accessed to
  substitute for missing payment/email authorization or to mine unrelated data.

## Next release gates

1. Operator accepts Stripe installation terms; connect test mode and verify the
   complete successful/failed/duplicate/delayed/canceled/returning payment journey.
2. Operator signs into Resend and confirms sending-domain authority; configure
   sender and test real received verification, recovery and contact messages.
3. Approve the actual monthly USD Stripe amount and tax/cancellation terms.
   Current **USD 2,000/month** is explicitly preliminary, not an activated price.
4. Validate a broader licensed source set, registrar confirmation and actual
   findings quality before enabling paid Lost Domains or unattended collection.
5. Rebuild with isolated Production configuration only after the gates pass;
   inspect production auth, email, billing, health, logs and mobile afterward.

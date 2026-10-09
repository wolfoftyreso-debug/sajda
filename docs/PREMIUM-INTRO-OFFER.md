# Premium introductory month

The approved web offer is USD 9 for the first monthly billing period, followed
by USD 19/month, cancel at the end of the paid period. Applicable tax and the
final payable total are shown in Stripe Checkout. There is no free trial or
minimum subscription term.

## Exact contract

`premium-first-month-v1` applies one USD 10 discount to the existing USD 19
monthly Premium Price. It does not create a USD 9 recurring Price. The shared
contract is `PREMIUM_INTRO_OFFER` in `shared/plans.ts`.

- The browser sends `plan: "premium"`, `offer: "premium-first-month-v1"` and
  optionally `returnTo: "swipe"`. It cannot send a coupon, price, customer or URL.
- The server selects and verifies an environment-specific coupon: USD 10 off,
  `duration: "once"`, scoped exclusively to the configured Premium Product,
  with matching Sajda offer/environment metadata. `applies_to` is explicitly
  expanded because the current Stripe API does not return it by default.
- `STRIPE_PREMIUM_INTRO_ENABLED=true`, `STRIPE_PREMIUM_INTRO_COUPON_ID`, enabled
  Premium checkout, the exact current Premium Price and reviewed migrations
  0025/0026 are all needed before the offer can be ready.
- The reservation stores the offer, coupon, plan, Price and return context.
  Retry/recovery uses that persisted intent, not a recomputed coupon or origin.
  Both success and cancel URLs must match the reserved origin, route and exact
  billing query. Local TEST callbacks allow exact loopback HTTP; live uses HTTPS.
- Requested intro checkout returns `intro_offer_unavailable` (409) if it cannot
  honor the offer. It never quietly substitutes the USD 19 ordinary checkout.
  A pending session cannot change between ordinary and introductory price or
  between return destinations.

## Eligibility and uncertainty

This campaign is for a new subscriber: **no previous Stripe subscription of any
plan or status on the account**. Canceled, trial, incomplete, incomplete-expired
and prior Basic/Trading subscriptions are not new subscribers. Active/retrying
Apple subscriptions cannot start duplicate web billing. A completed local intro
reservation also prevents repeat redemption, even if external history changes.

The server checks the actual customer's complete bounded `status=all` history
under the owner lease before creating a new discounted intent. Pagination,
malformed history, ownership mismatch or provider failure means unknown, never
eligible. This is once per account, not identity-wide anti-abuse verification.

The authenticated billing snapshot includes `premiumIntro`:

- `ready: true, eligible: true`: exact configured offer and eligibility verified.
- `ready: true, eligible: false`: offer is ready but the account is verified
  ineligible. A UI may explicitly offer ordinary USD 19 pricing instead.
- `ready: false` or `null`: unavailable/unknown. This is not evidence that the
  user should be silently sent to an ordinary-price checkout.

A recoverable declined payment can reuse the same hosted checkout. If Stripe
has created an incomplete subscription, the checkout endpoint only reopens a
session whose subscription ID exactly matches that incomplete subscription;
it never creates another subscription. The general snapshot remains
terminal-status-only until actual provider testing establishes that a separate
resume state is needed. The initial actual hosted TEST decline did not create
a subscription: the snapshot remained eligible, checkout remained available,
and access was not granted. No incomplete-state UI change was therefore made;
UI re-entry after a hypothetical incomplete state is still not verified.

After cancellation, a reservation that locally still says `open` may already
be completed at Stripe. Its owned provider state is read and persisted first.
The old request key remains completed. Only a **new** key after verified
`canceled`/`incomplete_expired` state can request a new purchase: another intro
is rejected by historical/local consumption, while an explicitly selected
ordinary-price plan can create a new undiscounted intent. An active subscription
still cannot create a second checkout. This re-entry correction was discovered
by the actual TEST lifecycle and reproduced with failing-then-passing tests;
the subsequent actual-provider rerun confirmed the repeat-intro denial. A fresh
ordinary-price checkout after cancellation is verified by the service fixtures
only, not by another external Checkout creation/payment.

## Access and renewal

Browser success, coupon metadata and a Checkout Session do not grant Premium.
The signed webhook/refreshed provider reader needs the persisted intro contract,
the current USD 19 monthly Price and a paid current-period invoice. The first
invoice must show the exact approved USD 10 discount from that reservation's
coupon. A USD 9 paid first invoice can then grant one Premium period.

Subsequent invoices must use the same USD 19 Price without that discount. The
first invoice's discount remains inspectable even after the once coupon is
removed from the subscription. Disabling the campaign or retiring its coupon
does not invalidate previously paid access or renewals with correct evidence.
Existing ordinary subscriptions retain their prior reader behavior. This offer
does not implement automatic mid-period plan switching.

## TEST setup and evidence boundary

`scripts/setup-premium-intro-sandbox.mjs` is inspect-only by default. It requires
fresh process credentials, `SAJDA_STRIPE_INTRO_SETUP=1`, `STRIPE_MODE=test`, the
configured Premium Price and an explicit `--account=acct_...` fence. Only an
explicitly approved `--apply` creates one missing TEST coupon after a complete
bounded inventory and verification of the existing Sajda Premium Product. An
existing invalid/ambiguous coupon stops setup rather than creating a duplicate.
Fresh expanded coupon readback is required. It never changes Vercel variables,
Prices, Products, customers, subscriptions, webhooks or live data.

Automated tests cover the integer commercial contract, malformed/foreign
discounts, paid-period grants, renewal invoice fixtures, identity/ownership,
first-subscriber history, schema readiness, retries, stored intent and the real
Stripe SDK's serialization using denied-external-network synthetic transport.
These are **not** real Stripe transaction or recurring-renewal evidence.

## Actual hosted TEST evidence — 2026-10-08

The final successful run of `scripts/probe-stripe-sandbox-lifecycle.mjs
--premium-intro=1` was `61021d1c-3f18-4b37-b3ab-4f2d53fffa86`. Its redacted
local receipt is `.vercel/commerce-fresh/premium-intro-result.json` (git-ignored;
contains no credentials). This was an opted-in **local app → real Stripe TEST
Checkout/CLI → isolated Preview Neon** integration, not registered deployed
webhook delivery or real account-authentication verification.

Observed and verified:

- Hosted card decline created zero subscriptions, granted no paid plan and
  left intro eligibility/checkout available. Successful TEST-card retry used
  the same hosted session; the initial purchase created exactly one session.
- The actual first paid invoice was USD 9 while the subscription's regular
  monthly Premium Price remained USD 19. The approved coupon was USD 10 off
  once, read back with exact Premium-product scope.
- Genuine signed Stripe CLI events reached the app handler and actual Preview
  Neon entitlement; the central membership reader returned Premium. Seven
  deliveries were recorded. Duplicate replay was handled and tampering was
  rejected with HTTP 400.
- An actual reviewed billing-portal session was created. Period-end cancellation
  kept the paid Premium period; immediate TEST cancellation revoked access.
- The returning canceled customer was no longer intro-eligible. A second explicit
  intro request returned `409 intro_offer_unavailable`, without a Checkout URL
  or another session. It did not quietly open ordinary USD 19 payment.
- Cleanup confirmed zero owned database fixtures, zero active TEST subscriptions,
  deletion of the owned TEST customer and one refunded TEST payment. No live
  funds moved and no production writes occurred. Provider audit history remains.

Three concurrent signed deliveries received expected `billing_busy` HTTP 503
lease denials before another authentic delivery reconciled the paid state. The
final run did **not** exercise explicit authentic-invoice retry or prove the
registered provider's automatic retry schedule. The permanent local concurrency
test separately verifies identical-byte retry after the lease releases.

The final focused backend run passed 74 commerce/intro-SDK/portal tests, plus
two safe setup/hygiene tests. API type checking, targeted ESLint and diff hygiene
passed. Renewal invoices, malformed/foreign discounts and the explicit returning
ordinary-price purchase path are covered by fixtures, not actual recurring
charges or a second external purchase.

Still unverified by this run: registered deployed callback, actual account login,
automatic provider retry, a real renewal/failed renewal, incomplete-subscription
UI re-entry, fresh ordinary USD 19 Checkout after cancellation, real email
delivery, live coupon/payment activation and App Store introductory products.
No physical iPhone/VoiceOver testing is claimed by this integration probe.

## Swipe return and deployed-browser evidence

Swipe's offer states both USD 9 for the first month and USD 19/month afterward,
the first-subscription restriction, automatic renewal, cancellation and the
tax/total boundary. Preview explicitly labels TEST payment. A native app does
not open web Stripe checkout or imply that this web offer is an App Store offer.

Before sign-in or checkout, a bounded, two-hour, same-tab checkpoint preserves
the selected endings, cards, current position and one-step undo history. It
contains no payment entitlement. An explicit return consumes it once, enforces
the settled owner and labels old availability as an earlier registry check.
Neither a success URL nor a restored card grants Premium: undo still needs the
current server authorization. Storage failure prevents leaving the deck.

The separate Preview browser probe exercises actual account sign-in, session
persistence, billing GET and Free-account undo denial. Only `/api/domain-search`
is intercepted with an explicitly synthetic 100-card deck, so this is navigation
and account evidence, not evidence of real domain availability or provider prices.
The pre-fix candidate passed at 320, 390, 768 and 1440 CSS pixels, including
keyboard focus, auth return, synthetic canceled/successful checkout-return URLs
and no checkpoint replay after reload. Exact owned fixture cleanup read back zero.
The browser probe does not create a Checkout Session or send email.

A separate reproduction held an unchanged successful guest session response
before delivery and proved a startup race: Start was enabled, the settings
closed, and no deck request was made. The fix keeps Start disabled with a
localized account-check status and also guards the handler before dismissal.
The probe now holds that real response deterministically until the disabled
button, visible settings and absence of a deck request are asserted; it then
releases the response and requires a successful start. A delayed response is not
an authentication mock. Each run writes its exact candidate and cleanup result
to `.vercel/swipe-premium-browser/result.json`; do not attribute a pre-fix pass
to a later deployment. No physical iPhone or VoiceOver check is implied.

Primary references: [Stripe coupons](https://docs.stripe.com/billing/subscriptions/coupons),
[Coupon object and includable product scope](https://docs.stripe.com/api/coupons/object),
[Checkout discounts](https://docs.stripe.com/payments/checkout/discounts),
[invoice discounts](https://docs.stripe.com/api/invoices/object),
[Discount source](https://docs.stripe.com/api/discounts/object).

# Commerce release evidence — 2026-10-08

This ledger distinguishes actual external-provider checks from local fixtures.
It is not approval to enable live payments. No live payment or production
commerce/database mutation was performed in this pass.

## Verified current TEST configuration

The official Vercel CLI independently confirmed the linked `hypbit/sajda`
project. Stripe SDK reads used fresh Preview process configuration from an
isolated linked directory without repository `.env` fallbacks. Inaccessible
Secret values were not treated as retrieved credentials.

- Sandbox account: `acct_1UDqPlAJ7seQoN51`, observed `livemode=false`.
- Active monthly USD Price contracts: Basic 9, Premium 19, Trading 49.
- Preview new-checkout flags: Basic off, Premium off, Trading on.
- The existing configured event destination points to the older immutable
  `sajda-k455asubf-hypbit.vercel.app` deployment. Its signing secret was not
  available through environment pull. Neither destination nor secret was changed.
- Catalog readback: three products, four Prices and two portal configurations.
  Existing historical Price/configuration records were preserved.

## Confirmed plan-switch failure and safe release boundary

A new disposable TEST customer/subscription paid the Basic invoice. Replacing
its Price with Premium using the existing portal's `create_prorations` policy
kept Stripe's subscription active and preserved the monthly period, but did not
produce a paid, non-proration invoice line for the new Price. The application's
strict payment evaluator correctly refused the new entitlement. The prior
portal therefore exposed a plan-change operation the application could not
complete coherently.

Actual reproducible evidence:

- Run: `5fa3aba1-4fff-420b-beff-e18f05ca109a`.
- Disposable customer: `cus_VP3wtCVywX3luD`.
- Disposable subscription: `sub_1UOFoyAJ7seQoN51N9vwNxEY`.
- Paid Basic invoice: `in_1UOFoyAJ7seQoN514QUe16D4`.
- Before change: Basic grant; after change: active Premium subscription, no grant.
- Cleanup: exact owned subscription canceled, its one payment refunded and
  exact owned TEST customer deleted. No existing customer was changed.
  Stripe retains historical audit records after cleanup.

The authorized launch-safe fix disables only
`features.subscription_update.enabled` on the exact existing TEST configuration
`bpc_1UMxk4AJ7seQoN51P7xkqjes`. Its active state, TEST mode, unique Sajda metadata
and prior supported feature shape were verified first. Provider readback confirmed
cancel-at-period-end, invoice history and payment-method update remain enabled,
and automatic plan changes are disabled. No redundant portal or catalog object
was created. No checkout flags, webhook or Vercel variable were changed.

Application changes enforce this safe portal contract before creating a Checkout
or portal session. Pricing and account billing explain the actual cancellation /
choose-another-plan path, rather than advertising a nonexistent immediate upgrade.
A returning canceled customer with both `canManage` and `canCheckout` can choose
a new enabled package; an active subscriber receives billing management instead.

Immediate self-service upgrades/downgrades remain intentionally unsupported until
a paid-proration/credit transition model has actual provider and application proof.
Do not reenable portal switching merely because an invoice or subscription exists.

## Local regression evidence

- 68 focused commerce, plan-contract and mounted account-billing tests passed.
- 10 mounted Pricing tests passed, including returning and active customers.
- A subsequent permanent signed-event concurrency regression passed: the denied
  delivery receives HTTP 503 without consuming the event; retrying identical
  signed bytes after lease release reconciles once, then returns a duplicate.
  The focused commerce file now passes all 47 tests.
- Two separate probe-hygiene tests cover denied opt-in/runtime execution before
  writes and the explicit Preview fence/pinned cleanup-client/readback contract.
- TypeScript check, ESLint and 102 English-source locale dictionaries passed.
- Independent read-only review repeated all 78 tests and five isolated SDK-wiring
  checks: request-local portal-read coalescing, fresh read on the next request,
  unsafe-portal checkout denial before customer/reservation creation, unsafe-portal
  session denial, and recovery on a later healthy request. No external provider
  call or repository edit was part of that independent check.

## External lifecycle proof and remaining gates

`scripts/probe-stripe-sandbox-lifecycle.mjs` is an explicitly opted-in local
integration probe, not a deployed/authentication test. It uses a fresh TEST key,
official Stripe CLI signed delivery, actual hosted Checkout and a fenced Preview
Neon database. The launcher must remove Vercel runtime/OIDC markers and use the
explicit isolated local probe directory. Exact allocated account/customer
ownership, Preview/Production database separation, bounded inventory and cleanup
readbacks are required. It does not rotate the deployed signing secret.

Actual execution completed successfully for run
`22503e37-35ce-4865-8749-e6afb0e43c8e`, using headless Microsoft Edge at
390 × 844 CSS pixels (not a physical iPhone test):

- Actual hosted Stripe TEST card decline produced no paid entitlement; retry
  using the successful TEST card completed the same USD 49 Checkout Session.
- Original and new request keys reused exactly one owned Checkout Session.
- Genuine signed Stripe CLI events reached the unchanged app webhook handler;
  actual Preview Neon records granted Trading and the central membership reader
  returned Trading. Seven deliveries, including the explicit duplicate, were
  recorded by this run.
- Replaying identical actual invoice bytes/signature returned `duplicate=true`;
  appending a byte under the original signature returned HTTP 400.
- The actual reviewed Stripe portal session was created.
- Actual cancel-at-period-end updated the exact owned database record while
  preserving paid access; immediate TEST cancellation revoked access and central
  membership returned Free. The returning customer could choose checkout again.
- After browser/listener shutdown and HTTP drain, exact owned fixture cleanup
  confirmed zero database account/customer/checkout/access/event records, zero
  active TEST subscriptions, one successful TEST refund and deletion of the exact
  owned TEST customer. Stripe historical audit objects remain.

Concurrent CLI deliveries sometimes received expected `billing_busy` 503 lease
denials. The harness can retry the exact authentic invoice body/signature within
its signature-valid window; an earlier run verified that explicit retry path.
In the final successful run `invoice.paid` was accepted on its first delivery.
The CLI does not prove the registered provider's automatic retry scheduling.

Deployed callback delivery, real account authentication, renewal/failed renewal,
real Stripe email delivery and production commerce remain separate release gates.
The local fixture authentication boundary and injected rate limiter are explicitly
not authentication/rate-limit verification. The unclaimed-sandbox notice observed
on hosted Checkout is not a merchant's completed live onboarding.

## Primary documentation

- [Stripe plan-price changes](https://docs.stripe.com/billing/subscriptions/change-price)
- [Proration does not necessarily collect a payment](https://docs.stripe.com/billing/subscriptions/prorations)
- [Customer portal configuration](https://docs.stripe.com/customer-management/configure-portal)
- [Stripe TEST flows](https://docs.stripe.com/testing)
- [Official Stripe CLI listener](https://docs.stripe.com/cli/listen)
- [Stripe signed webhooks](https://docs.stripe.com/webhooks)

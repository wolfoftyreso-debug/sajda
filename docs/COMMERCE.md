# Sajda Trading billing operations (legacy Plus identifiers)

The site now has Gratis, Bas, Premium and Trading. Current monthly prices are
USD 0 / 9 / 19 / 49 in `shared/plans.ts`, revised on 2026-09-11. This billing implementation applies
only to **Trading**, retaining the `sajda-plus` identity and `STRIPE_PLUS_*`
configuration for compatibility. Bas/Premium purchases are not activated.
See `PRICING-TIERS-2026-09-09.md` for the tier/feature activation boundaries.

## What is implemented (not a claim that Stripe has been activated)

The server uses Stripe SDK 22.6.1, pinned API version `2026-08-26.dahlia`.
The application owns its customer mapping, checkout reservations, processed
event ledger and finite, namespaced Plus grants in Neon. Browser success URLs
never grant access. No product, price, customer, subscription, invoice or active
grant is created by the migration or build.

The approved price is **USD 49 per month**, sourced from the shared catalog by
`shared/plus-plan.ts` as 4,900 cents, USD, one-month billing. A lower catalog
price does not activate checkout or prove commercial readiness. The actual
configured Stripe Price must match that contract:
licensed, per-unit recurring billing with exactly one unit and no tiers,
quantity transformations or customer-chosen amount. Both new-checkout price
reads and subscription entitlement reconciliation validate the expanded Stripe
Price, including its integer/decimal amount, currency, period, ID and mode.
No missing or mismatched Stripe response is replaced with a marketing price.
Checkout explicitly selects USD; alternate currency options cannot choose a
different currency. New, reused and recovered open Checkout Sessions must also
have complete line-item evidence for exactly one matching Price and USD currency
before the server returns their payment URL. Tax-exclusive subtotals and
tax-inclusive totals are not mistaken for the Price's unit amount. A stored
session from an older price cannot bypass the current contract.
Tax treatment, cancellation terms and actual service/payment
verification still need to be completed before sales are enabled.
Trials, annual plans, seat quantities, upgrades, proration-based grants and
zero-value invoices are intentionally unsupported in this first paid plan.

## Environment contract

All variables below are **server-only** and must never have a `VITE_` prefix.

| Name                                      | Required behavior                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | The database belonging to this environment                                                |
| `STRIPE_MODE`                             | Defaults to `test`; only `test` or `live`                                                 |
| `STRIPE_SECRET_KEY`                       | `sk_test_...` in preview/development, `sk_live_...` in production                         |
| `STRIPE_WEBHOOK_SECRET`                   | Endpoint signing secret, not the API key                                                  |
| `STRIPE_PLUS_PRICE_ID`                    | Existing Price matching exactly USD 49 (4,900 cents), every one month                |
| `STRIPE_PORTAL_CONFIGURATION_ID`          | Existing customer portal configuration                                                    |
| `STRIPE_CHECKOUT_ENABLED`                 | Exactly `true` to permit new checkout                                                     |
| `STRIPE_LIVE_ENABLED`                     | Exactly `true`, **in addition** to live mode and production, to permit live configuration |
| `BETTER_AUTH_URL` and Vercel URL metadata | Existing trusted origin/callback configuration                                            |

Production rejects test mode. Preview/development reject live mode. Production
uses its own Neon database; it must not share pilot/test users or manual grants
with preview. Legacy operator grants remain independent of billing, so canceling
a paid subscription does not secretly remove an independently granted operator
permission. Billing does not copy a separate Swipe undo grant; active Trading
membership inherits Premium capabilities through the central membership reader.

Disable new sales by setting `STRIPE_CHECKOUT_ENABLED=false`. Keep API and
webhook credentials configured: existing customers must retain portal access,
cancellation and reconciliation while new sales are paused. A price-read outage
disables checkout but does not disable the mapped customer's billing portal.
A mismatched price likewise disables new purchases while keeping cancellation
available. Archiving an otherwise exact matching Price blocks new purchases,
but does not revoke already-paid time on an existing matching subscription.

## Price revision and sandbox migration

The 2026-09-11 catalog supersedes Premium USD 29 and Trading USD 1,880; the
historical verification reports retain their original observations. Basic
remains USD 9 and Free remains USD 0. Premium has no active web checkout.

The read-only audit of sandbox `acct_1UDqPlAJ7seQoN51` found zero subscriptions,
zero invoices, zero PaymentIntents and one test customer. Live/production
subscriber state was not verified. Never infer that production is empty from
this sandbox result.

```sh
node --import tsx scripts/setup-stripe-sandbox.mjs --account=acct_1UDqPlAJ7seQoN51
# Only after approval to write the sandbox catalog:
node --import tsx scripts/setup-stripe-sandbox.mjs --account=acct_1UDqPlAJ7seQoN51 --apply
```

The setup script reads the central Trading amount and versions the Price lookup
and idempotency keys with that amount. It reuses the existing product and portal
and preserves older Prices. Changing a catalog number never edits an immutable
Stripe Price, starts checkout, updates Vercel configuration or migrates a
subscription. Until the USD 49 Price exists and is explicitly configured, the
old USD 1,880 Price must fail the current checkout and entitlement validators.

On 2026-09-11, test Price `price_1UEGrIAJ7seQoN51F0OIF5K7` was created
at USD 49/month and verified by a fresh provider read. The existing product,
portal and historical USD 1,880 Price were preserved. Preview/Development
`STRIPE_PLUS_PRICE_ID` now points to the new test Price, while
`STRIPE_CHECKOUT_ENABLED=false` remains unchanged. No live configuration,
payment, subscription, invoice or customer was created by this price revision.

Before any future price change with paying subscribers, inventory that
environment's subscriptions and paid periods, define a grandfathering or
consented migration policy, and test its implementation. The current single-
price contract does not grandfather a different amount; changing it blindly
could remove valid paid access. No subscriber migration is performed here.

## Endpoints and Stripe configuration

- `GET /api/account/billing`: verified session, account identity race guard,
  private/no-store response. Returns configured price and server capabilities.
  Billing snapshots older than 60 seconds are reconciled with current Stripe
  state under the same fenced lease, repairing missed webhooks on return visits.
- `POST /api/account/billing`: strict JSON `{ action: "checkout" | "portal",
requestKey: "UUID" }`; verified email, session, exact same-origin and
  `x-sajda-account` required. Caller cannot select price, customer or subscription.
- `POST /api/billing-webhook`: raw signed bytes, 256 KiB maximum; signature age
  tolerance 300 seconds. Do not put JSON middleware in front of this handler.
  It deliberately bypasses Vercel's lazy parsed `req.body` getter and reads the
  restored raw data/end stream. Only Stripe hosted HTTPS URLs are returned.

Create a **sandbox** event destination first with the pinned API version and
the actual preview URL. Subscribe to these implemented events:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
charge.dispute.created
```

Customer ownership is established by the database mapping, never by a webhook's
account metadata alone. Subscription lists, paid invoices, invoice line periods,
price, quantity, mode and ownership are checked again. A stale event causes a new
read of **present** Stripe state rather than restoring its old payload. Duplicate
events and the matching state write commit in one database transaction.

An active subscription alone is insufficient: access ends at the paid invoice
line period, no later than the current subscription period or scheduled
cancellation. Failed renewal, canceled/unpaid/paused/trial state cannot grant.
Cancellation at period end keeps only already-paid time. Full refunds and new
disputes place a durable safety hold; clearing that hold requires an operator's
documented review. Partial refunds do not automatically cancel the subscription.
Stripe receipts, dunning and invoice emails must be configured and delivery
tested in Stripe; this implementation does not claim those emails are delivered.

## Retry and failure behavior

An owner has at most one open/creating checkout and one 45-second fenced billing
lease. Database locks are not held during Stripe network calls. SDK calls time
out after five seconds and do not silently multiply requests. Persisted UUIDs
provide stable idempotency keys; no user email is put in those keys.

If a create response was lost, retrying a reservation older than 25 minutes
reconciles up to 100 sessions belonging to the same Stripe customer, matching
the server's persisted reservation UUID and namespace. Pagination or ambiguity
fails closed. A discovered session is recovered. Only a complete listing that
proves no resource exists allows the reservation to become `abandoned` and a
new UUID to begin checkout. An old UUID is not recycled after expiry.

An unresolved customer-creation attempt older than 23 hours remains blocked for
operator reconciliation because Stripe can prune idempotency keys after 24
hours. Do not retry it by deleting rows or inventing a new customer ID. The
operator must verify the exact Stripe customer metadata and mapping before
repair. Customer records contain a stable `customer_key` and server-hashed
owner metadata for correlation, without exposing a browser-controlled identity.

## Verification commands and remaining release gates

```sh
npx tsx --test tests/commerce.test.ts tests/lost-domains-store.test.ts
node --env-file=.env.neon-development.local --import tsx scripts/check-commerce-store.mjs --run
```

The database harness uses unique synthetic owners and one outer transaction
that always rolls back. It does not require an empty source catalog, modify
existing pilot accounts, call Stripe or claim real payment evidence.

Before enabling sales, execute the actual sandbox journey: new and returning
account, successful/declined card, cancel/back/refresh, delayed and duplicate
webhook, renewal failure, period-end cancellation, portal, retry, restored
session, expired grant and cross-account API denial. Check the Stripe state,
Neon state, observed UI and real receipt delivery. Synthetic signed fixtures or
a passing build do **not** count as this external Stripe validation.

Read-only snapshots and failed requests log safe correlation codes only. No
payment payload, API key, signature, customer email or card details are logged.
Use request IDs plus the event/customer ledger to investigate incidents.

## Apple and Stripe coexistence (2026-09-10)

Before opening Stripe checkout, the server checks for account-owned App Store
subscriptions in the same environment and repeats the check after acquiring the
existing fenced Stripe customer lease. Active, billing-retry and grace-period
Apple records block a second Stripe checkout. Turning off Apple auto-renewal does
not by itself release this guard: the remaining paid period still belongs to
Apple. A stale record is not proof of cancellation; synchronize App Store status
to confirm expiry or revocation. An unavailable database check fails closed.

The website receives an `appStoreManaged` flag when that guard is active and
offers [Apple subscription settings](https://apps.apple.com/account/subscriptions)
instead of a Stripe purchase button. A subscription discovered between reads
returns `app_store_subscription_exists` (409) with the same recovery path. An
existing Stripe portal remains available, so an account which already has both
providers is not prevented from managing its Stripe billing.

This protects **known existing** subscriptions. It is not an atomic reservation
across Apple and Stripe: simultaneous first purchases on different platforms or
an externally opened checkout can still race. Sales remain gated until sandbox
tests cover these states and a cross-provider reconciliation/support policy is
approved. No code in this pass performs a real purchase, refund or cancellation.
Account deletion has its separate explicit confirmation and recovery contract
in [ACCOUNT-DELETION.md](ACCOUNT-DELETION.md).

## Primary evidence

- [Stripe webhook delivery, signatures and unordered events](https://docs.stripe.com/webhooks)
- [Subscription lifecycle and paid-invoice access](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe idempotency retention and retry semantics](https://docs.stripe.com/api/idempotent_requests)
- [Current subscription item billing periods](https://docs.stripe.com/api/subscriptions/object)
- [Price amount, decimal precision, pricing schemes and active-purchase status](https://docs.stripe.com/api/prices/object)
- [Checkout Session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Invoice line price and paid-period structure](https://docs.stripe.com/api/invoice-line-item/object)
- [Vercel raw body guidance](https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function)
- [Vercel Node helper source: lazy body getter and restored raw stream](https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/helpers.ts)

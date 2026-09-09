# Stripe sandbox verification — 2026-09-09

## Scope and evidence

This pass used only the Vercel-provisioned Sajda Stripe test sandbox. The local
integration credential file remains ignored under `.vercel/`; no credential or
hosted customer-session URL is recorded here.

- Account ID: `acct_1UDqPlAJ7seQoN51`.
- Actual `/v1/balance` response: `livemode=false`.
- Actual account response: `charges_enabled=false`.
- Initial inventory: zero products, prices, or billing portal configurations.
- Catalog read-back and a repeated setup pass: exactly one of each, reused
  without duplicate creation.

The unclaimed sandbox permitted the product, price, billing portal configuration,
test customer, Checkout session and hosted portal session API operations exercised
below. This does **not** establish that payment can be completed without claiming
the sandbox, activating the Stripe account, or further provider configuration.

## Test catalog

| Resource | ID / configuration |
| --- | --- |
| Product | `prod_VEJZsHmVjnlif8` — Sajda Trading |
| Monthly price | `price_1UDqwnAJ7seQoN51hENq3A2v` |
| Amount | USD 188,000 cents = USD 1,880 per month |
| Model | Recurring monthly, interval count 1, licensed, per-unit |
| Tax behavior | `unspecified`; no tax/legal policy was changed |
| Portal | `bpc_1UDqwnAJ7seQoN51W3TViFG7` |
| Cancellation | At period end, no proration |
| Portal capabilities | Invoice history and payment-method updates enabled |
| Portal restrictions | Customer-data edits, subscription upgrades, and public login disabled |

Required application identifiers are `STRIPE_PLUS_PRICE_ID` and
`STRIPE_PORTAL_CONFIGURATION_ID`. The legacy `PLUS` variable name refers to the
current Trading commercial contract. This work did not enable billing, change
Vercel environment variables, create webhook endpoints, or modify live resources.

## Actual SDK defect repaired

The application rejected the real valid price with `billing_price_unavailable`.
Stripe's installed SDK represents `unit_amount_decimal` using its arbitrary-
precision `Decimal` object, while the strict validator intentionally expects the
original wire-format decimal string. This behavior is documented in Stripe's
[v21 migration guide](https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v21#decimal-fields-use-stripedecimal-instead-of-string).

The provider now restores the SDK's lossless JSON wire representation before
validating fetched prices, expanded Checkout line-item prices, and subscription
item prices. It never rounds through `Number()`. Raw payload validators and
signature-verified webhook handling retain their strict validation; they do not
accept arbitrary objects with `toString`, `toJSON`, or `valueOf` methods.

Regression tests use the installed SDK's real `Stripe.Decimal`, including exact
188000, smaller/larger fractional values, and forged object coercion. The actual
provider now accepts the real retrieved USD 1,880 sandbox price.

## Provider execution results

The following steps were executed through the application's actual commerce
provider and Stripe SDK, not just fixtures:

1. Read and validate the approved sandbox price: passed.
2. Create one test customer without email, name, or card details: passed.
3. Reconcile the new customer: no subscription and no entitlement.
4. Create a single subscription Checkout session: passed, open session on
   `checkout.stripe.com` with the approved price.
5. Retrieve and recover that same session using its persisted-style request ID:
   passed, same session returned.
6. Create a test billing portal session: passed, hosted at `billing.stripe.com`.
7. Explicitly expire the probe Checkout session: passed.
8. Re-read expired Checkout: no payment redirect is returned.
9. Reconcile the unpaid test customer: no subscription and no entitlement.

No card data or payment was submitted. No email was sent. One metadata-only test
customer remains in the test sandbox. The probe Checkout was expired, not left
open. No real customer or production data was changed.

Local verification: 33 commerce tests passed; targeted ESLint and Vercel API
type-checks passed. This pass does not certify a deployed browser flow, successful
or declined payment, webhook delivery, database reconciliation, recurring payment,
or cancellation of an actually paid subscription. Those remain separate gates.

## Repeatable setup

```sh
node scripts/setup-stripe-sandbox.mjs --account=acct_1UDqPlAJ7seQoN51
node scripts/setup-stripe-sandbox.mjs --account=acct_1UDqPlAJ7seQoN51 --apply
```

Without `--apply`, the script is read-only. It requires the explicit account ID,
test-only secret and publishable keys from the one ignored sandbox file, and an
actual `livemode=false` response. It stops on inventory truncation, ambiguity,
incompatible existing objects, account mismatch, provider errors, or live keys.
Writes use stable metadata and idempotency keys; the script never enables the
application checkout, creates a webhook/customer/charge, or writes env files.

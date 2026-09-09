# Sajda Plus — fixed-price implementation, 2026-09-09

> Price superseded by the operator's later explicit decision: **USD 1,880 per
> month**. The original USD 2,000 implementation and verification below are a
> historical record. See `PLUS-PRICE-1880-2026-09-09.md` and `shared/plus-plan.ts`
> for the current approved contract.

## Decision and contract

The operator's correction, “Inte preliminär! Bygg ordentligt”, confirms the
previously stated **USD 2,000 per month**. It does not accept third-party legal
terms, authorize a real debit or establish successful payment/email delivery.

`shared/plus-plan.ts` is the immutable shared plan definition: 200,000 cents,
USD, one month. Swedish and English price labels use that definition. Missing
provider configuration no longer makes the agreed price provisional.

Both server and client reject a different provider amount, currency or billing
period. Stripe Price evidence must also be licensed/per-unit, the expected
mode/ID, and have no tiers, quantity transforms or custom amount. New, reused
and recovered open checkout sessions must contain exactly one matching priced
item in USD. An invalid price disables new checkout; it does not hide an existing
customer's cancellation portal. An otherwise valid archived price does not
revoke an already-paid subscription period.

Stripe's documented [Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create)
support explicit currency and disabling Adaptive Pricing. The
[price lifecycle](https://docs.stripe.com/products-prices/manage-prices)
distinguishes archiving for new purchases from existing subscriptions. These
references informed the integration; they are not evidence of a live payment.

## Product changes

- Fixed monthly price instead of preliminary/indicative marketing copy.
- The price card lists actual checks, timestamped evidence, saved reports and
  manual run controls. The same run limits are visible before login.
- Access granted for testing is explicitly separate from a paid subscription.
- Fresh candidates beyond the displayed top 30 no longer receive a false
  expired-evidence warning. Genuine expired evidence remains excluded.
- No claims of guaranteed registrability, valuation, corporate ownership or
  an unattended daily engine were introduced.

## Verification record

- Full `npm run check` after final code changes: **389 passed, 0 failed,
  2 opt-in tests skipped** (391 total). Lint, app/server TypeScript, syntax,
  SEO/Neon boundary policies and UI contracts passed.
- Independent actual Neon commerce transaction harness: **14 checks passed**,
  every synthetic fixture rolled back, zero Stripe requests.
- Vercel Preview **READY**: `https://sajda-5q9bvug54-hypbit.vercel.app/plus`,
  deployment `dpl_5xLuZAYvbyDZuCRLWiYqs8WPxfiX`, function region `fra1`.
  The production alias was not promoted. Use the user-delivered share link;
  project-wide protection remains enabled.
- **52 actual deployed HTTP checks passed**. Database health returned 200 and
  connected; private endpoints, invalid inputs, routes and intended 404s passed.
- Real deployed password login, session, Plus access, two enabled sources,
  foreign-owner denial, logout denial and report persistence after re-login
  passed. Billing returned unconfigured and checkout disabled, as expected.
  No crawl was started or advanced; the remaining pilot quota was preserved.
- Actual browser: English and Swedish fixed price, public limits before login,
  mobile login, account identity and billing-status refresh inspected. Viewports
  320, 390 and 1440 had no horizontal overflow. Screenshots inspected at 320
  and desktop widths; temporary viewport override reset afterward.
- No browser warning/error logs or visible alerts observed. Vercel runtime logs
  retained a Node DEP0169 `url.parse()` dependency deprecation warning on a
  successful sign-in request; it is not claimed to be resolved.

The 31-fresh-candidate overflow fix is covered by a mounted React regression
fixture, not a fabricated live findings report. Stripe adapter, signature and
state tests use synthetic provider data; no external payment was executed.

## Remaining release boundaries

Public paid production remains **NO-GO**, not because the price is provisional:

1. Stripe installation still requires operator acceptance of the Vercel/Stripe
   terms. No Stripe resource, test transaction or live subscription was created.
2. Resend remains unconnected: no authenticated key/verified sender or actual
   verification, password reset or contact delivery has been verified.
3. Tax/cancellation terms and real provider lifecycle tests remain prerequisites
   to enabling paid sales. No real debit is authorized by this change.
4. A commercially useful findings feed and registrar-confirmed availability are
   not yet proven. Existing bounded source policies and review expiries remain.

Vercel/Neon stay in use. No DNS, production data, database migrations, crawl
quota, live billing settings or production deployment were changed in this pass.

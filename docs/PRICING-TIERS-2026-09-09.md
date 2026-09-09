# Sajda pricing: four levels

The operator confirmed three paid tiers plus a free tier and delegated the Bas
and Premium prices. Fixed monthly prices, in US dollars:

| Tier | Monthly price | Intended customer |
| --- | ---: | --- |
| Gratis | USD 0 | Try domain discovery |
| Bas | USD 9 | Occasional projects and simple saved-name work |
| Premium | USD 29 | Regular research and a larger workflow |
| Trading | USD 1,880 | Professional Lost Domains research |

`shared/plans.ts` is the immutable commercial catalog. `shared/plus-plan.ts`
delegates its Trading price to the catalog while preserving the `sajda-plus`
internal billing identity. The public name is Sajda Trading; `/plus`, existing
pilot grants, Stripe environment-variable names and database identifiers stay
unchanged. Changing a catalog entry never grants access.

## Product and market reasoning

Bas is a low-commitment entry; Premium is a meaningful step up without sharing
Trading's specialist pricing. No annual discounts, new tax treatment, live
Stripe Prices or subscription migrations were introduced.

The primary-source market check reinforces keeping the entry affordable:
[Instant Domain Search](https://instantdomainsearch.com/learn/guides/how-to-check-domain-availability)
offers free availability checks, while its
[product updates](https://instantdomainsearch.com/learn/updates) describe free
accounts and saved domains. USD 9/29 are Sajda's product decisions, not claimed
market medians or a forecast of conversion or profitability.

## Activation boundaries (verified implementation, not proposed functionality)

- Current introductory allowance: one completed search or Swipe deck per
  browser, not a durable account quota. The requested future free tier should
  offer several searches; that allowance change is not implemented here.
- Verified account owners can save to Neon today without a paid plan. Existing
  saves and user permissions have not been removed.
- Watchlist entries are saved observations, not active scheduled monitoring.
  No automatic availability or price notifications are enabled.
- Swipe Undo has a fresh server entitlement check. Current Trading billing
  grants Lost Domains only, not Swipe Undo or Bas/Premium monthly allowances.
- Lost Domains uses existing bounded, permission-checked research runs. It
  does not place bids/buy domains or guarantee value or registrability.
- Stripe/Resend remain unconfigured in the inspected preview environment.
  No new plan has an active buy button, and no user has been charged.

The pricing page distinguishes the approved price/positioning from available
functionality. Paid monitoring and numerical plan allowances are not advertised
as operational. The pricing page is noindex pending commercial activation.

## Required before paid tier activation

1. Central server-owned plan-to-capability mapping, including Trading inheritance.
2. Durable account quotas for free searches, monthly research and Swipe usage.
3. Plan-specific Stripe Price mappings and full sandbox lifecycle verification.
4. Scheduled status/price monitoring with verified notification delivery.
5. Explicit limits, tax/cancellation terms and a policy for existing free saves.

These are implementation gates, not uncertainty about the approved prices.

## Verification and deployment

- `npm run check`: 407 passed, 0 failed, 2 opt-in skipped (409 total).
  Includes mounted four-card pricing tests, copy, fixed contract, server
  commerce, route/header, TypeScript, lint and UI checks.
- Vercel preview READY: `dpl_35EGwdo9H93jmt64NPFTgZRi1vX8`,
  https://sajda-oyy5pgkv8-hypbit.vercel.app/pricing. No production promotion.
- Deployed HTTP/HTML/API smoke: 53 passed, database health HTTP 200 and connected.
- Actual deployed browser confirmed English/Swedish four-tier prices and
  disabled Bas/Premium purchase controls; Trading CTA navigated to the renamed
  workspace with matching USD 1,880 price. Return to homepage worked.
- DOM-backed checks at 320 and 1440 CSS pixels found no horizontal document
  overflow and all four card/price boundaries inside the viewport.
- A later homepage-to-pricing click attempt timed out in the browser control
  debugger. It is not claimed as passed; the direct route and rendered link
  were verified. Viewport override was successfully reset after reconnection.
- Real payments, tier-specific quotas and automatic monitoring were not
  activated or tested. No pilot grant, search quota or saved domain was changed.

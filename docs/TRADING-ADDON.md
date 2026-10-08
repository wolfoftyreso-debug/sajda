# Pro and Trading billing contract

Pro is USD 19/month. Trading is an optional USD 30/month addition, totaling USD 49/month. Internal IDs remain `premium` (Pro) and `trading` (Pro + Trading) for compatibility with existing subscribers and clients. They are not separate accounts. The existing USD 49 Stripe Price represents the bundle: one subscription, one licensed monthly item, quantity one. No second parallel subscription is created.

## Subscription changes

An existing, verified paid Pro subscriber can add Trading at the next renewal. A verified paid bundle subscriber can remove Trading at the next renewal, returning to Pro. Current paid time, current invoice and current access remain unchanged. No immediate prorations or speculative entitlements are issued. Access to the next period requires the normal matching paid-invoice reconciliation; creating a schedule does not grant it.

The server chooses the exact approved Price. Requests never accept customer IDs, schedule IDs, amounts, coupon IDs or arbitrary URLs. Native App Store billing continues to use one subscription group with the corresponding base and bundle products. Stripe changes are blocked for Apple-managed subscriptions; this is not a claim that App Store configuration or native purchases have been verified.

## Account API

`GET /api/account/billing` may include:

```json
{
  "tradingAddon": {
    "canAdd": false,
    "canRemove": false,
    "pending": {
      "enabled": true,
      "effectiveAt": "2026-11-08T12:00:00.000Z",
      "state": "processing",
      "canRetry": true,
      "canCancel": true
    }
  }
}
```

The example date is illustrative, not a scheduled customer change. `pending: null` means no pending Trading change was found and verified through this account's ledger. An omitted `tradingAddon` means unavailable or unverified: clients must not invent permission or silently substitute a purchase. `processing` means the result is uncertain or incomplete, not that a future change has been confirmed. `scheduled` requires genuine provider readback matching the complete reserved contract. GET never creates, updates or releases a Stripe schedule; it may persist observed ledger state.

Authenticated same-origin POSTs use account ownership and a request UUID:

```json
{"action":"trading-addon","enabled":true,"requestKey":"<request UUID>"}
```

Success returns `state: "scheduled"`, `enabled`, `effectiveAt`, `accountId` and `requestId`. Explicit removal uses `enabled: false`. A retry with the same intent reuses the stored operation even with a fresh browser request UUID; the immutable original UUID drives Stripe idempotency. A conflicting target cannot overwrite a pending request. JSONB object-key reordering is ignored when comparing the frozen request, but differences in values or array order fail closed.

```json
{"action":"cancel-trading-addon-change","requestKey":"<request UUID>"}
```

Success returns `state: "canceled"`, `accountId` and `requestId`. This releases only an owned, validated pending schedule; it does not cancel Pro, refund the current period or remove current paid access. Initial schedules can also be safely aborted if creating or updating them failed. Unknown creation responses are recovered with the original Stripe idempotency key, never by assuming an attached schedule belongs to Sajda.

Before next renewal, retries are bounded to 25 minutes after reservation. Aborting remains possible afterwards if ownership is recoverable. A missing schedule ID older than 23 hours is not blindly recreated: Stripe may prune idempotency keys, so operator reconciliation is required. The final two minutes before the effective boundary require refresh/reconciliation rather than risking a misleading cancellation result during a phase transition. The UI must distinguish unavailable, processing, scheduled and completed states.

## Portal and financial safety

The launch portal permits invoices, payment-method updates and cancellation, but not price switching. Stripe restricts cancellation while an update is scheduled. Therefore pending or processing Trading changes must first be explicitly released through the account action above; opening a portal never silently discards a pending future change. An already-applied, fully verified owned final schedule can be released during explicit portal entry, preserving the underlying Price, period and subscription so whole-subscription cancellation is not stranded. That release is not an entitlement grant and does not require a newly paid renewal.

Unsupported taxes, fees, thresholds, trials, additional invoice items, transfers and external schedules fail closed instead of being silently removed. Current discount identities are reused rather than redeeming a once-only intro coupon again; the future phase clears intro metadata and discounts. Owner-scoped fencing, database state expectations and persisted immutable request bodies protect concurrent and timeout recovery paths. Provider data is revalidated rather than trusting a local button result.

## Rollout

Migration `0027_trading_addon_changes.sql` is additive and immutable after application. The RLS-enabled owner/namespace ledger never grants access. New changes require both the verified ledger migration and `STRIPE_TRADING_ADDON_ENABLED=true`; the default is false. Turning the rollout flag off does not disable safe cancellation of already pending changes. Existing base and bundle purchase contracts are retained. The new UI requires an explicit known schedule state before portal entry; it does not treat an omitted DTO as proof that nothing is pending. Apply the ledger before deploying this release, including when new changes are disabled. Structural health checks now include the ledger and its recovery columns, without claiming payment verification.

Only isolated Preview received the ledger in this work. Production migrations, live Stripe settings and deployment/flag activation are separate release actions, not implicit outcomes of the implementation.

## Evidence

Synthetic regression coverage includes price/mode/owner validation, adverse phase settings, complete future-contract readback, one-subscription intent, concurrent/fenced persistence, JSONB semantic retry, uncertain create/update recovery, initial abort after timeout, feature-off cancellation, applied-phase portal release, phase-transition races, strict API input and account/abort-safe clients. Synthetic tests are not actual provider transactions.

Actual local Stripe TEST SDK → unchanged commerce service → isolated Preview Neon proof completed on 2026-10-08, run `eb25703b-5908-45e6-bde5-3714bb6f47f7`. Both Pro → Pro + Trading and bundle → Pro passed. Each used a genuine paid TEST invoice (USD 19 or USD 49), exactly one subscription and one schedule, provider-verified next-period Price, a real persisted owner ledger, unchanged current period/invoice/central membership, GET recovery, repeated request reuse, pending release, stable release replay and an actual portal session afterwards. Lost responses were deliberately injected after genuine successful Stripe create/update calls; they were not spontaneous provider failures. Both disposable customers and all database fixtures were removed, both TEST payments refunded, and zero active fixture subscriptions remained. No live funds moved and no production data was changed.

The reproducible bounded script is `scripts/probe-stripe-trading-addon.mjs`. The redacted local receipt is `.vercel/commerce-fresh/trading-addon-result.json` (ignored, not a committed credential or portable evidence artifact). It requires explicit local opt-in, fresh linked TEST credentials, the pinned Stripe account/catalog and distinct Preview/Production Neon identities. It refuses hosted Vercel runtime markers and arbitrary execution directories.

Not verified by this proof: hosted add-on UI, real account authentication, a registered deployed webhook, automatic webhook retry, actual next-month payment, applied-final-phase portal cancellation, App Store purchases, email delivery or production behavior. Current-period paid access and pending scheduling/release were verified; future renewal must not be described as exercised.

## Primary references

- [Stripe subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules): creating from an existing subscription, preserving current phase settings, future metadata and release semantics.
- [Stripe schedule update](https://docs.stripe.com/api/subscription_schedules/update) and [release](https://docs.stripe.com/api/subscription_schedules/release): exact API contracts and preserving the underlying subscription.
- [Stripe customer portal limitations](https://docs.stripe.com/customer-management#limitations): scheduled updates and cancellation restrictions.
- [Stripe TEST payment methods](https://docs.stripe.com/testing): SDK fixture payments do not move real funds.
- [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html): JSONB object-key ordering is not preserved.

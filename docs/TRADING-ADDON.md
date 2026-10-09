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

Stripe may express a portal period-end cancellation using `cancel_at` equal to
the sole verified subscription item's period end, while `cancel_at_period_end`
remains false. Reconciliation normalizes only that exact future safe-integer
boundary for a known Price; custom earlier/later dates are not relabeled. The
existing invoice-derived grant still caps access at the earliest paid/cancellation
end. A paid account with scheduled cancellation can still read a known empty
Trading-change ledger and open billing management, but cannot start another
add-on transition. Unknown external schedules remain unverified. This is a
backend/status correction, not a claim of a new UI cancellation badge.

Unsupported taxes, fees, thresholds, trials, additional invoice items, transfers and external schedules fail closed instead of being silently removed. Current discount identities are reused rather than redeeming a once-only intro coupon again; the future phase clears intro metadata and discounts. Owner-scoped fencing, database state expectations and persisted immutable request bodies protect concurrent and timeout recovery paths. Provider data is revalidated rather than trusting a local button result.

## Rollout

Migration `0027_trading_addon_changes.sql` is additive and immutable after application. The RLS-enabled owner/namespace ledger never grants access. New changes require both the verified ledger migration and `STRIPE_TRADING_ADDON_ENABLED=true`; the default is false. Turning the rollout flag off does not disable safe cancellation of already pending changes. Existing base and bundle purchase contracts are retained. The new UI requires an explicit known schedule state before portal entry; it does not treat an omitted DTO as proof that nothing is pending. Apply the ledger before deploying this release, including when new changes are disabled. Structural health checks now include the ledger and its recovery columns, without claiming payment verification.

The initial add-on implementation applied the ledger only to isolated Preview.
That statement is historical: the later production preparation on 2026-10-08
applied reviewed additive migrations `0025`, `0026` and `0027`, with all live,
checkout and add-on activation flags still OFF. Both environments were read back
as 28 applied migrations / 0 pending, with health 200. The root operator's
transaction/readback evidence is recorded in
`docs/LAUNCH-ADVANCEMENT-2026-10-08.md`; there is no invented portable migration
receipt. Schema preparation is not payment activation or a production deployment.
Live Stripe settings and deployment/flag activation remain separate release gates.

## Evidence

Synthetic regression coverage includes price/mode/owner validation, adverse phase settings, complete future-contract readback, one-subscription intent, concurrent/fenced persistence, JSONB semantic retry, uncertain create/update recovery, initial abort after timeout, feature-off cancellation, applied-phase portal release, phase-transition races, strict API input and account/abort-safe clients. Synthetic tests are not actual provider transactions.

Actual local Stripe TEST SDK → unchanged commerce service → isolated Preview Neon proof completed on 2026-10-08, run `eb25703b-5908-45e6-bde5-3714bb6f47f7`. Both Pro → Pro + Trading and bundle → Pro passed. Each used a genuine paid TEST invoice (USD 19 or USD 49), exactly one subscription and one schedule, provider-verified next-period Price, a real persisted owner ledger, unchanged current period/invoice/central membership, GET recovery, repeated request reuse, pending release, stable release replay and an actual portal session afterwards. Lost responses were deliberately injected after genuine successful Stripe create/update calls; they were not spontaneous provider failures. Both disposable customers and all database fixtures were removed, both TEST payments refunded, and zero active fixture subscriptions remained. No live funds moved and no production data was changed.

The reproducible bounded script is `scripts/probe-stripe-trading-addon.mjs`. The redacted local receipt is `.vercel/commerce-fresh/trading-addon-result.json` (ignored, not a committed credential or portable evidence artifact). It requires explicit local opt-in, fresh linked TEST credentials, the pinned Stripe account/catalog and distinct Preview/Production Neon identities. It refuses hosted Vercel runtime markers and arbitrary execution directories.

Not verified by this proof: hosted add-on UI, real account authentication, a registered deployed webhook, automatic webhook retry, actual next-month payment, applied-final-phase portal cancellation, App Store purchases, email delivery or production behavior. Current-period paid access and pending scheduling/release were verified; future renewal must not be described as exercised.

## Reproducible renewal and final-portal gate

`scripts/probe-stripe-addon-renewal.mjs` is an explicitly opted-in, bounded local
integration probe. It allocates at most two disposable Preview owners/customers
and separate Stripe TEST clocks, using the existing USD 19 Pro and USD 49 bundle
catalog. It neither creates a new Price nor changes a portal configuration,
registered webhook or production environment.

The clocks start one calendar month before a renewal boundary about five minutes
in the actual future. The probe waits until real application and PostgreSQL time
has crossed that boundary before advancing simulated billing. It never patches
`Date.now`, membership, entitlement timestamps or SQL time. This avoids claiming
that a future simulated invoice grants access in the real current period.

The target proof is: actual paid current period → owned next-period add/remove
schedule → genuine clock-generated renewal invoice → official Stripe CLI signed
delivery to the unchanged local webhook handler → actual Preview entitlement and
central membership. One fixture uses the documented attachable decline card
before scheduling and selects it only for renewal; failure must remove access,
and an explicit successful TEST invoice retry must restore only the target plan.
The final-phase portal action must release only the owned applied schedule without
changing Price, paid period or subscription. Headless Edge then cancels those exact
TEST subscriptions at period end; genuine signed delivery, provider readback and
retained actual paid access are separately asserted. No physical iPhone or real
customer login is implied.

Execution requires `SAJDA_STRIPE_RENEWAL_PROBE=1`, an absolute `--stripe-cli=` path,
the exact ignored `.vercel/commerce-fresh` working directory, fresh TEST process
credentials, pinned Stripe account/team/project/catalog and Preview/Production
Neon separation. The pure `scripts/stripe-renewal-policy.mjs` fence additionally
requires the reviewed exact Preview/Production manifests, independently pinned
Neon projects/hosts/database/role, fresh environment markers and exact injected
Preview agreement. Direct/pooled identities and credentials must pair correctly.
The first validated canonical manifest fingerprint is retained across allocations
and cleanup; a later config change cannot redirect cleanup to another database.
Freshly pull the exact ignored environment artifacts before running the probe;
do not describe a stale file as fresh. Use the credential allowlist pattern of local
probes; do not copy secrets into command arguments, source or reports. Guard tests
cover denied preflight, actual-time/signature boundaries and exact fixture cleanup.

The local listener filters exact allocated customer IDs before any store call.
Explicit retries reuse the authentic delivered bytes/signature; they do not prove
registered automatic webhook retries. Unknown hosted cancellation results are
reported rather than automatically clicking again. Cleanup stops browser/listener
traffic, drains handlers, proves complete bounded customer/subscription/invoice
ownership, refunds only fixture TEST payments, deletes only the owned clocks and
transactionally removes exact fixture data. Actual success must be recorded below
before this gate is described as verified.

### Actual renewal evidence and unresolved portal gate

The local TEST runs are distinct, not three successful end-to-end passes:

- `4daba180-7099-4419-a5bc-84a8fd533a64`: setup stopped because an ordinary decline
  card cannot be attached. This was a harness error, not a renewal failure. Cleanup
  removed two fixtures/clocks, refunded two TEST payments and verified zero active
  subscriptions / database fixtures. The replacement attachable card
  `pm_card_chargeCustomerFail` was checked against official Stripe documentation
  and actual customer/type/0341 readback before scheduling.
- `28e18f00-d9d7-40db-b27a-769ddc638102`: the Pro → bundle paid renewal and applied
  final-schedule portal release succeeded. Hosted cancellation was incorrectly
  treated as unknown because the harness awaited only the boolean. A genuine
  owned Stripe historical event confirmed `cancel_at == period_end` with the raw
  boolean false. That exposed the backend normalization/read-management defect
  described above. Bundle failure/retry was not reached. Cleanup removed both
  fixtures/clocks and refunded three TEST payments; zero active/DB fixtures remained.
- `2ebbdc57-4cf9-4366-ad83-16bf4ba0162a`: both actual renewal paths passed through
  genuine official CLI-signed events, unchanged local webhook handling, Preview
  Neon and central membership. Pro USD 19 → bundle USD 49 produced a paid USD 49
  renewal and bundle access. Bundle USD 49 → Pro USD 19 produced an actual declined
  renewal, no entitlement/free membership, a safely released owned final schedule
  while still unpaid, then an explicit successful USD 19 invoice retry and Pro
  access. Each had exactly one subscription and two invoices; Price/period/subscription
  were preserved by applied release. No application or SQL time was mocked.

The third run's hosted Pro cancellation was clicked once and occurred in Stripe:
owned event `evt_1UOPLvAJ7seQoN51cidRgyWO` and the preceding released snapshot
confirmed the same customer, TEST mode, active subscription, no schedule, one
quantity-one item, unchanged Price/start/end and exact positive safe-integer
`cancel_at == period_end`. The aggregate browser contract assertion nevertheless
failed. A blocked-navigation guard is the remaining explanation supported by the
unchanged provider invariants, but its actual origin was not recorded in that run;
this is an inference, not an observed navigation cause. The probe now records
allowlisted origin categories/top-level/expected-return booleans and each contract
conjunct without URL, path, query, session capability or credentials. Unexpected
navigation remains blocked; the provider contract was not loosened. All foreign
documents are aborted. Only a blocked known Stripe embed in a non-top-level frame
or the exact fixed synthetic return in a top-level frame is classified as benign.
Unknown origins, top-level embed origins and subframe synthetic returns fail.
This classification never claims an actual Sajda app return was tested.

Signed persistence and paid read/portal visibility **after that hosted cancellation**
were not reached; the second hosted cancellation was not attempted. The complete
hosted portal gate remains unverified, not a passing browser run. Final cleanup
verified two fixtures/clocks removed, four TEST payments refunded, zero active
subscriptions and zero database fixtures. No live funds moved and no Production
data changed in these probe runs. No new fixture allocation is implicit in a
diagnostic or cleanup retry.

The final approved run, `88d998af-d996-4805-b626-5a38faed432b`, repeated both real
renewal paths and the declined-renewal/explicit-payment-retry proof successfully
under the strengthened exact database target fence. Both final applied schedules
were released without changing Price, period or subscription. Hosted Pro
cancellation again satisfied every independent provider invariant. The newly
instrumented browser observed **one blocked known-Stripe embed and three blocked
unrecognized-origin subframes**, with no top-level or synthetic-return navigation.
All foreign documents stayed aborted. The final unexpected-navigation gate failed
as designed, so this was not a complete hosted portal pass. No specific unknown
domain, path or URL is inferred from those redacted categories.

Post-cancellation signed persistence/read assertions and the second hosted
cancellation were not reached in that run. Cleanup again verified two exact
fixtures/clocks removed, four TEST payments refunded, zero active subscriptions
and zero database fixtures. There are no further allocations in this work. Future
probe sequencing now records independent signed persistence/membership/read
evidence before the final unexpected-navigation gate, which remains fail-closed;
this does not retrospectively create evidence for the completed runs.

Synthetic regressions were first observed failing for exact-boundary projection
and paid-canceled billing read, then passed with the minimal correction. The
targeted commerce/store run passed 93 tests; separate pure target-fence tests
reject swapped/stale/missing/Production/wrong-role configurations. These tests
do not substitute for the unfinished hosted/deployed gates. A registered deployed
webhook, automatic provider retry, actual account authentication in this probe,
physical iPhone/VoiceOver, live payments and App Store purchases are not verified
by the local renewal evidence.

The final small read-action correction mirrors the strict mutation window:
`canAdd`/`canRemove` are false at 120 seconds or less before renewal, while known
empty-pending billing management remains available. Its new regression was first
observed failing, then passed for 120/121 seconds × Pro/bundle × no cancellation/
boolean cancellation/date cancellation. After this follow-up the eight-file
commerce/client/UI/probe-policy run passed **135/135**, with server TypeScript and
targeted ESLint passing. The root full CI result of 2,239 tests (2,231 passed,
8 skipped, 0 failed) preceded this final timing correction; it must not be
described as a new full-suite run against the later runtime.
The final fresh `build:vercel` also passed after that correction, including the
public-bundle and SEO static checks. This is build evidence, not a deployment or
hosted webhook/portal verification.

## Primary references

- [Stripe subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules): creating from an existing subscription, preserving current phase settings, future metadata and release semantics.
- [Stripe schedule update](https://docs.stripe.com/api/subscription_schedules/update) and [release](https://docs.stripe.com/api/subscription_schedules/release): exact API contracts and preserving the underlying subscription.
- [Stripe customer portal limitations](https://docs.stripe.com/customer-management#limitations): scheduled updates and cancellation restrictions.
- [Stripe TEST payment methods](https://docs.stripe.com/testing): SDK fixture payments do not move real funds.
- [Stripe attachable decline PaymentMethod](https://docs.stripe.com/testing?numbers-or-method-or-token=payment-methods): 0341 / `pm_card_chargeCustomerFail` attaches successfully and fails subsequent charges.
- [Stripe TEST clocks and scoped list queries](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage): simulated renewal, actual provider invoices and exact clock-owned customer cleanup.
- [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html): JSONB object-key ordering is not preserved.

# App Store commerce — implementation and activation gates

Updated 2026-09-10. No Apple Developer / App Store Connect account exists yet,
per operator confirmation. **No Apple product, agreement, sandbox purchase,
signing identity, TestFlight build or live purchase has been configured or tested.**
The implementation is real but deliberately disabled until those external
requirements and the tests below are complete.

## Implemented

- The iPhone account screen fetches products through StoreKit 2. Prices and
  product names come from Apple, not Sajda's USD web catalog. Only monthly,
  one-month auto-renewing products in one subscription group are accepted.
- Purchase, pending approval, cancellation, no-active-subscription, restore and
  Apple's subscription-management sheet have distinct outcomes. All five UI
  languages share the English editorial source. Legal/privacy links precede
  payment. Long button labels wrap with 44-point minimum targets.
- A StoreKit transaction listener starts when the native plugin loads.
  Unfinished/current transactions are reconciled when opening plans and on an
  explicit restore. Apple sign-in synchronization occurs only on Restore.
- StoreKit's local verification is not an entitlement. The server verifies
  Apple's JWS certificate chain against the pinned Apple Root CA G3, with
  online certificate checks enabled in Apple's official Node library 3.1.0.
  It then independently requests Apple's current subscription status.
- The server-generated immutable app-account UUID binds the signed transaction
  to one verified Sajda account. No client plan, return URL, raw receipt or
  account ID alone can grant access. Private keys stay server-side; the native
  Keychain bearer and signed transactions never enter JavaScript.
- A transaction is finished only after the server commits its verified state.
  Failed delivery remains unfinished for retry. Account-generation fences
  reject stale results; sign-in/sign-out cannot interrupt an active StoreKit
  operation and assign its purchase to another account.
- Active periods, cancellation at renewal, grace periods with signed expiry,
  expired/retry states, upgrades, refund and revocation are modeled. Grace is
  not inferred from a client flag. Family-shared and non-subscription purchases
  are deliberately rejected: do not enable Family Sharing for these products.
- Native subscriptions enter the existing membership/Trading authorization
  read model, including Basic and Premium, without copying operator grants.
  SQL uniqueness, immutable owner binding, transactional leases and fencing
  prevent duplicate or stale subscription writes.
- Existing Stripe subscriptions/checkouts block new native purchases. Existing
  Apple subscriptions block web Stripe checkout both before provider calls and
  under the Stripe lease; the website directs that customer to Apple settings.
  These checks do not form a cross-provider atomic reservation: two entirely
  new purchases initiated concurrently on different devices/providers remain
  an activation risk requiring an explicit reservation/lifecycle policy and
  real provider testing before both purchase surfaces are opened together.
- Signed V2 notifications reconcile current Apple state, not an old event's
  access claim. UUID/hash deduplication tolerates replay. Deleted-account
  notifications are ignored and cannot recreate an account.
- Production accepts only Production data with explicit live verification
  activation. Preview/development accept only Sandbox, never Xcode or
  LocalTesting transaction signatures. Sandbox may omit Apple's optional app
  ID; Production requires the configured app ID.
- Membership attempts refresh stale Apple state after five minutes, *after*
  account validation and rate limiting. Failure also starts a five-minute retry
  cooldown without changing the grant's verification timestamp. Cached Apple
  access fails closed after 24 hours without successful verification.
- A separately gated hourly reconciliation endpoint processes at most 20
  accounts within its invocation budget. Its event retention deletes at most
  1,000 namespace-owned notification hashes older than 90 days per invocation.
  Notification metadata has no email, raw JWS, user ID or account UUID.

## Environment and setup

Migration 0016 creates only empty tables and extends the existing access view;
it never creates grants, products or subscriptions.

Server-only configuration:

| Variable | Meaning |
| --- | --- |
| SAJDA_APP_STORE_ENABLED | Explicit true enables Apple verification; default off |
| APP_STORE_ENVIRONMENT | Sandbox for preview/development; Production for production |
| APP_STORE_APP_ID | Numeric app ID assigned by App Store Connect |
| APP_STORE_KEY_ID | In-App Purchase key ID |
| APP_STORE_ISSUER_ID | App Store Connect issuer UUID |
| APP_STORE_PRIVATE_KEY | In-App Purchase P8 signing key; never a public/build variable |
| APP_STORE_PRODUCTS_JSON | Reviewed product-ID to basic/premium/trading mapping, maximum one per tier |
| SAJDA_APP_STORE_PURCHASES_ENABLED | Separate explicit switch to show purchase actions |
| SAJDA_APP_STORE_LIVE_ENABLED | Additional production verification gate |
| SAJDA_APP_STORE_CRON_ENABLED | Enables the separately configured reconcile schedule |
| CRON_SECRET | Existing strong scheduler bearer secret |

No product IDs are guessed or provisioned. The operator must create reviewed
monthly subscriptions, order levels in a single group, disable Family Sharing,
set territories/prices and confirm that each advertised feature is actually
available before entering its product ID in the mapping. Creating three
product records is not proof of three complete paid feature sets.

Configure both the Sandbox and Production notification URL in App Store
Connect as the corresponding deployment's **/api/app-store-webhook**.
The native bridge uses **/api/native/commerce**; no direct cross-origin browser
credentials are accepted. Add **/api/cron/native-commerce** to an approved
Vercel scheduler only after its environment/secret and notifications have been
tested. Keep all commerce flags false until then.

The current Vercel preview is protected. Do not put a protection bypass token in
the app, email or Apple notification URL. A suitable separately reviewed
reachable app backend is required before Apple can deliver notifications and
physical iPhones can use the API outside an owner's Vercel browser session.

## Verification performed / not performed

Local tests exercise invalid configuration, true signature rejection by the
official verifier, pinned trust, mocked signed/current Apple response
boundaries, Sandbox app-ID omission, environment/account/product substitution,
grace/cancellation/refund/expiry, replay, deleted-account notification handling,
provider failure/retry and private HTTP access. Mounted component tests cover
all languages, localized Apple prices, disabled purchasing, legal links,
pending/empty/error states and account-switch fencing.

These fixture tests are **not Apple sandbox transactions**. Native compile,
simulator, PostgreSQL rollback and deployed verification are recorded in the
release audit by the root task after integrated tests finish.

## Activation test matrix

1. Apple Developer membership, paid-app agreements, banking/tax, app record,
   signing and correct bundle ID **com.hypbit.sajda**.
2. Sandbox product fetch and real Apple price; purchase/decline/cancel/Ask to
   Buy; no access until server commit; network loss then restore/unfinished retry.
3. Real signed notification test, duplicate/reordered events, renewal,
   cancellation, billing retry and grace, refund/revocation; database/UI same.
4. Fresh install, same/different Sajda and Apple Accounts, logout/return,
   restored purchase, no-active result, account deletion while subscribed.
   Deleting Sajda does not cancel Apple's billing; Apple's management sheet
   remains accessible. The UI must not promise automatic cancellation.
5. Confirm reciprocal Stripe/App Store overlap guards, membership inheritance,
   scheduled reconciliation, failure cooldown, event retention and alerts when
   verified state is becoming stale.
6. Physical device/TestFlight, Accessibility/VoiceOver, App Review metadata,
   native feature parity and consent/privacy declarations before public release.

## Primary references

- [Apple's official server library](https://github.com/apple/app-store-server-library-node)
- [Apple PKI trust roots](https://www.apple.com/certificateauthority/)
- [Current subscription status API](https://developer.apple.com/documentation/appstoreserverapi/get-all-subscription-statuses)
- [App Store Server API changelog](https://developer.apple.com/documentation/appstoreserverapi/app-store-server-api-changelog) — canonical host updated May 2026
- [StoreKit transactions and delivery](https://developer.apple.com/documentation/storekit/transaction)
- [Account-bound purchases](https://developer.apple.com/documentation/storekit/transaction/appaccounttoken)
- [Apple subscription-management UI](https://developer.apple.com/documentation/storekit/appstore/showmanagesubscriptions(in:))

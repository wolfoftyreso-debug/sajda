# iPhone release preparation — account lifecycle, privacy and commerce

## Scope and operator decision

The operator confirmed that no Apple Developer / App Store Connect account
exists yet. Prepare the real implementation; do not enable live Apple products,
signing, purchases or distribution. Vercel + Neon + same-origin Better Auth
remain the infrastructure. No Supabase migration, DNS change or public
protection bypass is part of this work.

This is **not App Store approval or production commercial signoff**.

## Implemented in this pass

- Account deletion from the shared Account screen, including native.
  An authenticated, owner-bound email challenge precedes irreversible
  confirmation. Codes expire, attempts and sending are durably bounded,
  API/MCP keys cannot delete accounts, and private account rows cascade.
  The UI explains subscription, provider-record and exported-file boundaries.
- Matching-account device cleanup does not issue a generic cookie sign-out
  after deletion. Generation and owner checks prevent delayed responses from
  clearing another account or restoring the deleted identity.
- Explicit, versioned permission for the two actual third-party AI paths.
  Advanced brief interpretation and Deep Review disclose Vercel AI Gateway
  and Google; declining preserves non-AI search and ranking. Revocation is
  accessible from Account and the public privacy page. The API/MCP exact-name
  paths remain non-AI.
- StoreKit purchase, restore and subscription-management implementation,
  signed Apple transaction/server-status verification, immutable account
  binding, notification deduplication and centrally enforced entitlements.
  Configuration remains off until real Apple setup and sandbox verification.
- Older-browser cancellation support and disposable request deadlines, plus
  regression coverage for late native-login callbacks and double submission.
  This is compatibility/reliability work, not a claimed failure on the
  supported iOS 17.4 minimum.
- English-source account, deletion, privacy and commerce copy across all five
  supported product languages. Native remains a product bundle without the
  website's SEO pages or indexing metadata.

Detailed contracts: [account deletion](ACCOUNT-DELETION.md),
[AI privacy](AI-PRIVACY.md), [native commerce](APP-STORE-COMMERCE.md).

## Verified development database changes

Only the reviewed development/preview Neon project
`spring-paper-89655503` was changed:

- Applied additive `0015_account_deletion.sql` and
  `0016_native_commerce.sql`; migration ledger has 17 files, no pending.
- Existing rows were not removed. The saved-domain owner FK uses NOT VALID
  to enforce new writes without silently purging legacy records.
- Actual PostgreSQL deletion test: owner isolation, failed-code attempt
  persistence, private-row cascades and post-deletion insert rejection.
- Actual PostgreSQL native-commerce test: environment constraints, unique
  account/purchase binding, Basic/Premium/Trading membership, grace, expiry,
  revocation, 24-hour freshness cap, other-account isolation and FK cascades.
- Both tests used an outer rollback, synthetic users only, zero real
  email/Apple/Stripe calls and zero persisted fixtures.
- Production database migrations have **not** been applied in this pass.

## External gates that code cannot substitute for

1. Apple account, agreements, bundle registration, subscription products,
   approved prices, signing certificates/profiles and App Store server keys.
2. Actual Apple sandbox purchase, decline/cancel/pending, restore, renewal,
   refund/revocation and signed-notification tests, then TestFlight and physical
   iPhone signoff.
3. A customer-reachable HTTPS backend. The stable Vercel preview remains
   protected; an operator's authenticated CLI is not a native-access solution.
   Do not package a protection-bypass credential.
4. Resend provisioning and verified sender DNS. Current Vercel inventory has
   no Resend resource or RESEND_API_KEY. The existing Resend terms page says
   Terms Accepted, but the CLI offers only Pro ($20/month) and Scale ($90/month),
   not the previously intended free plan. No paid plan was activated.
   Account recovery, verification, deletion codes and contact delivery are
   therefore not yet verified as real delivered emails in this pass.
5. App Store privacy declarations, physical-device accessibility/background
   behavior and operator-approved production rollout.

Older legacy history/domain-inventory/daily-list routes remain unavailable on
the Neon path. This pass does not advertise them as implemented; shared public
marketplace transactions and complete continuous monitoring remain separate
product work. See the prior [iOS/SEO audit](IOS-SEO-AUDIT-2026-09-10.md).

## Evidence log

Local source/unit/mounted UI checks, actual database rollback tests, signed
provider sandbox tests, simulator builds and deployed HTTP checks are distinct
verification levels. Final build/deployment evidence is appended after execution.

## Primary references

- [Apple in-app account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple data-use and sharing requirements](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
- [StoreKit sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)
- [AbortSignal timeout and disposable alternatives](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)

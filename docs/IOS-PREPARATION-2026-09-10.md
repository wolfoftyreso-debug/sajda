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
The [technical app-data inventory](APP-PRIVACY-INVENTORY.md) maps actual source
paths, recipients and unresolved retention questions for the later App Store
declaration; it is not a prefilled privacy questionnaire or legal signoff.

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
verification levels.

- Integrated `npm run check`: 1,012 tests, 1,007 passed, five opt-in database
  tests skipped, zero failures. The two new PostgreSQL tests were also run
  explicitly against the development database and passed (see above).
- Web build: 22 pre-rendered SEO pages and the public-bundle boundary passed.
  Separate native build and Capacitor sync passed; the native output contains
  no website SEO pages, canonical metadata, JSON-LD, sitemap or service worker.
- Production-dependency audit: zero reported vulnerabilities.
- Actual browser exercise of mounted product panels in an isolated local
  fixture: deliberate deletion confirmation, invalid-code recovery, successful
  synthetic deletion, AI opt-in and revocation. At 320/390-pixel widths the
  inspected controls and translated text remained inside their panels.
  English/French/Chinese checks found an existing-error language-switch bug;
  the fix and a mounted regression test were added and browser-retested.
  These fixtures did not send email, buy anything, call AI or delete an account.
- First deployed candidate: `sajda-8uf9z83ta-hypbit.vercel.app`, commit
  `f55d76cfbbcd178758fa55b5234346c393aa9432`, Vercel READY. All 36 actual HTTP
  SEO checks passed, including query noindex, encoded paths, redirects and 404.
  All eight new unauthenticated API/method/webhook/cron boundary probes passed
  with no-store/noindex and correlation IDs. No user/provider mutations.
- Actual macOS Xcode Debug and Release compilation passed for that commit in
  [iPhone CI run 34529230637](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34529230637).
  Compilation is not signing, a physical-device test or an Apple sandbox purchase.

### Final application verification

Application commit `27d04ce98647cc96e0e166d9849d233584c4c24e`:

- Second full local check passed with the same 1,007 pass / five opt-in skips /
  zero failures. Standalone lint was clean; final web/native builds and iOS
  sync passed. The native entry is `native-Ckk98Ttp.js`.
- [Verify CI 34530555136](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34530555136)
  independently passed the complete suite, 70 English-source dictionary
  contracts and production-dependency audit (zero vulnerabilities).
- Final Vercel preview `dpl_6vh4dgcaL7NsJXmg2ykiFLo7NC4m` reached READY at
  [the immutable candidate](https://sajda-q5ggeoidw-hypbit.vercel.app).
  All 36 SEO HTTP checks and eight negative lifecycle API checks passed again.
  No 5xx records were returned for this candidate in the bounded test window;
  this is not long-term production monitoring.
- [The stable test link](https://sajda-test-hypbit.vercel.app) was updated to
  that candidate. Alias checks returned `/assets/index-CSZCO906.js`, retained
  noindex and the encoded-query middleware marker. Vercel protection remains
  enabled; native clients cannot inherit an operator's browser login.
- Real deployed browser checks: English advanced-search disclosure, 320-pixel
  AI control wrapping, 390-pixel home/sign-in and zero console errors. Sign-in
  navigation started at scroll Y=0. On the stable alias the existing test
  account retained its actual operator-granted Trading access. Account/AI/
  deletion panels rendered without inspected overflow; opening then canceling
  deletion did not request a code or mutate the account.
- First actual simulator artifact `10173170961` was downloaded and visually
  inspected: the English Search screen, safe areas and labeled native bottom
  navigation are visible. It is not merely a splash screen. The first full
  iPhone CI succeeded through installation, launch, screenshot and cleanup.
  Artifact retention is seven days; its simulator ZIP cannot be installed on
  a physical iPhone.
- [Final iPhone CI 34530555190](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34530555190)
  also completed successfully for `27d04ce`: Debug and Release compilation,
  fresh iPhone 17 Pro / iOS 26.5 boot, installation, launch, screenshot and
  cleanup all returned zero. The final screenshot was downloaded and visually
  inspected: real English Search UI, safe areas and five labeled navigation
  destinations, with no blank screen or observed clipping in that screenshot.
  [Final simulator artifact 10173783317](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34530555190/artifacts/10173783317)
  expires September 17. This does not verify physical-device interaction,
  authenticated native networking, VoiceOver or an Apple sandbox purchase.

No production deployment, production schema migration, DNS change, real charge,
Apple purchase, real account deletion or AI search was executed. Apple switches
remain false. Temporary local QA was stopped and viewport overrides reset.

## Next five release actions

1. Provision the approved Resend plan and verify `mail.hypbit.com`; inspect
   actual delivered account/reset/deletion and support messages.
2. Review a customer-reachable backend and production configuration; apply
   production migrations only in that separate reviewed release operation.
3. Create the Apple account/app/products and signing configuration, then run
   the real sandbox lifecycle matrix in `APP-STORE-COMMERCE.md`.
4. Test physical-device auth, restore, saved state, export, accessibility,
   background/network failure and account deletion; resolve remaining product
   parity before advertising full feature availability.
5. Reconcile the technical privacy inventory with actual provider/retention
   practices, finalize App Store declarations and obtain launch signoff.

## Primary references

- [Apple in-app account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple data-use and sharing requirements](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
- [StoreKit sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)
- [AbortSignal timeout and disposable alternatives](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)

# Sajda — App Store launch audit

Checked 2026-09-13. **NO-GO for App Store submission or paid iPhone launch.** This is an engineering/compliance-readiness assessment, not Apple approval or legal sign-off. It is read-only apart from this report; no account, payment, signing, deployment or environment change was made.

Scope: current working tree, including the uncommitted name-project changes; selected preview `https://sajda-134q1vgm0-hypbit.vercel.app/`; primary Apple documentation. Historical simulator results in earlier documents do not verify this exact working tree. App Store Connect was not accessible in this audit. The last recorded operator statement is that an Apple Developer account has not yet been created; current external account state is **UNKNOWN**, not independently confirmed absent.

## Highest-priority findings

### P1 — The selected deployment is not an enabled native account backend

**OBSERVED:** a read-only negative HTTP probe, through the authenticated Vercel CLI but without any Sajda credential, returned `503 native_not_enabled` from POST `/api/native/commerce`, repeated once with the same outcome. POST `/api/native/account` also returns that code. Responses remain private/no-store/noindex. This is an intentional disabled boundary, **not an observed authentication bypass**. Source checks `SAJDA_NATIVE_ENABLED` before inspecting the bearer credential: [native-auth.ts:24](../../api/_shared/native-auth.ts#L24), [native-auth.ts:80](../../api/_shared/native-auth.ts#L80).

The iPhone CI still compiles against `sajda-test-hypbit.vercel.app`, explicitly documented as a protected preview ([ios.yml:19](../../.github/workflows/ios.yml#L19)). The generated local native config points at an older preview, not the currently audited deployment. Neither is evidence of a customer-reachable release backend. A Vercel owner session in a browser does not authenticate a native URLSession or Apple webhook.

**Gate:** approve a stable public backend, turn on the reviewed native account path there, and verify fresh-device authentication, data persistence and public Apple callbacks. Keep secrets/protection bypasses out of the binary. Review requires a working backend, review credentials and complete app behavior; this preview is not that release. [Apple review guidance](https://developer.apple.com/app-store/review/).

### P1 before enabling IAP — Production/TestFlight Apple transaction routing is unresolved

**VERIFIED in code:** [native-commerce-config.ts:31](../../api/_shared/native-commerce-config.ts#L31) accepts Apple Production only in the Vercel production namespace and Sandbox only outside it. [native-commerce-provider.ts:39](../../api/_shared/native-commerce-provider.ts#L39) instantiates the verifier for that single environment; signed transactions from the other mode are refused before granting access.

**Inference:** the final binary pointed at a production backend would not successfully reconcile TestFlight Sandbox purchases under this configuration. Apple explicitly states that TestFlight purchases always use Sandbox. This needs a reviewed solution before using the final candidate for purchase testing/submission: verified environment routing with separately bound transaction/entitlement ledgers, or another controlled review architecture. Do **not** merely accept arbitrary client-selected environments or mix sandbox grants with real customer purchases. [Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).

Apple's older receipt-validation documentation also explicitly discusses Sandbox during App Review, but its deprecated `verifyReceipt`/21007 instructions are **not** an implementation prescription for Sajda's StoreKit 2 JWS system. Confirm the actual review candidate end to end. [Apple receipt-validation context](https://developer.apple.com/documentation/storekit/validating-receipts-with-the-app-store).

### P1 — IAP is implemented, not activated or externally proven

**VERIFIED in code:** purchases are separately gated; signed Apple data and current server-side subscription status, account binding and server commit determine access, not a successful button result. Restore, transaction listener, expiry/grace/refund/revocation and replay defenses exist. Prices are Apple's localized product prices. These are good controls, not proof of a successful purchase.

**UNKNOWN:** app record/bundle registration, agreements, tax/banking, actual products and subscription group, signing, production notifications, real sandbox transactions, paid account transitions and reconciliation jobs. See [config:24](../../api/_shared/native-commerce-config.ts#L24), [provider:37](../../api/_shared/native-commerce-provider.ts#L37), [Swift:495](../../ios/App/App/SajdaNativePlugin.swift#L495), and [commerce activation matrix](../APP-STORE-COMMERCE.md).

A further already-documented commerce risk is simultaneous first purchases across Stripe and Apple: existing-subscription checks are not a cross-provider atomic reservation. Test/design that lifecycle before opening both checkout surfaces.

**Gate:** real Sandbox product fetch, purchase, cancel/pending, interrupted delivery/retry, restore, renewal, refund, duplicate notification, account switch, return visit and exactly correct Neon entitlement. Do not advertise a paid tier until its actual features are delivered. Global digital-subscription release should use the prepared IAP approach; exceptions for US storefronts or companion/enterprise apps need an explicit applicable distribution model, not a blanket assumption. [Apple review guidelines, 3.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).

### P1 before enabling purchases — Subscription signup omits what each tier buys

**VERIFIED:** [NativeCommercePanel.tsx:66](../../src/components/NativeCommercePanel.tsx#L66) renders product name, price/month and Subscribe, then general renewal/account/legal text. The catalog includes a `plan`, but neither tier benefits nor included limits are displayed. The current-plan panel describes existing access, not what the new purchase supplies. This is material for three different priced subscriptions.

**Gate:** show current, server-enforced tier benefits and limits on the actual purchase screen, using Apple localized renewal price. No planned/unbuilt capabilities. Include operative terms/privacy links, duration and restore. [Apple subscription signup requirements](https://developer.apple.com/app-store/subscriptions/).

### P1 — Privacy/legal readiness and actual deletion delivery are incomplete

**VERIFIED:** in-app account deletion is present in [Account.tsx:231](../../src/pages/Account.tsx#L231) and [AccountDeletionPanel.tsx:35](../../src/components/AccountDeletionPanel.tsx#L35). It requires a code emailed to the stored account address; provider failure blocks deletion at [account-deletion.ts:121](../../api/_shared/account-deletion.ts#L121). The implementation distinguishes Apple subscription cancellation from deleting the Sajda account. Local tests cover failed email without deleting data, but this audit did not send or receive a real deletion/reset message.

**Gate:** real delivery and an actual controlled deletion on the release backend; verify account-owned projects, credentials and other private records are removed, with justified provider/legal-retention exceptions. Do not replace this with support-only deactivation. [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

The public [Legal.tsx:100](../../src/pages/Legal.tsx#L100) remains a product-oriented summary, not a completed controller/recipient/retention/rights policy. The technical inventory is explicitly not an App Store declaration and predates the new persisted project briefs/budgets/shortlists and guest-only search-cache revision. Final app-privacy answers, processor practices, retention schedule and matching public policy remain required. Do not select “Data Not Collected.” [Apple app-privacy declarations](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).

Positive: optional third-party AI has named recipients, disclosed input, versioned explicit opt-in and a non-AI path. Tests confirm no provider invocation without current permission. This helps address 5.1.2(i); it does not settle provider contracts, retention or all privacy disclosures. [AI input text](../../src/i18n/aiPrivacyCopy.ts#L4), [consent tests](../../tests/ai-consent.test.ts), [Apple review guidelines, data use](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing).

### P1 — No current signed archive, physical-device or submission evidence

The workflow produces unsigned simulator Debug/Release builds, not an App Store archive ([ios.yml:30](../../.github/workflows/ios.yml#L30)). No distribution team is set in the checked-in project. Historical successful CI/simulator artifacts apply to `27d04ce`, not these latest changes. This Windows audit did not compile Swift, sign, install on an iPhone, run VoiceOver or upload to TestFlight.

Since **28 April 2026**, Apple's submission minimum is **Xcode 26+ / iOS 26 SDK+**. The project minimum deployment target **17.4** is a separate concept and is not itself a violation. A `macos-26` runner alone does not document the selected Xcode/SDK. Record `xcodebuild -version`, SDK version and archive-validation evidence for the exact submitted build. [Apple SDK requirements](https://developer.apple.com/news/upcoming-requirements/).

App record, export-compliance answers, updated age-rating questionnaire, privacy/support URLs, device screenshots, territories, review notes and review credentials remain **UNKNOWN**. Answer them from the release's actual behavior, including Trading research and optional AI, not the aspirational roadmap. [Apple submission preparation](https://developer.apple.com/app-store/submitting/).

## P2 / conditional review risks

- **Contradictory native plans language.** [NativeMembership.tsx:15](../../src/app/NativeMembership.tsx#L15) always renders [nativeCopy.ts:8](../../src/app/nativeCopy.ts#L8), which says purchases, restore and subscription management are unavailable. Account already exposes management, and will expose restore when configured. The native plans page also lacks a clear path to its actual account-side purchase panel. Fix before enabling IAP; not by itself a blocker to a genuinely free app.
- **Archive privacy validation remains unknown.** No first-party `PrivacyInfo.xcprivacy` was found. That absence alone does not prove rejection. Source searches found no direct use of the examined required-reason APIs (UserDefaults, stat/file timestamps, free space, uptime) in the app Swift or installed Capacitor source. Installed Capacitor and Cordova packages contain privacy manifests, but the project resolves separate SPM dependencies, whose final archive inclusion/signatures were not inspected. Apple lists both SDKs. Generate and inspect the archive privacy report, check required reasons against actual APIs and reconcile SDK data separately from app data. [Apple listed SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/), [privacy manifest guidance](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files).
- **Minimum functionality must be demonstrated.** This is a bundled product UI, not a remote `server.url` wrapper: native navigation, secure Keychain transport, OS sharing and StoreKit bridge exist; guest Search/Swipe are configured. Saved projects and research must work on-device. 4.2 approval is still an Apple judgment, not a consequence of using Capacitor. [Native architecture](../../capacitor.config.ts#L2), [guest configuration](../../vite.native.config.ts#L25), [Apple 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).
- **Avoid misleading Trading/marketplace metadata.** Current marketplace storage is expressly local drafts ([marketplaceListings.ts:1](../../src/lib/marketplaceListings.ts#L1)), not a functioning exchange. Present Trading as domain research with dated evidence and uncertainty, not a securities broker or guaranteed investment returns. The label alone does not establish that financial-services licensing applies. Public user listings would add a separate moderation/rights review not satisfied by today's local-only feature.
- **Own-account login is not automatically missing Sign in with Apple.** Current sign-in is Sajda email/password via system `ASWebAuthenticationSession` plus PKCE, not a third-party social login. That secure system session is not equivalent to simply throwing users into the default browser. Reassess Apple's login-equivalence rules if social authentication is added; physically test registration and return navigation. [Swift auth:387](../../ios/App/App/SajdaNativePlugin.swift#L387), [native auth UI](../../src/app/NativeAuth.tsx#L26).

## Verification actually performed

**83 targeted tests passed, zero failed/skipped:** native commerce/provider guards and mounted UI, product shell, Swift source contracts, native authorization/sessions, native export behavior, account deletion and AI consent. Real Apple responses were not used; mocked state/signature-boundary tests are not Sandbox purchases. No database mutation suite was run in this audit.

Command: `node node_modules/tsx/dist/cli.mjs --test tests/native-commerce.test.ts tests/native-commerce-ui.test.ts tests/native-product-shell.test.ts tests/native-swift-contract.test.ts tests/native-auth-security.test.ts tests/native-sessions.test.ts tests/native-artifact-exports.test.ts tests/account-deletion.test.ts tests/ai-consent.test.ts`.

Deployed checks used `scripts/check-ios-preparation-runtime.mjs` with Vercel CLI access. The original assertion suite **did not pass**: it stopped at expected 401 versus actual `503 native_not_enabled` for native commerce. Follow-up read-only probes record actual endpoint behavior; they do not turn that disabled app backend into a functional pass. No valid account token, deletion proof, Apple signature or cron secret was submitted. No provider purchase, email or account action was executed.

Eight distinct method/endpoint checks were observed (plus one repeat of native-commerce POST):

| Endpoint | Method | Actual response |
| --- | --- | --- |
| `/api/account/deletion` | GET | 405 `method_not_allowed` |
| `/api/account/deletion` | POST | 401 `authentication_required` |
| `/api/native/commerce` | GET | 405 `method_not_allowed` |
| `/api/native/commerce` | POST | 503 `native_not_enabled` |
| `/api/native/account` | POST | 503 `native_not_enabled` |
| `/api/app-store-webhook` | GET | 405 `method_not_allowed` |
| `/api/app-store-webhook` | POST | 400 `invalid_request` |
| `/api/cron/native-commerce` | GET | 401 `authentication_required` |

All observed responses were private/no-store and noindex. No permissive cross-origin access was observed. Six match the script's original expected status; two native account-path checks instead show the disabled configuration. This is not eight successful native end-to-end flows.

## Recommended release order

1. Finalize a stable reachable backend and lawful operator/privacy/support documents; verify delivered account mail and deletion.
2. Build/sign the exact candidate with the required SDK, audit its privacy archive, and exercise core flows on a physical iPhone.
3. Resolve Apple Sandbox/release routing, product benefits and cross-provider purchase races; complete actual Sandbox lifecycle tests.
4. Finish matching App Store metadata, privacy/age/export declarations and review access. Submit only capabilities present in the candidate.
5. Keep IAP off until those gates pass. A smaller free public release may avoid paid-commerce gates, but not working authentication, privacy, deletion, backend access or Apple review requirements.

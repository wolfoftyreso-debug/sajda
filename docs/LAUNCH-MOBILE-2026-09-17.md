# Mobile and native verification — 2026-09-17

The shared product UI was checked on phone, tablet and desktop viewports using
the installed Microsoft Edge browser. Native checks below render the real native
shell and page components with isolated local service boundaries. They are not
an iOS device, Safari/WebKit, OS authentication, StoreKit or distribution test.

## Changes made

- Domain result cards now wrap the price/provider row before narrow screens
  compress the source label. The original failure affected English at 320px
  and Swedish at 320/390px.
- Trading mode buttons use one column below 400px. The original Swedish labels
  overflowed their two-column buttons at 320px.
- The native Developers view now has a `main` landmark, consistent with its web
  view and the other native screens.
- Existing account/developer UI tests now check the current 44px compact
  account target and the exact shared permission catalogue inside the API-key
  form. The former tests required 40px and counted unrelated page checkboxes
  against an obsolete seven-scope total. Default access, owner fencing, expiry
  and secret removal assertions remain in place.
- The existing responsive fixture and harness can select
  `SAJDA_RESPONSIVE_SURFACE=native`. This wraps actual page components in
  `NativeShell`, selects native auth/membership screens, and asserts five
  visible navigation targets of at least 44 by 44px. Native sign-in remains
  disabled in the browser fixture. The fixture remains loopback-only,
  serve-only, and disconnected from live account/provider APIs.

Existing unrelated worktree changes were retained.

## Evidence

| Check | Result and scope |
| --- | --- |
| Main web layouts | 112 measured states across home, auth, pricing, Brand Index, name packages, Developers, Swipe and Trading; English/Swedish; widths 320, 390, 768, 820 and 1440px. 108 initially passed. The four failing cases were rechecked after the two layout fixes and all passed. No page exceptions, blocked external/API attempts or route failures. |
| Native shell layouts | 54 clean measured states across home, native auth, native membership, Brand Index, name packages, Swipe, More and Help at 320/390/820px in English/Swedish. Developers initially lacked the required main landmark; after the fix, all 15 Developers cases passed at those widths in English, Swedish, Spanish, French and Chinese. No page exceptions or live service requests. |
| Browser inspection | Agent-browser loaded home and the native Developers view, enumerated expected links/controls and captured screenshots with no browser errors. Phone screenshots were also inspected. |
| Short-screen dialogs | At 320×568px, eight native-shell measurements passed: Swedish populated Swipe/wishlist with full-height bounds, scrolling and Escape focus restoration; English/Swedish long primitive dialogs with viewport bounds, 44px close targets and Escape focus restoration. English Swipe timed out navigating before DOM content loaded during host saturation; that one short-screen case is unverified and was not retried further. No page exceptions or live service requests were recorded. |
| Native contract tests | `node --import tsx --test tests/native-*.test.ts tests/ios-smoke-script.test.mjs`: 121 passed, 0 failed, 1 PostgreSQL Apple-grant integration test skipped. This includes bridge/session validation, OS-sharing contracts, native navigation/auth, commerce UI and source-only Swift contracts. |
| Native JavaScript bundle | `npm run build:native` passed with `SAJDA_NATIVE_API_ORIGIN=https://sajda-otpkpd0qv-hypbit.vercel.app`. The public-bundle policy and native no-SEO/service-worker checks passed. This is a nonrelease preview target, not a verified production native backend. |
| Focused static checks | ESLint on the three changed product components and responsive fixtures/harness, Node syntax check, and scoped whitespace check passed. |

Local machine evidence is retained under the ignored directory
`tmp/responsive-browser/`: `launch-2026-09-17`,
`launch-2026-09-17-fixes`, `launch-2026-09-17-native`, and
`launch-2026-09-17-native-developers`, and `launch-2026-09-17-native-short`. Each contains a `result.json` and
screenshots; initial `failure.json` files retain the original defects.

To rerun, set `SAJDA_PLAYWRIGHT_ROOT` to a directory with Playwright in its
`node_modules`, then run `node scripts/check-responsive-browser.mjs`.
`SAJDA_RESPONSIVE_WIDTHS`, `SAJDA_RESPONSIVE_ROUTES`,
`SAJDA_RESPONSIVE_LANGUAGES`, `SAJDA_RESPONSIVE_CASES` and
`SAJDA_RESPONSIVE_LABEL` select the matrix and evidence directory. The default
browser channel is the installed `msedge`.

## Release limits and outstanding gates

No P0 defect was observed within these isolated presentation and native-contract
checks. They do not establish end-to-end production readiness.

- **P1 for native distribution:** no current signed archive, physical iPhone,
  VoiceOver/Safari run, TestFlight build or App Store submission was performed
  on this Windows host. The supplied backend is a protected preview, and no
  production native backend was verified. Authentication, account save/revisit
  and deletion must be exercised on the actual release app/backend.
- **P1 before native purchases:** `native-commerce-config.ts` still requires
  production namespace and Apple Production to coincide. The final
  TestFlight/Sandbox routing and isolated entitlement strategy remain to be
  resolved and validated with Apple. Purchases/restore/renewal/refund were only
  tested through mocked contracts here. The current native purchase cards show
  a product name and price, but omit the package benefits/quotas; those details
  must be explicit before purchase activation.
- **Separate account evidence:** these browser fixtures use no live account.
  Actual demo login, membership and account runtime verification belong to the
  parent launch check and must not be inferred from these results.

No account mutations, payment/provider purchases, deployment, signing or push
were performed by this mobile verification task.

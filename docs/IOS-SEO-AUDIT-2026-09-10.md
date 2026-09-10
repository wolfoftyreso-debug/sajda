# Sajda — iOS and SEO revision

Date: 2026-09-10. Scope: the actual Capacitor iPhone product, shared product
flows, native bridge and CI, and the website's 22 curated Swedish SEO routes.
English remains the base product language. The app must not contain website
acquisition pages. This is not a change to pricing, billing activation, DNS,
production data or crawler capacity.

## Release decision

**Not cleared for App Store or public commercial launch.** The revision fixes
concrete implementation defects, but native distribution, real-device flows
and the launch requirements below must still pass. Protected preview deployment
is a different gate from production readiness.

## Findings and changes

| Priority | Finding | Resolution / verification boundary |
| --- | --- | --- |
| P2 | Browser blob downloads do not provide a usable file export in packaged iOS. | Bounded native system sharing for Trading CSV, generated SVG logos and HTML sales pages; actual iPhone share targets still require device verification. |
| P2 | A lazy import/render failure could strand the app without a usable screen. | Localized route recovery preserves bottom navigation and explains reload consequences. |
| P2 | More promoted legacy features unavailable on the Neon product path. | Unavailable history/domain-inventory/top-list entries are removed from the menu; direct routes retain honest unavailable states. This does not implement these missing features. |
| P2 | Contact, legal, security and status pages duplicated the app's navigation and language controls. | NativeShell now supplies their single header; website headers and page content remain unchanged. All four pages are tested on both surfaces in all five languages. |
| P2 | Native build/transport configuration accepted local-network/IP backend origins. | Strict HTTPS DNS-host validation across native build, client transport and Swift. No credential or network-protection bypass added. |
| P2 | Simulator selection depended on the first installed runtime. | Select active Xcode SDK runtime, create a disposable job-owned iPhone simulator, bound every phase and compile Debug plus Release. |
| P2 | Client navigation could replace preview noindex and leave another route's SEO records behind. | One web-only metadata owner, explicit build policy and route/query restrictions, current-page structured data and breadcrumbs. |
| P2 | Initial SEO HTML was a thin second representation of richer React pages. | Build-time render the actual page component, including product entry, guidance, FAQ and internal links; no new content factory. |
| P2 | Production could become indexable when its explicit indexing setting was absent. | Production fails closed unless `SAJDA_SEO_INDEXING=index` is deliberately set; preview/development cannot override noindex. |
| P2 | Query variants received noindex only after client rendering. | Narrow Vercel middleware adds HTTP noindex to every parameterized `/se` URL, including unknown/encoded keys, before static HTML is served. No redirects, cookies or external calls. |
| P2 | Deployed SEO had no repeatable whole-surface HTTP test. | New read-only 22-page plus 7 routing/indexing checks. Query tests require a constant middleware marker, independently of preview-wide noindex. Tests return public metadata only and never response cookies or credentials. |

No new P0 defect was established by this audit. That is not a penetration-test
certificate or proof that all production risks have been eliminated.

## iOS release gates still open

1. **Distribution and physical device:** no signed TestFlight build, physical
   iPhone login/callback/Keychain lifecycle, VoiceOver, keyboard, native share
   targets, background/resume or real network interruption signoff in this pass.
2. **Reachable backend:** the compiled backend is the protected test preview.
   An authenticated operator CLI does not prove a customer's native URLSession
   can reach it. Do not embed a deployment-bypass credential in the app.
3. **Account deletion:** a complete in-app deletion initiation and coherent
   server retention/subscription handling are absent. Generic contact/support
   is not a substitute for an ordinary app's deletion flow.
   [Apple account deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
4. **Native commerce:** StoreKit, purchase restoration and native subscription
   handling remain missing. Existing native Stripe blocks are intentional.
   Decide supported storefronts/distribution and complete the appropriate
   commercial lifecycle before claiming purchasable native subscriptions.
   [Apple review guidelines, payments](https://developer.apple.com/app-store/review/guidelines/#payments)
5. **AI and privacy:** free-text briefs can contain personal information. Current
   warnings about sending text to a search service do not establish explicit,
   informed permission for third-party AI sharing. Complete provider disclosure,
   appropriate permission, data inventory, App Store privacy declarations and
   retention review. No speculative privacy-manifest reasons were added.
   [Apple review guidelines, data use and sharing](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
6. **Feature parity:** history, owned-domain inventory, legacy daily lists,
   shared public marketplace transactions and complete continuous monitoring
   are not finished merely because routes or shared components exist. Trading
   execution while the app is closed must be verified against server scheduling,
   not a foreground client timer. See [iPhone implementation](IPHONE.md).

## Website SEO policy and limits

- The effective configured canonical is **https://sajda-eight.vercel.app**,
  documented in [deployment configuration](VERCEL-DEPLOYMENT.md). The source
  fallback `sajda.dev` has no resolvable DNS at audit time. It is not the active
  deployment canonical and must not be represented as an owned custom domain.
- Preview remains protected and noindex, with an empty sitemap and restrictive
  robots policy. Production indexing is deliberately disabled during launch
  validation. This audit does not secretly enable indexing or remove protection.
- Only the curated Swedish page set is index-eligible when production indexing
  is explicitly enabled. English product UI does not imply that equivalent
  English SEO landing pages have been built. No fabricated hreflang variants,
  review ratings, keyword volumes or registrar price evidence were added.
- Search/filter/account URLs remain outside the sitemap. A robots disallow is
  crawl control, not a guarantee of exclusion from search; password protection
  remains the actual preview access gate. An intended public noindex page must
  be crawlable for its directive to be seen.
  [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- Build-time HTML and client-rendered pages share the same React page
  components. The client uses `createRoot` and replaces the prerendered subtree;
  this is not `hydrateRoot` hydration or complete app-shell SSR. Global providers
  and footer are client-rendered. A transient loading replacement was observed;
  its field layout-shift impact is not measured. Initial content access is
  improved, but this is not a promise of indexing or rankings.
  [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- Search Console ownership, Google-selected canonicals, field Core Web Vitals,
  organic performance and real keyword demand remain **not verified**. The
  necessary connectors are not available in this environment.

## Evidence used

- Repository implementation and tests; actual Vercel environment inventory and
  authenticated read-only HTTP responses; GitHub Actions build/job evidence.
- Apple's review/account-deletion documentation and Google's primary technical
  SEO documentation, rather than assumed current policies.
- Mobbin iOS behavior references: [Shop collection saving](https://mobbin.com/flows/e85d0150-4fe9-4ee0-bde4-de17fe6da7df)
  and [Etsy favorites](https://mobbin.com/flows/4738c963-549a-4a7b-923a-cd2c23910ee3).
  Reviewed persistent labeled navigation and explicit saved-item groupings;
  preserved Sajda's identity and removed unavailable menu destinations.
- Figma/market-data/email/payment connectors were not exercised ceremonially:
  this pass did not require changing design files, purchasing, sending mail,
  prospecting or running domain research jobs. Semrush, Search Console and
  Sentry were not callable in the discovered tools.

## Reproducible verification

```sh
npm run check
npm run build:vercel
SAJDA_NATIVE_API_ORIGIN=https://sajda-test-hypbit.vercel.app npm run build:native
node scripts/audit-seo-http.mjs --origin https://sajda-test-hypbit.vercel.app --canonical https://sajda-eight.vercel.app --vercel-cli /path/to/vercel/dist/vc.js
```

The CLI argument uses the existing authorized Vercel session without extracting
its credentials. Omit it for a genuinely public environment. `--production`
expects intentionally indexable curated pages, not the launch-validation state.
Local fixtures and source-contract tests are not external-provider or device
tests. Execution results for this revision are recorded below when complete.

### Local integrated results

- Final `npm run check`: PASS; **922 passed, 3 explicitly skipped, 0 failed**.
  Lint, application/API type checks, 67 five-language dictionary contracts,
  SEO policy, server-only Neon boundaries and UI contracts passed.
- `npm run build:vercel`: PASS with preview/noindex policy and the documented
  Vercel canonical. All 22 initial HTML pages, structured data, assets and
  internal crawl graph passed the strengthened static checker.
- `npm run build:native`: PASS against the stable test backend. Final local native entry
  `native-B_uPwEUw.js`; no SEO documents, canonical, JSON-LD, sitemap, robots
  or service worker are packaged. This is not Swift compilation.
- `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities.
- Real browser QA of the built native UI: search, options, More, auth boundary,
  Trading and Swipe settings; 320/390-wide portrait and 844×390 landscape
  samples. No horizontal overflow in inspected samples. Dialog close works;
  no live search, paid operation or private account mutation was performed.
  The rebuilt native Contact page also has a single shell/language control;
  its complete form and privacy text remain present.
- Real browser QA of built website: `/se/sok-doman` → trademark guide → pricing.
  Canonical/breadcrumbs changed with the actual page; pricing removed stale
  JSON-LD/hreflang, restored English product metadata and remained noindex.
- Development HMR briefly produced stale-context/lazy-import errors while
  files changed. Clean built-asset checks did not reproduce them; these are
  not reported as production crashes. The new recovery screen did remain
  usable during the development failure.

### First deployed verification

Runtime commit `3ac273f870e3e79a7520bf8d91a2b67b67d88ef1`, Vercel preview
`dpl_7VoQiSiZebek98ABJ7q8bDczb4bR`:
[candidate deployment](https://sajda-kz93bxpgq-hypbit.vercel.app).

- Vercel reached READY, then all 22 document checks and 6 route/indexing checks
  passed. This includes 308 trailing-slash normalization and a real 404.
- Five deployed native negative cases passed: anonymous auth GET 401, invalid
  auth method 405, unsupported auth action 400, account GET 405, anonymous
  account POST 401. All returned JSON, `private, no-store` and request IDs.
  No valid credential, account mutation or background job was used.
- Browser SEO form handoff preserved `example.com` as exact-domain input in the
  product workspace without placing it in the URL or starting a search.
- Native Debug and Release both compiled successfully in
  [iPhone CI 34502260457](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34502260457).
  The simulator also booted, installed and launched `com.hypbit.sajda`, then
  captured the app and cleaned up its own device. The downloaded screenshot
  was visually inspected: English search UI, iPhone safe areas and labeled
  bottom navigation are visible, not a blank page or launch screen. The first
  boot spent about eight minutes in operating-system migration; the bounded
  longer deadline resolved the previous infrastructure timeout.
  [Simulator artifact](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34502260457/artifacts/10162812914)
  This does not verify taps, authenticated transport or system share-sheet use.

## Next five highest-value release actions

1. Complete the account-deletion lifecycle, including retained records and
   active-subscription consequences, without ad hoc production deletions.
2. Complete AI-sharing disclosure/permission and the actual privacy inventory
   required for the selected App Store distribution.
3. Choose supported storefronts, then implement and test the appropriate
   native purchase, restoration and subscription-management lifecycle.
4. Sign and distribute a TestFlight build against a customer-reachable backend;
   test physical-device auth, saved state, sharing, accessibility and failures.
5. Complete missing product parity, then intentionally open the public website,
   verify Search Console ownership and measure indexing/Core Web Vitals before
   expanding SEO pages.

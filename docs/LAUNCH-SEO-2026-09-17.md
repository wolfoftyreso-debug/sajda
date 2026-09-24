# Sajda SEO launch audit — 17 September 2026

## Decision and scope

**Public organic launch remains blocked by the unavailable canonical destination.** The 22-page Swedish SEO implementation passes the current local rendering, metadata, crawl-graph and query-protection checks. These results do not establish a reachable production website or Google indexing.

This pass reviewed the current working tree, including existing unpublished product work, and the protected main preview `https://sajda-otpkpd0qv-hypbit.vercel.app`. The separately deployed public connector is not the public website. No DNS, Vercel protection, live environment setting or indexing policy was changed by this workstream. Two bounded verification/build defects were corrected; no SEO pages were added.

Evidence labels: **VERIFIED** means source or a reproduced test; **OBSERVED** means a fresh network response; **UNKNOWN** means it has not been established by this pass. The older 13 September audit is background, not evidence of the current deployment state.

## Findings

| Priority | Status | Finding and evidence | Release action |
| --- | --- | --- | --- |
| P1 | Open — OBSERVED | `https://sajda.dev/` and `/se` fail DNS with `ENOTFOUND`. `https://sajda-eight.vercel.app/`, `/se`, `/robots.txt` and `/sitemap.xml` each return HTTP 404 `DEPLOYMENT_NOT_FOUND`. The current protected preview's `/se` declares `https://sajda-eight.vercel.app/se` as canonical. | Establish the intended public origin, publish a working production release there, and verify the declared destination directly. `sajda.dev` is a code fallback, not a verified primary domain. |
| P1 | Open — OBSERVED | An unauthenticated request to the current main preview `/se` returns 302 to Vercel SSO with `X-Robots-Tag: noindex`. Authenticated preview access returns the expected page. | Retain preview protection. A public production website and its legal/support destinations must be independently reachable. A successful protected preview test does not close this finding. |
| P2 | Fixed — VERIFIED | `build-static.mjs` previously loaded Vite dotenv settings for canonical URLs but passed only process settings to the plain Node generator. A `SAJDA_SEO_INDEXING=noindex` hold in a recognized Vite environment file could therefore be lost. Deployment context from such a file could also be lost. | The shared build environment now propagates indexing policy and deployment context along with the canonical pair. Process settings keep precedence; explicit local mode does not override the indexing hold. Regression tests cover these cases. |
| P2 | Fixed — VERIFIED | The HTTP audit could accept a production-mode check of a different host through authenticated Vercel access, without proving canonical reachability. Its robots check found a sitemap line without evaluating crawl rules, and the document check missed uppercase, `none`, duplicate and Google-specific noindex directives. | Production audits now require the canonical origin and unauthenticated HTTP. The audit evaluates Googlebot rules for every approved URL, and applies restrictive metadata/header directives, including the `none` alias. Tests also ensure `max-image-preview:none` is not mistaken for noindex. |
| P2 | Open — VERIFIED | All 22 index-eligible public routes are Swedish. The English product root, pricing and developer UI remain application pages with noindex. UI language switching does not create translated acquisition URLs. | Decide on a small useful English public entry surface after the production origin is established. Publish actual equivalents before adding cross-language hreflang. Do not index private searches or account/project state. |
| P3 | Open — VERIFIED | The static shell and generated SEO metadata have titles/descriptions but no Open Graph image. | Add a stable branded sharing image when the public origin is established; this is not an indexing blocker. |

The production environment snapshot still contains an explicit noindex hold. It is a local snapshot, not a fresh export or proof of every current live variable. Production builds require an explicit `SAJDA_SEO_INDEXING=index` decision; preview/development remain noindex even if an index override is supplied. The www redirect is currently tied to `www.sajda.dev → sajda.dev`, so the selected public domain must be checked against that rule before launch.

## Verified implementation

- All 22 pages contain actual product HTML before JavaScript, a single main landmark and H1, unique title/description, canonical URL, Swedish language metadata and appropriate WebPage/BreadcrumbList JSON-LD. Breadcrumb parents correspond to real published routes.
- Sitemap contents exactly match the approved canonical routes in index mode; noindex output has an empty sitemap. All public pages are reachable through links from `/se`, including the guide and top-level-domain hubs. No query URLs are emitted into the sitemap.
- Self-referencing `sv-SE` hreflang points to real pages. No nonexistent translated route or fabricated international language cluster is emitted.
- Static/client canonical alignment is validated. Metadata tests cover route changes, removal of stale structured data, private routes, preview origins, query strings and preservation of a production indexing hold after client navigation.
- The actual Vercel middleware is exercised with ordinary, unknown, duplicate, encoded and Unicode query keys, encoded namespace characters and separators. It adds noindex before an otherwise indexable static response and does not echo private input. Non-SEO namespaces are not broadened into this middleware.
- Interactive application routes and API responses remain noindex in routing configuration. SEO form fields do not turn unsubmitted private domain ideas into GET query parameters without JavaScript.
- Crawler control files are excluded from the service-worker precache. The app HTML remains noindex in every tested build mode.

## Validation performed

- `node --import tsx --test tests/seo-build.test.mjs tests/seo-http-audit.test.mjs tests/seo-document.test.ts tests/seo-middleware.test.ts`: **38 passed, 0 failed**.
- `node scripts/check-seo-policy.mjs`: passed.
- `node --test tests/deployment-api-layout.test.mjs`: **9 passed, 0 failed** after updating the stale expected route list for the two real Brand Index application routes. The exact rewrite/root/unknown-route assertions remain, and the test now also verifies noindex, private/no-store and no-referrer for both routes. No production routing change was needed.
- ESLint on the two changed scripts and two changed/new regression files: passed.
- Fresh isolated Vite build into ignored `tmp/seo-launch-audit`, followed by the real generator and full static checker in **production/index**, **production/noindex**, and **preview/index**: all three passed for all 22 routes. The last mode correctly produced noindex output. `dist` and `dist-vercel` were not changed by this validation.
- Unauthenticated network probes were bounded requests with redirects disabled. Protected preview requests used `vercel curl` through the existing linked project; no access-control change or manual bypass-token extraction was used.

## Production handoff

Once the chosen production origin serves the release, run the HTTP audit without the Vercel CLI:

```powershell
node scripts/audit-seo-http.mjs --origin https://YOUR-VERIFIED-PUBLIC-ORIGIN --canonical https://YOUR-VERIFIED-PUBLIC-ORIGIN --production
```

This verifies the destination declared by the HTML rather than assuming it exists. Confirm canonical, auth, email/app callbacks, legal/support links and any www/HTTP redirects use the same production decision. Keep indexing on hold until the broader launch requirements are met. Then verify representative pages and the sitemap in Search Console.

**UNKNOWN:** domain ownership, a ready publicly accessible production release, Google's selected canonical/indexing coverage, Search Console property state, field Core Web Vitals, and real-user acquisition performance. No claims of ranking, Google rich-result eligibility or successful sitemap submission follow from the local checks.

## Current primary guidance

- Canonical signals, sitemap destinations and redirects should be consistent: [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
- Google must be able to crawl a public page to read its noindex directive; robots blocking is not a deindexing mechanism: [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing). Protected nonpublic previews remain a separate access-control concern.
- Robots directives are case-insensitive, restrictive rules win, and `none` means noindex plus nofollow: [Google robots meta/header specification](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
- Language annotations should describe real alternate versions at their own URLs: [Google localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

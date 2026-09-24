# Sajda launch SEO audit — 13 September 2026

## Scope and verdict

Read-only audit of the current repository and `https://sajda-134q1vgm0-hypbit.vercel.app`. No application, environment, DNS, indexing, deployment or customer data was changed. This document is the only audit artifact created by this workstream.

**SEO launch verdict: NO-GO for public acquisition until the production host is established and the production release is verified.** The curated Swedish SEO implementation passes its focused tests and the preview routing checks. Preview protection and noindex are intentional and must not be removed merely to make this audit green.

This is not a guarantee of indexing, ranking, legal compliance or App Store approval. Those are different gates.

## Evidence levels

- **VERIFIED:** observed in current source, focused tests or HTTP responses in this audit.
- **OBSERVED SNAPSHOT:** local deployment configuration snapshots, not a fresh claim about every live environment variable.
- **INFERRED:** likely commercial effect of verified implementation.
- **UNKNOWN:** requires access or a production artifact not available here.

## Prioritized findings

### P1 — the effective canonical destination is not a working public site

**VERIFIED:** all 22 preview SEO documents declare `https://sajda-eight.vercel.app` as their canonical origin. Unauthenticated requests to that host's `/`, `/se`, `/legal`, `/robots.txt` and `/sitemap.xml` all returned **404 `DEPLOYMENT_NOT_FOUND`**. The current public preview `/` and `/legal` instead return **302 to Vercel SSO** with a noindex response header.

Read-only Vercel listing for project `sajda`, environment `production`, limit 5, returned one deployment: `sajda-ky4u8mrr7-hypbit.vercel.app`, state **ERROR**, target **production**. No READY production deployment was returned by that query. This is not an assertion about unrelated Vercel projects.

The default in `scripts/seo-routes.mjs:10` and `src/lib/seoCanonicalOrigin.ts:6` is `https://sajda.dev`, but it is **not the effective preview canonical**. That fallback's hostname also returned `ENOTFOUND` from this environment. Do not describe it as an owned or functioning production domain.

Implementation references: `scripts/build-vercel.mjs:27` derives the browser canonical from the server configuration; `scripts/seo-routes.mjs:729` rejects mismatched static/client origins; `scripts/release-configuration.mjs:18` checks production origin syntax and auth alignment, not public reachability. These are useful guards but cannot prove the domain is serving Sajda.

**Release gate:** select and verify the public production origin, deploy successfully, verify HTTPS and all intended canonical destinations without Vercel credentials, then run the production HTTP SEO audit against that exact origin. Update auth, email, app and connector links in the same release. Google recommends consistent canonical signals; pointing them at an unavailable origin is not a working launch state. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

### P1 — no usable public privacy/support destination has been demonstrated

**VERIFIED:** `/legal` on the review preview requires Vercel access. `/legal` on its effective canonical origin is a Vercel 404. With authenticated preview access, `/legal` returns a 200 client-rendered application shell, noindex, and no account content in the initial HTML.

This is not a defect in preview access controls. It is a public-release prerequisite: a customer or reviewer must be able to open the final privacy/support pages independently of the development team's Vercel login. Whether the legal content itself is adequate is covered by the separate legal audit; an accessible URL alone is insufficient. A noindex privacy page can still be publicly accessible — noindex does not mean private or access-controlled.

References: `src/app/ProductRoutes.tsx:33`, `vercel.json:223` and `vercel.json:391`.

### P2 — English-first product, but no English index-eligible acquisition page

**VERIFIED:** the complete curated index-eligible manifest contains 22 Swedish `/se` pages. `/`, `/pricing` and `/developers` are permanently noindex in response configuration, and the interactive root's initial HTML is an empty application shell with noindex. The five-language product UI does not create five independently indexable marketing surfaces.

References: `scripts/seo-routes.mjs:16`, `index.html:11`, `vercel.json:76`, `vercel.json:187`, `vercel.json:214`, `src/lib/seoDocuments.ts:44`.

**INFERRED:** after a technically correct launch, this leaves English non-brand acquisition unsupported and weakens discoverability for the founder/connector positioning. This is a growth limitation, not a reason to index private queries or account state.

**Recommendation:** publish a small, genuinely useful English public entry surface with its own stable URLs and server-rendered content. Keep private search and projects noindex. Add reciprocal hreflang only for actual equivalent published translations; do not fabricate routes for every product UI language. Google's recommendation is separate URLs for language versions, rather than depending on browser language or cookies for search discovery. [Google multilingual guidance](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites)

### P2 — launch indexing and domain normalization still require explicit activation/verification

**OBSERVED SNAPSHOT:** local preview and production configuration snapshots specify `SAJDA_CANONICAL_ORIGIN=https://sajda-eight.vercel.app`; the production snapshots also specify `SAJDA_SEO_INDEXING=noindex`. The canonical was independently confirmed in the deployed HTML. The current live production variable set was not exported or changed.

**VERIFIED:** production builds intentionally fail closed unless `SAJDA_SEO_INDEXING=index` is explicitly supplied. Preview/development cannot override this to become indexable. A noindex build creates an empty sitemap and restrictive robots.txt. Production index mode creates the approved canonical sitemap and crawlable robots rules.

References: `scripts/seo-routes.mjs:749`, `scripts/generate-seo-static.mjs:154`, `scripts/generate-seo-static.mjs:166`.

The sole explicit www redirect is still hard-coded to `www.sajda.dev → sajda.dev` (`vercel.json:355`). If the selected launch domain differs, the redirect configuration must follow that decision and be tested for loops, hops and HTTPS behavior.

Do not activate indexing before the other launch gates pass. For public URLs that should be deindexed, permit crawling so Google can read noindex; robots.txt blocking is not a substitute. Credential-protected preview environments have a different purpose and should remain protected. [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

### P3 — shared-link presentation lacks an image

**VERIFIED:** inspected deployed pages have title/description metadata but no `og:image`. This is a polish/acquisition improvement, not a Google indexing blocker. Add a real branded image with accessible stable HTTPS URLs and verify shared-link previews after a public domain exists; do not treat social metadata as proof of SEO readiness.

## Controls that passed

- 22 curated pages have actual pre-rendered product HTML, one H1, unique title/description, language declaration, stable canonical, WebPage JSON-LD and valid multi-item breadcrumbs where appropriate.
- The renderer uses the actual React SEO product components, not crawler-only duplicate content (`scripts/render-seo-page.tsx:10`).
- Private application routes remain noindex. `/projects` is additionally `private, no-store` in the deployed response; no account content exists in the initial HTML.
- Search entry forms do not serialize private domain ideas as named GET parameters when JavaScript is unavailable. Their visible no-JavaScript state explains the limitation.
- Query-bearing `/se` URLs receive HTTP noindex before static delivery, including unknown and encoded parameter/path forms. The audit checks the application middleware marker independently of Vercel's preview-wide noindex.
- The trailing-slash route returns 308 to the selected canonical path. An unknown route returns actual 404, not a 200 soft-404 application shell.
- The generated internal-link graph reaches all 22 Swedish pages. The sitemap contains only the approved surface in index mode, not search results, accounts, project candidates or every possible filter combination.
- The sitemap does not misrepresent build time as an editorial `lastmod` date.
- Existing hreflang does not point to nonexistent translated pages. The Swedish surface stays Swedish regardless of an unrelated saved product language preference.
- Structured data does not fabricate ratings, reviews, Product prices or app-store listings. Valid syntax does not guarantee rich-result eligibility. [Google structured-data policy](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

Pre-rendering and consistent HTTP status/metadata reduce crawler dependence on JavaScript, as Google recommends. Private application shells do not need to be made indexable merely to give every route an SSR H1. [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

## Tests performed

1. `tsx --test tests/seo-document.test.ts tests/seo-http-audit.test.mjs tests/seo-middleware.test.ts tests/deployment-api-layout.test.mjs`: **41 passed, 0 failed, 0 skipped**.
2. `node scripts/check-seo-policy.mjs`: **PASS**.
3. `node scripts/check-seo-static.mjs dist-vercel`: **PASS**, existing local 22-page index-eligible artifact including HTML, metadata, JSON-LD, assets and crawl graph. This is a local artifact check, not a claim that the preview or production is indexable.
4. Protected preview HTTP inspection: **22 rendered SEO documents + 14 routing/robots/sitemap/query checks PASS**, exit 0 and `passed: true`, using `--canonical https://sajda-eight.vercel.app`. All documents returned 200 with that effective canonical origin. The initial invocation used the code fallback canonical and therefore correctly reported 22 canonical mismatches; that was an audit-configuration mismatch, not 22 independent application defects. The full explicit-origin rerun passed. Importantly, the audit validates the declared origin consistently; the separate public HTTP probe establishes that its destination is unavailable.
5. Additional protected GETs inspected `/projects`, `/pricing`, `/legal`, `/developers` and a Swedish SEO page; public unauthenticated GETs separately tested preview access protection and the unavailable canonical host.
6. Read-only Vercel production deployment listing described above. No deployment or environment mutation.

## Not verified / not inferred from tests

- No successful public production golden path, current live production environment export, verified production DNS ownership or domain-rights clearance.
- No Search Console access, ownership proof, selected-canonical inspection, indexing coverage, manual-action report or sitemap submission was performed. Source grep is not evidence that a Search Console property cannot exist externally.
- No field Core Web Vitals, real-user traffic or competitive ranking baseline. Passing static tests is not a performance or visibility measurement.
- No Google Rich Results Test/URL Inspection against an anonymously accessible production release.
- No claim of an affiliate relationship was established in this pass. If registrar links become compensated, add disclosure and appropriate `sponsored`/`nofollow` qualification before publishing paid links; do not mark ordinary editorial links sponsored without that relationship. [Google outbound-link guidance](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)

## Next release sequence

1. Establish one public production origin and resolve the failed production deployment; retain preview protection.
2. Publish complete public legal/support pages at that origin and coordinate app/account/connector callbacks.
3. Verify production canonical/redirect/auth-origin consistency; explicitly enable indexing only for approved public pages when launch is authorized.
4. Run all 22-page production HTTP checks without a Vercel credential, then use Search Console URL Inspection and sitemap submission. A sitemap helps discovery but does not guarantee crawling or indexing. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
5. Add a small English public product surface and measure activation and real-user performance before expanding SEO page count.

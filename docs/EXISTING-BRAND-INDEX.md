# Sajda Index for an existing brand

Methodology: `brand-presence-1.0.0` · Contract: `sajda.brand-presence-index.v1`

## Two different questions

Name packages help choose a **new name**. Available domains may be a positive signal there. The existing-brand index asks a different question: **How coherently does this brand control or have permission to use its declared identity across a specified set of domains, social handles and countries?** A taken domain is not inherently negative for an existing brand, and a free domain is not evidence of control.

This release implements a deterministic **self-assessment model**, its interactive worksheet at `/brand-index/assessment`, and REST/MCP access to the same calculator. The primary `/brand-index` entry now offers a separate [public-data name lookup](BRAND-LOOKUP.md). Neither path implements independent ownership or legal verification. There is no preassigned IKEA score or reputation multiplier. A familiar brand can still have unknown evidence.

## Fixed scope before scoring

The caller supplies a brand name, shared identity label, primary domain, 1–20 registrable domains including that primary domain, one handle on each of 1–6 social platforms, and 1–38 supported countries. USA + the 27 EU countries are the UI default; countries are selectable independently of interface language.

Scope is normalized, bounded and duplicate-free. Each target has a reproducible identifier:

- `domain:example.com`
- `social:github:example`
- `market:US`

These are scoped worksheet targets, **not verified corporate entity identifiers**. The model accepts one report per target and rejects unrelated targets and arbitrary provenance or verification flags. The browser requires an explicit reset before scope editing and clears old reports rather than silently assigning them to new targets.

The response includes the selected countries, number of targets, methodology version and a `comparison_key`. The key is a deterministic serialized scope, not a secret or cryptographic evidence identifier. Compare repeated assessments only with the same key and method. Removing an unknown or difficult country changes the scope; it does not strengthen the actual brand. A small local brand and an international group must not be ranked against one another just by these scores. `is_global_score` is always false.

## Report semantics

| Status | Meaning in this calculator | Current report contributes |
| --- | --- | --- |
| `reported_owned` | Caller reports control or relevant rights | Coverage and positive points |
| `reported_authorized` | Caller reports permission/licensed use | Coverage and positive points, separately counted from ownership |
| `reported_conflict` | Caller reports a conflict | Coverage, no positive points |
| `matching_name_only` | A matching name has been reported; relationship is unresolved | No control or resolved-coverage credit |
| `unknown` | Not assessed or unresolved | No control or resolved-coverage credit |

A country report is a user's assertion of rights or authorized use in that jurisdiction, not a completed company-register or trademark search. Domain control, company names, trademarks, franchise relationships and social-platform permission are distinct concepts. Sharing a spelling, displaying a logo, redirecting to a website or linking a source does not resolve them.

All report provenance remains `USER_SUPPLIED`. `reported_at` describes when the user made the report, not when a source was independently inspected. Missing, future, invalid or older-than-30-day timestamps cannot contribute current points. A browser's explicit **Record self-report** action dates a declaration; changing a draft field does not verify or refresh a source. An optional source is a bounded public HTTPS reference without credentials, query parameters or fragments. The calculator does not fetch it or upgrade its authority.

## Score and coverage

Weights are product-defined diagnostics, not statistically calibrated predictors of valuation, commercial success or legal protection.

| Dimension | Maximum | Calculation |
| --- | ---: | --- |
| Domains | 35 | Current reported-owned/authorized domains ÷ all requested domains |
| Social profiles | 25 | Current reported-owned/authorized handles ÷ all requested platforms |
| Country rights | 25 | Current reported-owned/authorized country assertions ÷ all selected countries |
| Identity consistency | 15 | Current reported-owned/authorized domain labels and handles exactly matching the shared identity label ÷ all requested domain and social targets |

Each fraction is multiplied by its maximum. Unknown, missing and outdated targets remain in the denominator. The total is rounded to an integer; diagnostic subscores have two decimal places. Displayed integer coverage is rounded down, so a sub-threshold value cannot display as having met the threshold.

Weighted report coverage uses the same weights and denominators but counts current ownership, authorization **or conflict** reports as assessed. It measures resolved user declarations, not independently proven facts. The displayed total remains `null` until weighted coverage reaches at least 60% **and** at least one current assessed report exists in each of the domain, social and country groups. Subscores may still expose gaps before that threshold; zero contributions do not mean a zero-quality brand.

A perfect complete set of coherent reports can produce `reported_score: 100`; it is still `SELF_ASSESSMENT`. A complete set of reported conflicts can produce zero. Both have `verified_score: null`, `verified_coverage_percent: 0` and `confidence: null`. This preserves the difference between coverage, positive declarations and independent trust.

Example: one coherent domain, one coherent social handle and one current country-rights claim can yield 100 within that three-target scope. Keeping the same reports but expanding the requested countries to all 38 yields about 76 with 37 unassessed country targets. The changed comparison key and target coverage prevent either number being presented as a universal brand-strength ranking.

## Shared human and agent capability

- Worksheet UI: `/brand-index/assessment`, English base plus Swedish, Spanish, French and Chinese. Uses the same pure model locally. No provider calls, account creation, billing, autosave or cloud persistence. Reloading or leaving clears the worksheet; the UI states this before entry. The separate `/brand-index` name lookup does call its disclosed public source.
- Public REST: `POST /api/v1/public/brand-index`, JSON body up to 64 KiB, no credentials, no query parameters, CORS, no-store/noindex. A bounded per-instance rate guard is an abuse-reduction measure, not a durable user entitlement.
- MCP: `brand_index_assess` with the same schema and explicit read-only/no-external-lookup semantics. Existing MCP transport body limits still apply; use REST for larger reports.
- No availability engine, registry provider, database, AI quota or automatic verification is consumed by this calculator.

The API accepts no `verified`, `verified_at`, `confidence` or score override from the caller. Structured output, OpenAPI and MCP must preserve the null verified score and trust limitations rather than turning the reported number into a verified Sajda rating.

## Next evidence layer, not implemented here

An independently verified index needs a separate trusted ingestion path: authenticated domain-control challenges or registrar account assertions; authenticated social-profile authorization; documented entity and licensed-use relationships; and jurisdiction-specific, reviewable corporate/trademark evidence. Each assertion needs an issuer, subject, scope, timestamp, expiry, evidence reference and revocation handling. A website match or caller-supplied URL is insufficient.

Independent verified subscores must never borrow self-reports as verified positives. Reuse of one global website cannot be treated as 38 independent country-rights checks. A company group can have licensees, franchisees and separately owned operators, so a single flat owner field is inadequate. Historic snapshots, monitored changes and cross-company rankings require durable canonical entities and controlled evidence collection before release.

The IKEA example and primary-source ownership/franchise distinctions are documented in [the source review](research/EXISTING-BRAND-INDEX-SOURCES-2026-09-13.md).

## Verification ledger

Current-turn automated, browser and deployed checks are recorded below only after execution. A preview deployment is not a production release or an independent assessment of any real company.

### Local checks — 2026-09-13

- 18 model tests: fixed scope, score/coverage separation, missing/current/stale/future dates, invalid UTC offsets, normalized duplicates, valid platform-domain roots, strict provenance boundaries, reproducibility and JSON Schema support.
- 7 mounted UI/route checks: local-only reports, five languages, invalid input, source-edit timestamps, matching-name limitations, explicit scope reset, and composed developer-guide entry links.
- 34 REST/OpenAPI/MCP tests: valid and invalid bodies, 64 KiB REST limit, rate guard, safe errors, input/output trust labels, generated schema drift, public and account SDK calls, 4/14 tool discovery, and isolated public connector artifact.
- Focused ESLint, app/node and Vercel API TypeScript checks, 83 English-source dictionary contracts, UI contracts, and `git diff --check` passed. The final focus change also passed an additional app TypeScript check.
- Local Vercel build and its static-SEO/Neon public-bundle checks passed. This checks build policy, not a live ownership provider or a production launch.
- Real Edge browser: 5 languages × 320/390/1440 px, 15 combinations and 75 layout measurements; zero overflow, runtime errors, attempted external/API requests or input leakage. Checks included blank/matching-only reports, complete self-reports remaining unverified, timestamp preservation, reset, no initial autofocus, focused result/reset transitions and no focus jumps after recording. Eight English/Swedish mobile screenshots were inspected. Run with `node --import tsx scripts/check-brand-index-browser.mjs` and the configured Playwright runtime; artifacts are ignored under `tmp/brand-index-browser/`.
- A harness-only cleanup assertion initially mistook signal termination for a running process. It was corrected to check both exit and signal status; the full matrix subsequently exited successfully, including after the focus refinement. A route-source test was also updated to follow the composed developer-guide component instead of requiring an inline link.
- Independent model review found and resolved malformed UTC-offset freshness, exclusion of legitimate private-suffix platform roots, and coverage rounding across the readiness threshold. The review did not establish ownership of any real company.

### Deployed checks

- Preview `https://sajda-ydq644z8g-hypbit.vercel.app`, deployment `dpl_AQ3rKd8jTwaWijcUiGaWaFd816tF`, completed READY with `target: null`. Vercel rebuilt the final focus-refined application and API functions successfully.
- `scripts/check-brand-index-preview.mjs` passed nine deployed HTTP checks: worksheet HTML and OpenAPI 200; empty self-assessment 200/null score; complete synthetic declarations 200/reported 100 with verified score still null; caller verification flags and malformed UTC-offset dates both 400; public MCP initialize, tool discovery and actual `brand_index_assess` call all 200. MCP 1.3.0 discovery marks this tool read-only and closed-world. REST and MCP returned the same scope key and trust classifications.
- Sample response correlation IDs: empty REST `req_NB3C-ZH9EnKqwo5B`, complete REST `req_o7uJksTAFYfKL8cM`, MCP calculation `req_6v9rQCKlHaiRyOW0`. These are application response IDs, not a claim of independent source verification.
- Page/API noindex and no-store headers and public-REST CORS were checked on the deployed responses.
- This preview is deployment-protected: an unauthenticated worksheet request returned 302 to `vercel.com`; smoke requests used the authorized Vercel CLI. A no-auth application handler is not the same as a publicly accessible protected preview. No production promotion or change to the separate public connector host was performed.
- All declarations used in these deployed tests were synthetic. No real brand's ownership, corporate/trademark rights, account persistence or external provider was tested by this calculator smoke test.
- Deployment-filtered Vercel request logs confirmed the expected API/MCP 200 responses and deliberate 400 rejections, with no 5xx among these checks. One successful 200 cold request logged Node `DEP0169` (`url.parse()` deprecation) at error level. This warning had also been observed in the earlier name-package preview; its exact call site has not been traced or repaired here. It is not reported as a clean, warning-free runtime.

# Sajda Brand Index: name-first public lookup

Contract `sajda.brand-lookup.v1` · source implementation reviewed 2026-09-13.

## Product boundary

`/brand-index` starts with one name field. The user submits a name, chooses one of up to five source records, then opens that entity's public profile. It does not automatically equate the first match with the intended organization. Names can also match non-business entities: the real IKEA search returned the furniture company and a genus of insects.

The model currently searches **Wikidata only**. An arbitrary name may be submitted, but not every name, private company, country, social platform or legal registration is covered. Empty results mean no match in this source, not availability, lack of rights or a negative brand assessment. Source outage, invalid data and deleted entity are distinct from an empty search.

The existing manual worksheet remains at `/brand-index/assessment`. Lookup records are not imported as ownership reports. `brand_index_assess` remains the separately labelled self-assessment calculator.

## One human and machine contract

- Web: public, name-first `/brand-index`; direct entry on the home page. Five interface languages: English, Swedish, Spanish, French and Chinese.
- REST: anonymous `POST /api/v1/public/brand-lookup`, JSON up to 6 KiB, no URL query parameters or Authorization, no-store/noindex and CORS. Input is a strict search/profile union.
- MCP: `brand_lookup` in public MCP 1.4.0 (five tools) and account MCP 1.3.0 (15 tools). Read-only but open-world; no account mutation, registry/AI quota or automatic ownership verification. Account tool requires `domains:search`.
- Native web surface: same React page, anonymous CORS request to the explicitly configured HTTPS `VITE_NATIVE_API_ORIGIN`, no authenticated bridge. Missing origin fails closed. This is not a signed-device release or live native-origin verification.
- OpenAPI is generated from the same strict schemas. No caller may supply a verification flag or score override.

Search input:

```json
{"operation":"search","query":"IKEA","locale":"en"}
```

After explicit entity selection:

```json
{"operation":"profile","entity_id":"Q54078","locale":"en"}
```

## Evidence semantics

Source fields are P856 (website), P2002 (X), P2003 (Instagram), and P4264 (LinkedIn company/organization identifier). A LinkedIn identifier is displayed with its source; no `/company/` URL is guessed because this property can also refer to other organization types.

Every returned statement is `DATABASE_ASSERTION`, its relationship `not_verified` and temporal applicability `not_established`. Entity ID, statement ID, property ID, rank, qualifier presence, source URL, retrieval timestamp, source revision and record-modification timestamp are preserved. Retrieval time is not verification time; editing the record does not establish that each link is current.

Deprecated statements, any ending qualifier, future or uninterpretable start dates, malformed qualifiers and non-value statements are excluded. Responses are capped at 20 deduplicated statements; omitted statements set `truncated:true`. Current/normal/preferred ranks do not constitute verification. Arbitrary provider URLs are never fetched; only safe HTTPS website links and validated fixed-platform social links are clickable. Raw values remain untrusted plain text.

`index.score` is always null and `verified_assertions` zero. This lookup does **not** measure legal protection, ownership, global strength, financial value or guaranteed naming suitability. Rich public records alone cannot justify assigning IKEA 99 or any other invented verified score.

## Provider and privacy controls

Only the fixed Wikimedia Action API is requested, with an identifying application/contact User-Agent, maxlag 5, redirects disabled, an 8-second request/body deadline and a 1 MiB streamed-response cap. User-provided URLs cannot become request targets. QID redirects must be explicit, unambiguous, acyclic and bounded; returned identity and echoed search must match the selected request.

In-process admission permits one upstream request at a time, starts at least one second apart, and 30 reservations per sliding hour. Provider `Retry-After` is respected even beyond a day; no automatic provider retry. Search cache TTL is 5 minutes and profile TTL 15 minutes; at most 128 entries, singleflight and immutable returned copies. Cached results retain their original retrieval timestamp. This is **not a distributed/global quota**: workers and restarts do not share state. A shared provider budget is required before a high-volume production rollout.

The page discloses that names and selected entity IDs go through Sajda to Wikidata. No account ID, credentials, project brief or private ownership report is included. The page does not store the search in local storage, browser history or its URL; transient server memory caching still applies. Do not add query/body logging. Only request IDs/statuses should enter operation logs.

Wikidata structured data is CC0; visible attribution does not imply endorsement. Primary documentation, terms and source limitations: [source research](research/BRAND-LOOKUP-SOURCES-2026-09-13.md).

## Verification ledger

- 32 provider/budget tests pass, including source ambiguity, unsafe URLs, cache/singleflight, malformed provider responses, query/entity binding, timeout, empty vs unavailable, long provider cooldowns and null verified index.
- 20 client/UI/worksheet tests pass; 50 REST/OpenAPI/MCP/isolated-artifact regressions pass. These use synthetic provider responses, not live ownership checks.
- The existing pure self-assessment model's 18 tests also pass; its verification boundary is unchanged. Two new privacy-disclosure tests pass.
- App/node and Vercel API TypeScript, focused ESLint, 87 language-dictionary contracts, existing UI contracts and diff-whitespace checks pass. App TypeScript was repeated after the final UI/privacy edits.
- Real local adapter call returned HTTP 200 for IKEA/Q54078 in about 1.9 seconds, 13 source statements, revision 2529600667 and verified index null. An earlier call during host load failed safely as unavailable; the subsequent request recovered. No source statements were independently verified.
- Final data-first Edge browser run: five languages × 320/390/1440 px, 15 combinations and 75 layout checks. It exercised explicit selection, result focus/top alignment, a source link visible in the first profile viewport beneath its non-verification label, no-match/error/retry states and source timestamps. Zero unexpected API/external calls or runtime errors; 75 expected synthetic lookup requests. English/Swedish mobile screenshots were visually reviewed. Seven mounted UI tests were repeated after the last presentation changes.
- Initial browser-fixture startup attempts timed out under host load; route-selected lazy imports avoided unrelated compilation for the lookup run. The preserved manual worksheet's fresh browser run still stopped during harness startup, not a product assertion. Its mounted regression and 18 model tests passed; no new worksheet browser pass is claimed.
- Local Vercel build passed, including static-SEO and Neon public-bundle policies. Two real preview builds completed READY: `dpl_GUwRuK8EfRGtyGJdyMnTgFfJ4Us1` and final `dpl_45cdUtTGhyyd59NEHKdCtC5piGfg`. Final URL: `https://sajda-j7vkeqjo3-hypbit.vercel.app/brand-index`. These are preview targets, not production promotions.
- The first preview passed all nine real HTTP/source smoke checks using `scripts/check-brand-lookup-preview.mjs`: both page routes and OpenAPI, actual IKEA search, selected company profile, rejected score injection, public MCP initialization, discovery and real `brand_lookup` execution. Search/profile returned database assertions with null verified index; no account or ownership writes.
- Final-preview REST recheck returned IKEA/Q54078 with 13 statements, revision 2529600667 and retrieval timestamp `2026-09-13T05:00:29.036Z`. The source record modification remains `2026-08-10T12:16:50.000Z`; those dates are deliberately separate. Sample application correlation IDs: search `req_a56qBx5ZwV2AHE9r`, profile `req_oSKigAzlLj_ZeQrx`, rejected override `req_LMAN-JIe8C48p5ag`.
- The final preview subsequently passed the complete nine-check smoke suite again, including real public MCP `brand_lookup` (correlation ID `req_OtU1Tzf9aA0Y7XKR`). Both builds were exercised against the real public source, not just synthetic fixtures.
- Deployment-filtered logs show the checked source requests returning 200. As in the prior feature preview, one cold 200 request logged Node `DEP0169` (`url.parse()` deprecation); its exact call site is not traced or repaired here. This is not reported as warning-free runtime.
- An unauthenticated request to the final page returned 302 to `vercel.com`. Smoke tests used authorized Vercel CLI access: an anonymous application endpoint inside a protected preview is not a publicly installable connector. The separate public connector host, signed iOS app, real device API origin and production were not updated or verified by these preview deployments.

## Next evidence layer

Extend licensed, reviewable sources, resolve organization/group/licensee relationships, add historical snapshots and control challenges/authorized social connections, then compute separate coverage and verified subscores against a fixed declared scope. Add real per-project provider budgets before large-scale traffic. Never convert database assertions or self-reports into verified ownership merely to populate an index.

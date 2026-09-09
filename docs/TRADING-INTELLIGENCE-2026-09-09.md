# Trading intelligence and USD registrar comparisons — 2026-09-09

## Release state

Implemented locally. Not a newly deployed or live-market-verified release. The existing public preview is unchanged by this work.

Trading remains USD 1,880/month in the commercial catalog. This work does not activate payments, create subscriptions, grant access, change prices, purchase domains, register data sources or enable cron. Do not sell it as a validated high-value opportunity feed yet.

## Engine improvements

- Supported registry absence must be corroborated by fresh DNS-address absence and an explicit mail check before entering the review queue. An HTTP404 is a responding server, not proof of expiry.
- Inspect both the observed link and the apex website, deduplicating identical URLs. Robots, public-address checks, redirect guards, operation deadlines, provider cooldown and sensitive infrastructure exclusions remain enforced.
- Recompute priority from observations on every report read. Signal weights: registry40, DNS15, mail10, attempted apex website5, name-structure20, source trail10. Strong review requires all four technical checks; partial review capped69; nonqualifying watch29; registered19; excluded0. These are uncalibrated review priorities, not valuations, market probabilities or SEO authority.
- Preserve diagnostics and fresh overflow beyond the top30. Never fabricate enough rows to fill a leaderboard.
- Select least-recently-attempted approved sources first within the existing3source budget.
- Extract up to60 candidate references from each fetched source; choose up to20 unseen or due names. Skip current-run duplicate domains before taking20. Preserve sensitivity observed by any source.
- Recheck cadence for selection: negative registry15min, unknown30min, registered7days. Existing owner/global run and attempt budgets still apply. This is not a new background schedule.
- The preceding nonempty report survives runs that only encounter recently inspected candidates.

## Persistent research context

Use existing immutable assessment records to compare each displayed domain with this account's prior checks in the same namespace. The window is180days and capped24000rows, restricted to the current report's domains and report completion time. No owner identity, source history or private domains are shared between accounts.

History includes first/last observation, check count, distinct registrable source-domain count and a change from a known previous registry state. Unknown→absent is not presented as a confirmed transition. This is **Sajda observation history**, not prior ownership, historical backlinks, domain traffic, or trademark clearance. Original registry/evidence timestamps are unchanged.

Migration0009 adds history/source indexes only. It is NOT applied to Neon in this session. Code queries remain compatible with the existing tables, but apply and verify these indexes in the intended preview database before scaling.

## Workspace

Active Trading accounts open the workspace before the subscription card. Billing remains accessible in account/subscription disclosure. Reports support domain text, extension and status filters; changed registry states; explained scoring; outstanding-check lists; and formula-safe CSV with observation/expiry timestamps and explicitly unverified registrability. Sensitive/excluded source URLs are omitted from exports. Filters never start external work.

## Registrar comparisons

Porkbun's documented public `/pricing/get` adapter supplies USD standard-TLD prices in addition to Loopia and optional TLDES. It does not establish exact-domain availability, premium-domain pricing or tax treatment. Successful cache15min, failurecache60s, shared in-flight fetch, bounded body and timeout. No new credentials required.

All five interface languages use actual nativeUSD amounts or an approximateUSD comparison from a dated ECB reference via Frankfurter. Native amounts, tax treatment, quote scope and rate date remain visible. Removed fixed10.5SEK/USD assumption. Missing/stale FX yields native prices with unavailable-conversion messaging, never relabelledUSD.

`/api/reference-fx` uses a fixed upstream, supported currency set, max16KB,5s timeout,6h cache and60s failurecache. Client requests are coalesced across cards. Vercel and `serve:qa` use the real handler. The legacy standalone server explicitly returns unavailable instead of inventing a rate. Invalid known-seller links are repaired to that seller's catalog route rather than Loopia.

Primary documentation: [Porkbun API specification](https://porkbun.com/api/json/v3/spec), [Porkbun annual standard pricing](https://porkbun.com/products/domains/), [Frankfurter documentation](https://frankfurter.dev/). Documentation verified; current provider payloads were not retrieved successfully in this environment. Registry minimum registration terms still apply at checkout; no minimum term or multi-year checkout total is inferred from the public pricing feed.

## Verification and remaining gates

- Full local lint, app/API type checks, SEO/Neon boundary policies and UI contracts pass.
- Full automated suite:452 passed,0 failed,2 skipped (454 total). Tests use explicit fixtures for external-provider responses and do not claim live provider integration.
- Vercel-target production build passes;22 static Swedish routes checked; no server database credentials in browser bundle.
-53 read-only HTTP/HTML/API checks pass on loopback. Database health503/not_configured is expected for this test process and is NOT a database pass.
- FX failure endpoint exercised locally:503, no-store, null rate (safe fallback).
- Actual browser/mobile visual verification blocked: browser automation reports no available browser.
- External price/DNS/registry and Neon access unavailable under current network restrictions. Vercel CLI inaccessible and no connected Vercel deployment tool exposed. No deployment or production mutations performed.

### Before commercial release

1. Restore the project's Vercel/Neon execution access; apply index migration0009 to preview and test real account-scoped history/persistence.
2. Deploy preview and exercise the new workspace on mobile and desktop, including filters, CSV, reranking, expiry, account changes and cancellation.
3. Verify real Porkbun and ECB responses and selected registrar purchase links; confirm actual TLD and currency coverage.
4. Add reviewed, diverse discovery sources or licensed domain lifecycle feeds; run bounded longitudinal evaluations of discovered→corroborated→registrar-confirmed candidates. Do not infer editorial independence from hostname counts.
5. Validate actual data quality and operator costs, then resolve existing commerce/email/scheduler release gates before charging for Trading. No guarantee of valuable, buyable or profitable names has been established.

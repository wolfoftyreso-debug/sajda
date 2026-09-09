# Trading Engine v3 — temporal research and precise acquisition evidence

Updated 2026-09-09. This supersedes v2's run duration and final-verification schedule, not its historical verification claims.

## Release status

**NO-GO for a production claim of autonomous underpriced-domain discovery.** The implementation is materially expanded, but this session has not applied Neon migrations, activated a Vercel worker, run a live multi-day investigation, obtained a live registrar quote, or connected licensed comparable-sale data. No real purchase, new source activation or production write was performed.

The product now distinguishes four different concepts:

- Name fit: an explained, limited English/Swedish vocabulary rubric, not measured demand.
- Technical review: timestamped registry, DNS, mail and website evidence, with repeated observations.
- Exact-domain price observation: a registrar's current statement, not a standard TLD price or final checkout total.
- Acquisition-review readiness: complete current costs and documented history, rights and comparable-sale review. Missing evidence never becomes a low-price signal.

## Implemented changes

### Durable long-running research

New runs persist a v3 profile: at most 24 approved source pages, 600 first-pass candidates, three confirmation rounds of at most 30 names each, 900 work attempts over the entire run, and a 72-hour deadline. Each work attempt can perform several individually bounded network checks; 900 is not an HTTP-request count.

The confirmation gaps are at least 20 minutes, then 2 hours, then 12 hours after the preceding completed observation. Completing that path spans at least 14 hours and 20 minutes after the first-pass observation, plus discovery, work and provider delays. Longer elapsed time is not itself evidence of value.

The queue stores the next due time. Workers never sleep for hours inside a serverless function. Daily quota exhaustion waits for allowance to reopen while preserving later provider/temporal delays; lifetime exhaustion remains terminal. Each subsequent round requires a successful, still-eligible immediately preceding observation. Old negative findings cannot revive failed or contradictory later work.

Migration `0011_trading_temporal_confirmation.sql` preserves existing runs' deadlines and verification schedules. It does not enable sources, providers, entitlements or cron.

### Evidence dossier

The server builds the dossier from full, account/namespace-scoped stored observations, not summary counts. History retrieval is bounded to 60 eligible domains and four most recent full snapshots per domain within 72 hours. Original evidence timestamps remain unchanged.

Technical price-review readiness requires current source approval, matching provider/provenance, four current check families, at least three coherent negative snapshots separated by at least 20 minutes, and a span of at least 12 hours. Four check families are **not** four independent providers: DNS, MX and HTTPS can share resolver dependencies.

Active mail, unsafe addresses and sensitive dependencies remain exclusions. A returned HTTP response—including 403, 404 or 5xx—is not proof that the domain is absent. Expiration/renewal dates do not establish registrability. Bounded Common Crawl metadata remains historical context, not verified ownership, traffic or backlink authority.

A newer observation suppresses an older report's current readiness even if the newer run is still active or was cancelled. Previous reports remain visible with their original evidence.

### Exact-domain registrar adapter

Added a server-only, read-only Porkbun `checkDomain` adapter. The operation and fields were checked against the [official Porkbun OpenAPI specification](https://porkbun.com/api/json/v3/spec) on 2026-09-09.

The adapter uses only the fixed HTTPS availability/price endpoint. It never registers, renews, transfers, changes DNS or spends account credit. It requires an explicit feature flag and server-side keys. Sandbox/mock/dry-run evidence is rejected as live evidence. Redirects are disabled, body size is capped at 16 KiB, and the caller/provider deadline is bounded to four seconds.

Shared Neon backoff coordinates workers using the same database, including the documented default check interval and longer provider limits. Missing backoff storage fails closed. HTTP 429 is handled before attempting to parse an error body. Numeric and HTTP-date Retry-After values are retained without shortening longer provider restrictions. Other applications sharing the provider account still require operational coordination.

Observations preserve availability, original five-minute validity, annual registration price in USD, minimum registration years, reported renewal amount, premium/promo flags and only justified subtotal arithmetic. The API schema does not establish the renewal amount's period; it is not labeled per year. Multi-year promotional subtotals, taxes, fees and mandatory extras are not guessed.

The adapter runs only in the final v3 round, at most once per leased candidate attempt. Optional pricing failure does not discard completed primary technical evidence. Original price timestamps remain unchanged on report reads. Quotes may already be stale when a long report finishes; there is no new on-demand quote-refresh endpoint in this iteration.

### Acquisition evidence gate

Readiness requires exact current registrar confirmation and quote, complete renewal/fee/tax/add-on terms, documented historical-use and intended-use/jurisdiction rights reviews, and a documented comparable-sales review. The latter requires at least three distinct reviewed sales from at least two source domains. These are editorial evidence thresholds, not calibrated statistical confidence.

One-, three- and five-year cost scenarios are calculated only with complete known terms, respecting minimum commitments. They hold today's renewal schedule constant and are not guaranteed future prices. A below-reviewed-range result is research evidence, not a promised resale price, return or unconditional instruction to buy.

Absolute `validUntil` deadlines derive from the original evidence—not when a report is opened. Client filters and headings expire rather than extending a nearly stale quote by another five minutes.

There is no connected comparable-sale, rights-review or historical-use review feed in this session. The live path therefore cannot legitimately emit a fully acquisition-ready or underpriced signal today. The model's ready cases are exercised with clearly synthetic test evidence only.

### Workspace

The UI shows the current round, completed work and next due check. During a future scheduled gap it refreshes status with GET rather than repeatedly submitting work mutations. Cancellation and the last completed report remain available.

Technical readiness and acquisition readiness are separate. Rejected/contradicted candidates remain in diagnostics, not the priority shortlist. Expanded evidence is progressively disclosed; price observations show USD and original dates. Filters and formula-safe CSV retain the original status, missing checks and validity deadlines.

## Verification boundaries

Final local results:

- `npm run check`: exit 0. Lint, application/API type checks, boundary checks and UI contracts passed. **592 tests: 590 passed, zero failed, two skipped** (external database-dependent suites).
- `npm run build:vercel`: exit 0. Production assets, 22 static Swedish routes and the public-bundle secret boundary passed.
- `npm run check:runtime`: **53 HTTP/HTML/API checks passed** against the generated code at loopback. Database health returned **503 / not_configured**, not a working database.
- `node scripts/migrate-neon.mjs --plan`: generated the checksummed local migration plan through 0011; nothing applied.
- `node --check scripts/check-lost-domains-store.mjs`: syntax passed. Running without `--run` returned **SKIPPED** without opening a database.

The temporary local QA server was stopped after verification. No preview or production deployment was performed.

Local verification uses deterministic provider responses, simulated clocks, mocked SQL transport, mounted React components and generated HTTP routes. Time-separated tests advance clocks; they are not a real 72-hour run.

The PostgreSQL rollback harness includes the staged rounds, legacy preservation, lifetime accounting beyond 24 hours and quota waiting. It was not run against Neon here. No browser-level visual/mobile test, deployed preview, production run, live registrar acceptance, payment or email delivery is asserted by this change.

Connector discovery found no callable Vercel, Neon, Porkbun or comparable-sale connector. Plugin discovery/search capabilities also were not exposed; permission-management tools alone do not provide those service operations. Public documentation was used to ground the adapter. No new plugin was installed.

## Actual remaining rollout requirements

1. Connect the intended Vercel/Neon environment; review and apply migrations through 0011 to an isolated preview database first.
2. Execute the transaction-rollback PostgreSQL harness there and test the actual deployed worker across browser closure, retries, cancellation and persisted waits.
3. Review and enable exact permitted sources; verify the scheduled trigger, feature flags, runtime logs and resource limits. A 24-source capacity does not mean 24 sources are available or approved.
4. Configure restricted server-side registrar credentials and run a controlled read-only test. Verify price freshness at the point of an acquisition decision.
5. Connect legitimate comparable-sale and due-diligence evidence before describing any result as acquisition-ready or unusually underpriced. Validate the ranking against an independently reviewed domain benchmark rather than promising exclusive winners.

Current unsupported or unverified depth includes measured buyer demand, calibrated resale valuation, comprehensive backlink quality, complete ownership/history, automatic rights clearance, whole-market coverage and profitability. These limitations are not hidden behind a higher numerical score.

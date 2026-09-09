# Sajda Plus — Lost Domains, pilot v1

Follow-up: the operator subsequently requested a login. See [current pilot access and USD pricing](PLUS-PILOT-ACCESS-2026-09-09.md) for the explicitly activated test preview, expiring synthetic access and real deployed flow verification. The status below records the initial default-off delivery.

Status: implemented pilot, **not commercially launch-ready**. No subscription, paid access grant, approved crawl source or scheduled production crawl was activated during this work.

## What exists

- Public presentation and private workspace at `/plus`, in Swedish and English. Other selected UI languages deliberately fall back to English for this feature.
- Explicit start, progress, cancel, retry/rejoin and previous-report preservation. Opening the page never starts collection. Private data is cleared on account change or revoked access.
- Same-origin `GET/POST /api/account/lost-domains` with verified cookie session, initiating-account check, finite server-side Plus entitlement, shared rate limit and no-store/noindex responses.
- Durable Neon PostgreSQL campaigns, runs, work items, leases, attempt charges, source-policy snapshots and immutable assessments. No browser-local plan flag or success URL grants access.
- Source discovery follows links on explicitly reviewed public HTML pages. It is not a whole-web crawler, JavaScript browser, historical index or recursive corporate-site scan.
- Each candidate receives dated DNS, MX, target-HTTP and RDAP observations where the protocol/source is supported. Failures remain unknown. Sensitive links and active-mail findings are excluded.
- Up to 30 fresh review candidates, with separate naming-potential and evidence-coverage scores. Older and rejected observations remain visible as diagnostics.
- An opt-in cron dispatcher endpoint exists. There is no active schedule in `vercel.json`.

## Evidence, not fictitious value

`registry_not_found` means a coherent negative registry response, not a registrar purchase quote. All current assessments have `registrability: "unverified"`, `confirmedRegistrable: false`; the confirmed-find list is empty by construction.

Broken links do not prove abandonment or prior ownership. A link from a company is not evidence that the company owned its target domain. No traffic, backlink inheritance, SEO return, trademark clearance or financial valuation is asserted.

Potential is an uncalibrated heuristic: existing naming signal plus a registry-absence signal, capped at 60/100. Evidence coverage is capped at 70/100 and is **not a probability**. Review ordering first prioritizes evidence coverage, then naming potential. A result needs fresh, coherent registry-absence evidence (15-minute maximum age) and no exclusion/conflict to enter review. There is no padding to 30.

Current RDAP coverage: .com, .net, .org, .app, .dev, .ai, .xyz, .info and .biz. Other suffixes are unknown; there is no fallback to scraping restricted WHOIS. Exact registrar registrability/prices, .se/.nu connectors, historical ownership, backlinks, trademark checks and valuation remain separate future adapters.

## Bounded execution

| Limit | Pilot value |
|---|---:|
| Sources per run | 3 |
| Candidate links per source | 20 |
| Candidate checks per run | 60 |
| Attempts per work item | 3 |
| Attempts per run | 80 |
| Runs per owner / rolling 24 h | 2 |
| Runs per namespace / rolling 24 h | 10 |
| Attempts per owner / rolling 24 h | 160 |
| Attempts per namespace / rolling 24 h | 500 |
| Active worker leases per namespace | 1 |
| Lease | 45 seconds |
| Run lifetime | 6 hours |
| Manual refresh cooldown | 5 minutes |
| Account endpoint requests | 60 / minute |

Namespaces are development, preview and production. Preview deployments share the preview budget. All source work must settle before candidate work can start, allowing sensitive signals from multiple sources to be combined conservatively.

The browser advances one work item approximately every ten seconds while the workspace is open. A closed browser does not secretly continue working. Reopening can resume durable work; an expired lease can be reclaimed with a higher fencing value. Cron, if explicitly enabled later, also advances at most one item per invocation. A once-daily invocation alone is therefore **not** a full daily crawl: a bounded dispatcher cadence is needed to drain the queue.

Attempt budgets are charged before external work. Uncertain database completion does not immediately repeat provider work. Duplicate completions are idempotent; cancelled, expired and revoked work cannot overwrite reports. Unknown-only registry refreshes fail and preserve the last useful report; mixed results are partial. A genuine successful zero-result report is allowed.

Provider throttling uses a shared Neon cooldown keyed by approved registry host. Retry-After persists across function instances, cannot shorten an existing cooldown, and informs the next attempt. Retries cannot extend a run beyond its six-hour deadline.

## Network and data protection

- Only approved HTTPS source URLs; no user-submitted arbitrary crawl URL.
- Live robots checks for each destination; unavailable/disallowed/malformed policy fails closed. Positive Crawl-delay is currently rejected, not ignored.
- DNS answers are validated and the selected public address is pinned for TLS requests. Private/reserved addresses, credentials, unsafe ports and unsafe redirects are blocked.
- TLS/SNI verification, bounded redirects, 256 KiB response cap, 3.5-second fetch timeout and shared ten-second engine operation deadline.
- No authenticated crawling, cookies, JavaScript execution, forms, contact harvesting or raw RDAP personal information.
- Query-bearing/sensitive links are redacted and marked excluded rather than converted into apparently safe evidence.
- Parameterized SQL, owner-scoped joins, finite grants, RLS/revoked public table privileges and append-only assessment protection.

RLS is defense in depth; the server database connection is privileged. Owner-scoped authorization and queries remain required and tested.

## Deployment and activation boundary

Existing Vercel + Neon infrastructure is used. Authentication remains Better Auth on Vercel with Neon PostgreSQL; no Supabase was added. Migrations `0006_lost_domains.sql` and `0007_lost_domains_provider_backoff.sql` were applied to the existing development/preview Neon database. Migration check reports eight applied migrations and none pending.

Default-off server settings:

- `SAJDA_LOST_DOMAINS_ENABLED=true` permits start/advance only after all other gates pass.
- `SAJDA_LOST_DOMAINS_CRON_ENABLED=true` additionally permits the cron dispatcher.
- `CRON_SECRET` must be 32–256 characters; requests require exact Bearer authentication. It must never be public or logged.

Pilot activation requires a deliberately reviewed source record in `sajda.lost_domain_sources` (exact host/URL/robots URL, review reference, allowed policy and an expiry no more than 30 days after review), plus a finite operator/billing grant in `sajda.lost_domain_access` for a real verified account. Daily refresh is a separate default-false entitlement setting. There are no automatic grants or source seeds.

Do not enable broad collection by inventing permission, ignoring provider terms or importing an unreviewed corporate-domain list. Do not create Stripe prices or charge the indicative 20,000 SEK/month until scope, tax presentation and billing lifecycle are agreed and tested.

## Verification actually performed

- Full repository check: lint, application/server TypeScript, SEO policy, Neon boundary, syntax, Vercel API types, UI contracts and automated tests. 313 tests: 311 pass, zero failures, two opt-in tests skipped.
- Real Neon PostgreSQL rollback harness: **31 checks passed**, including ownership, finite entitlement, policy expiry, source-stage sensitivity merge, idempotency, lease fencing, backoff, budgets, preserved reports and fresh-store recovery. Zero persistent fixture rows afterward; no external provider calls in this harness.
- Mounted React component and real account client tested with network fixtures: explicit start, double-click/retry UUID, active-run rejoin, cancel, account changes, unmount and revoked-access cache removal.
- Actual bounded network smoke: example.com discovery found iana.org; a real registry check classified it as **registered**, never a find. DNS resolved; target HTTP and mail were unknown. No database writes or access grants.
- Two Vercel preview build cycles, followed by browser/HTTP verification; see the final verification addendum below.
- Dependency audit: zero known vulnerabilities at verification time.

Reproduce local checks:

```powershell
npm run check
npm run build:vercel
node --env-file=.env.neon-development.local scripts/migrate-neon.mjs --check
node --env-file=.env.neon-development.local --import tsx scripts/check-lost-domains-store.mjs --run
node --import tsx scripts/check-lost-domains-live.mjs --run
```

The PostgreSQL harness requires an inactive development catalog and uses one outer rollback transaction with savepoint-bound store calls. It is not a multi-connection load test. The live smoke is explicitly bounded and does perform public network requests. Neither script is a production crawler.

## Not verified / not active

- No real paying Plus account or browser-based entitled end-to-end crawl; positive private flows were exercised in mounted component tests and actual PostgreSQL tests separately.
- No deployed positive crawl, active daily schedule, sustained concurrency/load baseline or production promotion.
- No Stripe sandbox/live subscription, webhook-to-Plus billing entitlement or payment lifecycle.
- No verified Resend sender/delivery; existing account email configuration remains a separate launch blocker. Password reset must go to the account holder, not the support mailbox.
- No commercially adequate catalog, licensed historical/link data, exact registrar availability/pricing or calibrated valuation dataset.
- Production domain, production database/configuration and production release gates have not been approved by this pilot.

## Next five highest-value steps

1. Select and approve a small real source corpus, then measure real yield, false positives, latency and cost per useful candidate.
2. Add licensed/exact registrar availability and price adapters, including lawful .se/.nu coverage; retain unknown/error distinctions.
3. Add licensed history/backlink and risk evidence with source timestamps and explicit ownership limits.
4. Calibrate ranking against manually reviewed outcomes. Only introduce value intervals when comparable evidence and uncertainty support them.
5. Finish Plus billing, account email, operator controls and a bounded scheduler; rerun an entitled deployed golden path before paid launch.

## Final preview verification

Final deployment: `dpl_6hws6ypfhnkSoWNdmkHUgsFWwLCw`, Vercel READY, preview target (not production).

[Open the shared Plus preview](https://sajda-4w8k6fe5l-hypbit.vercel.app/plus?_vercel_share=WHT9KS8z4IsCwVMI1FfXrqLOBbogyNo0). The share link bypasses Vercel's preview login only; it does not grant a Sajda session or Plus access.

- `/plus`: HTTP 200, private/no-store, noindex/nofollow.
- `/api/health`: HTTP 200, database connected.
- Anonymous `/api/account/lost-domains`: HTTP 401, private/no-store, owner-varying response; no private data.
- Unauthenticated `/api/cron/lost-domains`: HTTP 401, no work dispatched.
- `/api/auth/get-session`: HTTP 200 with null guest session.
- Real browser: English/Swedish presentation, 320/390 mobile layouts, 1440 desktop layout, Plus-to-login return path and Plus-to-contact navigation. Mobile Plus had no measured horizontal overflow; home header was adjusted and visually rechecked at 320px.
- Browser test connection timed out once during a DOM read; a fresh tab restored testing. This was not reported as a product failure or silently counted as a completed check.
- Runtime log inspection found one Node DEP0169 `url.parse()` deprecation warning on the successful auth session route, not an observed request failure. Its dependency/runtime origin remains untraced.
- Final repository check rerun: 311 passed, two skipped, zero failures. Test-only HMR was disabled to remove parallel test-server port conflicts.
- Temporary local QA server stopped; user's existing local server was left untouched; viewport override reset.

## Primary implementation references

- [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [tldts public-suffix parsing](https://github.com/remusao/tldts)
- [robots-parser](https://github.com/samclarke/robots-parser)
- [Cheerio HTML parsing](https://cheerio.js.org/docs/intro/)

# Trading research engine v2

Implementation ledger, 2026-09-09. This is not evidence of a deployment or a profitable domain discovery.

## What changed

- Server-owned run ceilings: 24 reviewed sources, 600 first-pass names, 25 selected names/source, up to 30 final verification checks. Two new runs/account/day, 900 work attempts/run, 1,800/account/day, 6,000 globally/day, 24-hour deadline. Retried work consumes budget. A source or candidate ceiling is not a promised result count.
- Existing runs keep their original 3/60/20/80/six-hour settings. Migration 0010 adds persisted budgets and a final-verification phase without rewriting existing assessments or granting access.
- Source selection rotates least-recently inspected publishers and diversifies registrable source domains. A source's bounded 1,000-anchor window contributes a 60-reference pool: two thirds name-fit-led, one third reproducibly explored using the server run ID.
- Selection reserves work for new names, due negative registry signals, uncertain checks and weekly registered rechecks. At 25 slots the target split is 13/6/4/2; unused slots spill over. This prevents old promising observations being permanently crowded out.
- Sensitive observations are monotonic across source results, including references dropped by a source's selection quota. Existing SSRF, robots, reviewed-source expiry, mail/dependency and contradictory evidence guards remain.
- After the first pass, a transaction selects up to 30 technically coherent candidates for a fresh second check. Each new observation is immutable. The report selects the latest observation per domain; a later registered/unsafe result cannot be hidden by an earlier attractive result.
- Ranking first respects technical evidence tiers, then uses an explained EN/SV name-fit rubric. Dictionary/compound meaning, plausible sector use, readability and extension fit have separate weights. This is a small editorial lexicon, not measured buyer demand, an appraisal or a profit model.
- Optional Common Crawl metadata runs only for eligible final-pass candidates with name-fit at least 60. Exact apex host, latest one collection, maximum five rows, no archive payloads, no target-page crawling. Its separate four-second deadline preserves the primary inspection.
- Archive requests use a fixed-provider durable Neon gate; 429/503 extends a shared cooldown by at least 24 hours. Failed gate checks never fetch. Failed cooldown persistence leaves unknown evidence and emits a sanitized operator event; operators must investigate this before relying on cross-worker enforcement.
- Cron processes at most three sequential leased work items, stops claiming after a 25-second soft budget, and has a 60-second function limit. No concurrent scanning or unbounded fan-out was added.
- Workspace exposes separate naming evidence, technical evidence and archive samples, filterable results, CSV export and distinct verification progress.
- Search/export cover all returned rows; diagnostic rendering grows in 50-row batches. The response keeps ranked order under a 2.8 MB UTF-8 candidate budget and explicitly reports omitted rows, rather than failing the whole request on an oversized report.

## What the engine does not establish

RDAP absence is not registrar purchase confirmation. Archive samples do not prove former corporate ownership, legitimate backlink authority, traffic, trademark clearance or current acquisition price. Domain spelling signals do not establish demand or resale value. Missing data stays unknown; the queue is never padded to 30.

## Rollout gates

1. Apply migrations 0009 and 0010 transactionally to the intended Neon environment; check migration checksums first. No existing observation rows are deleted. The assessment uniqueness rule changes from one observation/domain/run to one observation/work item, permitting the final check.
2. Run the rollback-only PostgreSQL verification harness against an inactive, reviewed development database. Unit/static SQL tests are not a substitute.
3. Review source rights, exact pages and robots again. Register disabled sources, then probe/enable explicitly. The larger manifest budget does not approve additional publishers.
4. Deploy a Vercel preview with the matching schema. Verify account scope, starts, primary checks, final verification, cancellation, retries and latest-observation reporting with actual provider evidence.
5. Enable optional archive enrichment only after its provider throttle and actual metadata responses are verified. No keys, paid plans or source permissions were created by this change.
6. Enable the protected worker only after validating a suitable schedule and Vercel plan. No active cron schedule or production flags were changed in this local work.

## Primary references

- [Vercel function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration): configure the worker deadline separately from the rest of the API.
- [Common Crawl index](https://index.commoncrawl.org/) and [provider request guidance](https://commoncrawl.org/faq): bounded metadata requests, sequential use and cooldown.
- [CDX Server API](https://github.com/webrecorder/pywb/wiki/CDX-Server-API): host matching and field/result limits.

## Verification

- Final `npm run check`: PASS. Lint, application/server/API TypeScript, SEO/Neon boundary checks, Node syntax, 521 passing tests, zero failures, two skipped tests, and UI contracts. Total test cases: 523.
- Final `npm run build:vercel`: PASS. Production bundle built, 22 Swedish static routes checked, no browser database/auth-secret boundary violations.
- Final local `npm run check:runtime`: 53 HTTP checks passed against the actual Vercel handlers and final build on loopback. Database health was **503 / not_configured**; this is not a database pass.
- Migration `--plan` read all eleven local files successfully; no database migration was executed. The upgraded rollback harness passed syntax/lint and explicitly returned SKIPPED without `--run`.
- Browser inventory returned no apps/browsers. Mounted React tests are not visual/mobile browser verification.
- No callable Vercel/Neon deployment/database connector was found in this run. Plugin-management discovery/search actions were not exposed; installed-resource inspection did not establish an alternate path. No remote deployment, source activation, cron schedule, external provider success or investment outcome is claimed.

**Release status: not cleared for production.** The local implementation is verified in the scopes above; database phase transitions, actual source coverage, archive responses, full browser journeys and deployed runtime remain release gates.

# Trading Engine release follow-up — 2026-09-09

## Scope and status

This follow-up closes the point-of-use price-refresh gap in the v3 engine. It does not claim that a new Vercel deployment, a multi-day live investigation, a registrar quote or underpriced investment opportunity has been verified. The preceding [v3 report](TRADING-ENGINE-V3-2026-09-09.md) describes the technical research engine and its evidence boundaries.

**Release remains NO-GO for an autonomous, fully verified acquisition-signal claim.** Current rollout access and licensed comparable-sale/due-diligence inputs are still required. Test fixtures are not market evidence.

## Implemented

- An explicit “Update price and availability” action for an existing account-owned report candidate. It uses the fixed read-only registrar check, not a purchase operation or a new research run.
- Durable, separate quote requests and append-only observations in migration `0012_lost_domains_quote_refresh.sql`. Original technical assessments remain unchanged.
- Server-side Trading entitlement, verified-email, namespace, report, source-approval, sensitivity and newer-contradiction checks. The server chooses the candidate and provider; the client cannot submit prices or URLs.
- One pending request per account, a 60-second per-domain cooldown, 60 attempts per account over 24 hours, a 20-second reservation and a four-second provider bound. Shared registrar backoff remains authoritative across workers using the same database.
- Reusing a request UUID does not repeat the provider request. An uncertain response can be checked with a read-only status refresh. A failed update retains the previous dated price and clearly reports the failure.
- Swedish and English controls, wrapped labels, accessible pending/error feedback, and distinct technical and price timestamps. Quote updates cannot restore expired technical readiness or invent missing rights, history, taxes, fees, renewal terms or comparable sales.
- Production configuration now rejects enabled autonomous research without an actual worker schedule and dedicated secret, and rejects enabled pricing with missing, invalid or sandbox-shaped credentials. Public build checks strip browser-prefixed registrar/scheduler secrets and reject leaked registrar key patterns.
- Database health now requires the temporal-worker columns and independent quote storage; an older, reachable database no longer passes that structural check just because the original account tables exist. This still does not replace checksum/constraint verification or real SQL execution.
- The opt-in real-PostgreSQL rollback harness now covers quote ownership, idempotency, immutable observations, unchanged technical evidence and failure recovery. It never calls the registrar and does not leave fixture rows behind when run successfully.

## Actual infrastructure findings this turn

- **Observed:** local Vercel linkage identifies project `sajda`. The locally saved production configuration names `https://sajda-eight.vercel.app`; this is not a newly deployed or verified URL.
- **Observed:** local Neon development and production configuration files contain connection variables. No values were printed or included in reports.
- **Verified failure boundary:** a bounded development Neon connection was rejected locally with `EACCES` before any SQL reached the server. No production database was contacted or changed.
- **Verified failure boundary:** unauthenticated application HTTP probes were rejected locally with `EACCES`. This is a session network limitation, not evidence that the application is down.
- **Observed:** no Vercel CLI on PATH or in project dependencies; no CLI account authentication at the checked standard locations. A denied cache directory was not bypassed.
- **Observed:** connector inventory exposed no callable Vercel, Neon or Porkbun service operations. Plugin-management discovery was examined, but plugin-search/install capabilities for those services were not available. Browser inventory returned no connected browsers.
- **Unknown:** current remote environment values, database migration state, deployment contents, source approval, worker progress and registrar operation. Missing keys in a local snapshot do not establish remote state.

## Verification

Final checks after integration and the strict-null fixes:

- `npm run check`: exit 0. Lint, application and server typechecks, SEO/boundary checks, Node syntax and UI contracts passed. **614 tests: 612 passed, zero failed, two skipped** (database-dependent suites).
- `npm run build:vercel`: exit 0 on the final source. Production assets, 22 static Swedish routes and the public-bundle secret boundary passed. This was a local build, not a Vercel deployment.
- Final-source, one-shot loopback run on port 8096: **55 HTTP/HTML/API checks passed**, including anonymous quote POST and unauthenticated scheduler denial. Health returned **503 / not_configured**. The one-shot server was stopped afterward.
- Separate focused verification included 12 new backend quote-refresh tests, 44 frontend/client mounted tests and independent integration review. They are included in the aggregate suite, not added to its count.
- `node scripts/migrate-neon.mjs --plan`: local checksummed plan through 0012 generated; no migration applied.
- PostgreSQL rollback harness: syntax passed; actual execution **not performed** because database connectivity is blocked. Its fixture assertions are not reported as passed PostgreSQL tests.

The first combined check found three TypeScript narrowing errors in the new store code. They were corrected, then the entire combined check was rerun successfully. There is no remaining known failed local test in the final source.

Local tests use deterministic providers, mocked database transport, simulated time and mounted React components. They do not prove inbox delivery, real payment, browser visual/mobile rendering, production authorization, actual SQL constraints, unattended multi-day operation or commercial price/valuation quality. The exploratory local QA session on port 8095 may remain running; it is not a deployed URL.

## Rollout boundary

1. Restore authorized Vercel/Neon access for this session. Do not paste credentials into chat or browser-public variables.
2. Inspect the target migration ledger and apply the reviewed additive migrations to the isolated preview database. Run the rollback harness there before a production migration.
3. Deploy and exercise a protected preview: account ownership, known pending/success/failure quote updates, stale technical evidence and long-run resume/cancellation. Inspect runtime logs.
4. Verify the actual Vercel plan and resource budget, reviewed source catalog, `CRON_SECRET` and both engine/scheduler switches before adding the explicit recurring schedule. Demonstrate progress while the browser is closed.
5. Configure restricted registrar credentials and verify a real read-only response. Obtain legitimate comparable-sale and due-diligence inputs before claiming investment readiness or low pricing.

The frequent worker cadence requires a Vercel plan supporting it: the [official cron usage documentation](https://vercel.com/docs/cron-jobs/usage-and-pricing), checked on 2026-09-09, distinguishes daily Hobby schedules from minute-level Pro/Enterprise schedules. No plan upgrade or recurring service expense was initiated here.

No deployment, migration, new source activation, recurring schedule, credential creation, access grant, domain purchase or real payment was performed in this follow-up.

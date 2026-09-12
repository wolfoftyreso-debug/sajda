# Trading portal

The signed-in Trading account now has four research views on `/plus`.
This is a domain-research workspace, not an order-execution terminal or a
market-price prediction service.

## Views and evidence

- **Radar:** search the current report, inspect up to 30 candidates, and switch
  between Balanced, Brand potential, Acquisition checks and Risk first.
- **Domain twin:** the latest recorded registry, DNS, web and mail observations,
  their source and timestamp, available exact registrar-price observations, and
  existing observation-history summaries. Missing, inconclusive and expired
  evidence remain distinct from an observed result.
- **Scenario lab:** a user's downside/base/upside exit-price assumptions,
  acquisition and renewal costs, fees, assumed sale probability and holding
  period. It calculates conditional cash flow, break-even and holding-period
  sensitivity. The chart is a what-if calculation, not price history.
- **Journal:** account-owned scenarios with a thesis, catalyst, invalidation
  condition, review date, outlook, analysis mode and optimistic version control.
  The review date is a journal reminder label, not a scheduled email.

English is the source language. Complete Swedish, Spanish, French and Simplified
Chinese dictionaries use the existing application language preference.
View changes bring the navigation and beginning of the selected analysis into view.

The existing scanner, report pagination, explicit registrar recheck, CSV export,
billing and account gates remain in place below the portal.

### Ranking contract

All scores are bounded heuristic review priorities, never valuations or a
measured probability of sale. Excluded candidates have zero priority outside the
Risk first queue. With no current technical evidence they receive no positive
priority in other modes.

- Balanced: 40% naming rubric, 30% evidence confidence, 30% existing opportunity
  rubric.
- Brand potential: 80% naming rubric, plus five points per current check type.
- Acquisition checks: up to 45 points for a fresh exact available registrar
  observation, five per current check type, and 35% existing opportunity rubric.
  A newer or equally recent registered observation removes the availability bonus.
- Risk first: high scores mean unresolved risk, not attractive investments.
  Exclusion adds 40, each missing current check type adds 10, and recorded risk
  reasons contribute up to 20.

A current check has a supported, meaningful outcome, a non-future observation,
an unexpired timestamp and at most a 15-minute lifetime. A newer inconclusive
observation supersedes an older successful check. Conflicting simultaneous
observations do not count as a confirmed check. The four check types are not
claimed to be four independent providers.

Coverage by extension and recorded registry changes describe the report only.
They are not market-demand trends. Registry absence does not establish
registrability. A registrar's unavailable response does not necessarily mean a
domain is registered. The displayed minimum registration subtotal excludes
unverified tax, fees and mandatory extras; it is not a final payable total,
reservation or resale value.

## Scenario mathematics

Let A be acquisition, O other costs, R annual renewal, m holding months,
f the selling-fee fraction, p the user's assumed sale probability, and S an
assumed exit price.

- Renewals = floor(m / 12).
- Total cost C = A + O + R × renewals.
- Net if sold = S × (1 − f) − C.
- Probability-weighted cash flow = p × S × (1 − f) − C.
- No-sale cash flow = −C, not a claim that the unsold domain has no value.
- Break-even sale price = C / (1 − f).
- Probability-adjusted break-even = C / ((1 − f) × p), undefined at p = 0.
- Return on modeled cost = 100 × net if sold / C, undefined at C = 0.

Acquisition is explicitly assumed to cover the first 12 months. Month 12 includes
the first renewal, month 24 the second. The user must check actual contract dates
and account for unmodeled costs. The model does not discount future cash flows,
apply taxes or infer liquidity. Downside ≤ base ≤ upside is required. Zero is a
valid monetary input, but missing input is not silently treated as zero.

## API, storage and access

Implementation:

- `shared/trading-scenarios.ts`: shared strict schemas and pure mathematics.
- `src/lib/tradingPortal.ts`: evidence freshness and review order.
- `src/components/TradingPortal.tsx`: real product interface.
- `src/lib/tradingScenarios.ts`: same-origin account transport and strict receipts.
- `api/account/trading-scenarios.ts`: GET and POST account endpoint.
- `api/_shared/trading-scenarios-store.ts`: transactional PostgreSQL storage.
- `db/migrations/0018_trading_scenarios.sql`: additive Neon migration.

GET returns `{ accountId, requestId, scenarios }`.
POST accepts only `{ action: "save", scenario }`. The scenario includes an
immutable UUID and `expectedVersion` (0 for creation). The server responds with
the authoritative account snapshot, not an optimistic client acknowledgement.

The server requires the existing verified Sajda session and current Trading
entitlement. It derives the owner from that session, never a request body.
The database additionally checks verified ownership and active effective Trading
access. Every query is scoped to account and development/preview/production
namespace.

Saving uses an account transaction lock, a 100-scenario limit and compare-and-swap
versions. Retrying the last identical committed save is idempotent. A modified
request after uncertain delivery keeps the same UUID; a version conflict requires
reloading and deliberate reconciliation rather than creating a duplicate.
The journal keeps the latest version, not a full immutable revision archive.

Requests are rate-limited to 60 per minute per owner and environment. POST input
is strict JSON and capped at 16 KiB. Errors have safe request IDs; private text and
credentials are not logged. Responses are private, no-store and noindex.
Account deletion cascades the scenario records and removes the new rate-limit
hashes across environments.

The native account bridge allows canonical GET with `trading:read` and POST with
`trading:run`; query variants and other methods are rejected. This does not add
anonymous access, a new entitlement, or a separate Trading login.

## Verification and release

Automated coverage includes financial edge cases, strict input contracts, owner
and environment isolation, auth gates, transactions, retries, limits, rollback,
version conflicts, native routing, source freshness, language completeness and
mounted UI flows. Tests use simulated providers/storage unless explicitly
documented as a live test.

Local verification on 2026-09-11:

- Full `npm run check` after the full debugging pass: passed; 1,277 tests passed, seven optional tests skipped,
  zero failures. Includes lint, frontend/server types, language, SEO, Neon
  boundary, node syntax and UI contracts.
- `npm run build:vercel`: passed, including public-bundle and static SEO checks.
- `npm run build:native`: passed with the existing HTTPS test API origin.
- `npm run db:plan`: includes additive migration 0018; no database connection.

The subsequent read-only development database check confirmed 0018 is still
pending. The expanded health readiness query correctly refuses a ready result
without the scenario table and its required columns. See
[`FULL-DEBUG-2026-09-11.md`](./FULL-DEBUG-2026-09-11.md) for separate local,
deployed, database and browser evidence and the remaining release gates.

The debugging pass also fixes exact decimal rounding, PostgreSQL-invalid text,
UUID normalization, account-bound request snapshots, malformed responses and
the stale-evidence veto. Unsaved scenario drafts now have both hard-navigation
protection and a localized in-app leave/stay dialog using React Router's data
router. This applies to the web and native JavaScript entrypoints; no draft is
written to browser storage. The account boundary still verifies every private
request afresh, while transient background session errors no longer unmount an
unexpired, previously verified editor. Session reads use an atomic anchored
database rate window; credential/recovery endpoints retain their stricter limits.

The additional `trading-scenarios-postgres.test.ts` is an opt-in, rollback-only
development integration test. It is skipped by default and was not run against
Neon. It requires a separately supplied test URL/hostname and explicit opt-in,
refuses deployment runtimes and requires migration 0018 to exist already.
It prepares real-SQL ownership, namespace, retry/CAS, capacity, constraint and
deletion-cascade checks without committing test users or grants. Multi-connection
concurrency still needs separate real-database validation; simulated lock tests
are not presented as equivalent evidence.

An isolated visual fixture is available with:

```sh
node node_modules/vite/bin/vite.js --config tests/fixtures/trading-portal.vite.ts
```

Open `http://127.0.0.1:8188/trading-portal-preview.html?lang=en` or `?lang=sv`.
It uses the real component/CSS with clearly marked synthetic observations and
in-memory transport. It is loopback-only, noindex, has no live account or price
calls and explicitly refuses production builds. Its successful save is not proof
of Neon persistence.

The browser review exercised Radar → Domain twin → Scenario lab → save → Journal
→ edit, language switching and layouts at 320, 390 and 1280 pixels. A fixture
calculation with $100 acquisition, $20 annual renewal, $20 other costs, 24 months,
10% fee and 50% assumed sale probability correctly shows $160 cost, $177.78
break-even and −$25 probability-weighted base cash flow at a $300 assumed sale.

Behavioral references informed fixed workspace views and separation of list,
detail and context, without copying investment data or layouts:
[Fey on Mobbin](https://mobbin.com/screens/c897df58-46d2-4a90-a615-bb1b408edabe) and
[Perplexity on Mobbin](https://mobbin.com/screens/471f9aa4-b86c-4eb8-bddf-6f7a36639782).

### Required live release boundary

The new migration has been planned locally, not applied to live Neon. The portal
has not been deployed or exercised with a live database in this change. No live
membership, Stripe product, payment, registrar purchase or customer data was changed.

Before release, apply migration 0018 through the existing approved migration
workflow against the intended environment, deploy the matching API and frontend,
and verify one entitled account can save, reload, sign out/in, and update a
scenario while another account cannot read it. Verify a non-Trading account is
denied and inspect runtime request IDs for a forced failure. Native bundle build
success does not compile/sign iOS or establish TestFlight readiness.

Recorded resale-price history, external comparable sales, measured market demand,
calibrated forecasts, price-trend feeds and automated purchase execution are not
connected by this change. These need real licensed data and separate validation;
the portal does not manufacture them from DNS failures or naming scores.

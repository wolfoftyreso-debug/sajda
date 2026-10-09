# Archived brand registry observations — 7 October 2026

## Scope and trust boundary

This increment adds a separate source-check archive to account-owned brand
reports. It is not global brand ownership, trademark clearance, a historical
valuation, price verification or continuous monitoring. The self-assessment
continues to contain only recorded user declarations; its verified score stays
null. A registry observation does not prove that the account owns the domain.

The website distinguishes saved source history from optional session-only
checks. A saved check targets only the exact immutable report-version scope,
keeps original source dates and approved URLs, and preserves unknown results.
Checked sources currently cover nine reviewed single-label RDAP extensions;
unsupported scopes such as `.co.uk` or `.se` stay unknown without a network
request. A report read or history refresh never refreshes a registry.

Private MCP source version 1.9.0 has 27 tools. `brand_checks_history` requires
`projects:read`; `brand_checks_start` requires **both** `projects:write` and
`domains:search`. Web, native adapter, private REST and MCP share the same
owner/environment-scoped handler. Public MCP remains six tools and has no
account access. See [the exact contract](ACCOUNT-API.md#archived-registry-observations).

## Recovery and limits

Each intentional start uses a new UUID request key. An identical retry returns
the original receipt without starting another provider check, even after the
report advances. New starts require the current report version. The short
reservation/finalization transactions exclude provider work, preventing an
external delay from holding the account lock. Pending attempts expire after
five minutes as failed/interrupted; late completion cannot resurrect them.

Limits: 20 saved domains, one pending attempt per report, 100 attempts per report,
10 new attempts per account/environment per UTC day, explicit paginated history.
Source freshness is recomputed against original dates, not retrieval time.
Completed means the process finished, not that every source supplied evidence.
Uncertain UI requests retain their exact key; read-only status polling is bounded.

## Preview rollout

Fresh ignored Vercel exports were checked against the existing project/team
linkage and independently pinned earlier preview database. Preview and production
database identities differ. Additive migration `0023_brand_checks.sql` was
reviewed and applied **only to preview**: 24 applied, none pending. Both report
and check flags are enabled only in Preview. Production configuration and data
were not changed. Promotion alone does not copy preview flags or its database.

## Actual PostgreSQL evidence

`scripts/probe-brand-checks-preview.ts` passed on the separate Neon preview:
concurrent identical receipt/replay, pending admission control, provider work
outside locks, latest-version CAS, immutable terminal receipts, exact owner and
environment boundaries, interrupted-reservation expiry, original-date aging,
daily/100-record limits, pagination and preserved user declarations.

The probe injected a **synthetic checker**: nine invocations, zero real provider
requests, email or production writes. Two newly generated `example.test`
accounts were retired; exact fixture cleanup confirmed zero remaining accounts
and report/check records. This is actual PostgreSQL evidence, not actual registry
availability or browser evidence.

## Local verification

`npm run check:ci` completed successfully: 2,016 tests, 2,008 passed, zero
failed, eight explicitly opt-in database tests skipped. Lint, application and
Vercel TypeScript, 101 English-source dictionaries with no key/placeholder
mismatch, UI contracts, Node syntax, SEO policy and Neon boundary checks passed.
The Vercel build and 80 credential-free local HTTP checks passed. Local health
503/not_configured is intentional in that isolated server without database
credentials, not evidence of database connectivity.

A separate review personally reran 84 focused fixture/client/UI/real-SDK tests,
all passing; it did not claim live provider, database or browser execution. Its
confirmed fixes covered self-reported-index wording, version-history semantics,
pending status recovery and ambiguous-commit cleanup in test probes. Root
performed the actual preview PostgreSQL probe described above.

## Actual deployed evidence

Application commit `e07246bcad370c6942662c459082fcd2ee18397b` was pushed to
`codex/launch-hardening` in `wolfoftyreso-debug/sajda`; no main merge or
production promotion was performed. Vercel's Git preview is **READY**:
[sajda-ofqsvquag-hypbit.vercel.app](https://sajda-ofqsvquag-hypbit.vercel.app),
deployment `dpl_3c5Vnj2MfVVWa3EtutG2rzdEEcAx`, target preview, correct
Hypbit/Sajda linkage and exact commit confirmed in deployment metadata.

[GitHub Verify #102](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37638803047)
and job `112851971435` completed **success** on that exact commit. Downloaded
job logs confirm 2,016 tests / 2,008 passed / eight opt-in skips / zero failures,
101 dictionaries and 80 credential-free HTTP checks. The advisory step confirms
zero known production-dependency findings, not zero findings in all tooling.

`check-runtime.mjs` then passed **80 actual protected-preview HTTP checks**
through the authorized Vercel CLI, with required report/check flags asserted;
health was 200/connected. Private route auth, unknown routes, headers, OpenAPI
components and unchanged six-tool public MCP discovery were included. These
HTTP checks are not themselves browser or paid-flow verification.

`probe-brand-checks-deployed-preview.ts` passed **16 REST and 11 real MCP SDK
requests**, discovering 27 private tools. Two explicit checks produced two
registered `.com` observations and two undated unsupported `.co.uk` unknowns.
Typed history agreed with PostgreSQL. Original dates, late identical retry after
report v2, foreign-account 404, both required scopes, rejected caller evidence
and session-only browser boundary passed. Two new synthetic accounts/four
temporary keys were retired, with exact account/data/quota cleanup verified zero.
No mail, payment, ownership claim, monitoring or production write occurred.

The preview-only PostgreSQL probe was repeated on the committed implementation:
nine synthetic-checker invocations, zero providers, two accounts retired and
all fixture/scoped-rate rows zero. Both runs used newly allocated accounts.

## Actual authenticated browser evidence

`check-brand-checks-browser-preview.mjs` used installed headless Microsoft Edge
154.0.4258.62 with Playwright 1.62.1. It sent the unchanged genuine server
responses through an origin-only protection proxy with redirects disabled;
there were no synthetic application responses or invented session cookies.

The final pass verified real email/password UI sign-in, an actual stored auth
session, report creation with an original user declaration, one saved registry
check, real registered `.com` evidence and explicit unsupported `.co.uk` unknown,
reload/reopen without new check or save POST, original declaration/provider
dates, null verified score, typed history and SQL/UI receipt agreement.

At **320, 390, 768 and 1,440 × 900 CSS px**, document width equalled viewport
width and zero inspected controls/headings were clipped. Real Tab/Shift+Tab,
visible keyboard focus and Enter status refresh passed. Final browser runtime
exceptions, transport failures and blocked external requests were zero. The
disposable account, credential/session rows, report/check rows and scoped rate
counters were all removed and verified zero; shared IP auth quotas were untouched.
Screenshots and result JSON stay in ignored `.vercel/brand-checks-browser/`,
not public product assets or committed credential-bearing traces.

Earlier attempts are not hidden: the first stopped at the initial health guard
before any fixture write. A subsequent read returned 200. A bounded 15-minute
Vercel log query found one `/api/health` 503 `database_unavailable`, request
`req_1chn4P6PvY9_oYth`; correlation to the first browser attempt and exact root
cause were **not established**. The next browser pass completed the actual
account/core journey but exposed a test false positive: programmatic focus after
mouse input need not receive `:focus-visible`. The probe was corrected to use
real keyboard movement, then the full pass succeeded. Both fixture-bearing
attempts confirmed cleanup. No application timeout or security rule was weakened.

The native product bundle also built successfully with this HTTPS preview as
its API origin and passed public-bundle/no-web-SEO policy. This is not a new
Xcode, signed iPhone, Safari, VoiceOver, TestFlight or StoreKit test.

## Dependency disclosure

Fresh `npm audit --omit=dev` reports zero findings. Full audit reports five high
development-tooling findings cascading from `braces` through Tailwind 3's glob
stack. npm's current braces version is 3.0.3; the
[reviewed primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched version. No forced major Tailwind migration or private vendored
security patch was represented as a verified repair in this increment. Tooling
remediation remains tracked separately from production-package reachability.

## Remaining release boundaries

Production rollout remains disabled. Continuous monitoring, archive/delete UX,
social/company/trademark checks, complete identity ownership, account email
delivery, all social OAuth providers, paid sandbox lifecycle and signed Apple
release gates remain separate work. This increment does not remove the existing
commercial-production NO-GO.

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

## Deployed verification still in progress

Protected deployed HTTP/REST/MCP probes and authenticated browser tests are
being completed. No final preview, SHA, provider success or browser
result is claimed in this interim record. Replace this section with observed
results before calling this increment deployed/verified.

## Remaining release boundaries

Production rollout remains disabled. Continuous monitoring, archive/delete UX,
social/company/trademark checks, complete identity ownership, account email
delivery, all social OAuth providers, paid sandbox lifecycle and signed Apple
release gates remain separate work. This increment does not remove the existing
commercial-production NO-GO.

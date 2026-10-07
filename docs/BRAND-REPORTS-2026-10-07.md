# Account-owned brand reports — 7 October 2026

## Scope and trust boundary

This increment stores selected brand scope and recorded **user declarations**
in the authenticated account. It does not implement global brand ownership,
legal clearance, independent evidence archival or continuous monitoring.

- The website can save, reopen, inspect versions and edit a historical version
  as an explicit new report. Guests retain the local worksheet and export.
- Every save has a stable UUID `requestKey` and optimistic `expectedVersion`.
  Identical retries return the original immutable receipt, even after a newer
  version exists. Altered payloads with the same key and stale updates fail.
- Original `reported_at` and `source_url` remain unchanged. `savedAt` is a
  storage timestamp, not a verification date. Reads evaluate freshness now
  using the current index methodology; they do not manufacture fresh evidence.
- Stored classifications remain `SELF_ASSESSMENT` / `USER_SUPPLIED` and
  `verified_score` remains null. Historical versions preserve declarations,
  not an immutable historical numeric score calculated by an older algorithm.
- Browser-only registry checks are not accepted as independently verified
  account evidence. They remain session-only and this limit is shown explicitly.
- Unrecorded target fields cannot be silently discarded by a save or copy.
  An uncertain save freezes edits and retains its exact request for retry.

## Shared account interfaces

REST: `/api/v1/account?resource=brand-reports`.
Private browser backend: `/api/account/brand-reports`.
Private MCP 1.8.0: `brand_reports_list`, `brand_reports_get`,
`brand_reports_history`, `brand_reports_save`.
Static `/api/v1/capabilities` also maps all four to private REST routes,
shared input schemas and explicit verified-account/feature conditions.

Read operations require `projects:read`; save requires `projects:write`.
The native account envelope uses its existing `saved:read` / `saved:write`
permissions and the same private product handler. Public MCP remains six
read-only tools and cannot access saved account reports.

Limits: 50 reports per account/environment, 100 versions per report, 60
requests/minute at the report boundary, 64 KiB REST save envelope. MCP still
limits the entire JSON-RPC message to 16 KiB. Limits produce explicit errors;
there is no silent truncation. Archive/delete/retention UX is not implemented.

## Data and rollout

Migration `0022_brand_reports.sql` is additive. Header, immutable declaration
versions and immutable request receipts use account/environment composite
keys. Foreign keys cascade with existing account deletion. Database triggers
reject historical UPDATEs. Application queries independently enforce owner,
verified email and environment. RLS is not claimed as a standalone tenant policy.

The feature is server-gated by `SAJDA_BRAND_REPORTS_ENABLED=true`.
It was enabled **only in Vercel Preview**. A fresh preview export was checked
against production; their database endpoints differ. Migration 0022 was
applied only to preview: 23 applied, none pending. Production was read-only
checked: 22 applied, 0022 pending, feature not enabled. Production rollout
must apply the reviewed migration before enabling the feature; do not promote
a preview assuming its database/configuration accompanies the deployment.

## Actual PostgreSQL evidence

`scripts/probe-brand-reports-preview.ts` was run against the pinned, separately
checked Neon preview, with two newly generated synthetic accounts. It verified:

- real concurrent updates: exactly one succeeds, the other gets conflict;
- identical concurrent retries: exactly one immutable version;
- old-key replay returns version 1 while latest remains the newer version;
- changed-key payload rejection, owner and environment isolation;
- original timestamps/source URLs preserved after 31-day simulated aging;
- stale self-reports no longer produce a current reported score;
- database rejection of UPDATEs to history and request receipts;
- unverified owner rejection, unknown observations remaining unknown;
- exact fixture cleanup: zero remaining users, reports, versions or receipts.

No real accounts, provider calls, email, payment or production data were
mutated. This probe does not prove a browser login, email delivery, a signed
iPhone app or live payment journey.

## Review

A separate agent pass found and rechecked six semantic/retry defects, all
repaired: late receipts downgrading a latest summary; copy losing unrecorded
fields; UI updates renaming custom API titles; successful POST followed by
session rejection losing its request key; exports incorrectly claiming no
account save; leave warnings incorrectly saying saved versions disappear.

The full-project release verdict remains **NO-GO for commercial launch and
App Store** while the separately documented auth, email, commerce, final
origin/legal and Apple gates remain open. This is a development increment,
not a claim that the entire brand platform is finished.

The final read-only agent pass separately ran 38 focused offline tests and
eight native-envelope boundary checks. Health requires the three new tables
only when the exact report flag is enabled. Account deletion includes the
new report-rate hashes and cascading declaration versions/request receipts.
No private report bodies or source URLs are included in diagnostics.

The built website was exercised as a guest with synthetic brand input:
scope creation, recording a declaration and cancelling guarded navigation.
The declaration remained intact; independent ownership stayed unverified.
Browser viewport checks at 320, 390, 768 and 1440 CSS pixels found no horizontal
overflow in this report view. This is browser emulation, not physical iPhone,
VoiceOver or an authenticated browser persistence test. Guest guidance now
keeps the sign-in action visible and moves detailed limits into disclosures.

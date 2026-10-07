# Account-owned brand reports — 7 October 2026

## Scope and trust boundary

This record describes the earlier 1.8.0 report-storage increment and its dated
tests. A subsequent 1.9.0 increment adds **separate server registry history**;
see [its source-check release record](BRAND-CHECKS-2026-10-07.md). The earlier
session-only limitation below applies to browser-supplied checks, which are
still never imported into a saved self-assessment as verified evidence.

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

## Deployed verification and source-control evidence

The verified application revision is `fefadcc2db37c5b88c422d181b3caaafb444d036`
on `codex/launch-hardening`, pushed to `wolfoftyreso-debug/sajda`.
The preview is `https://sajda-2d3ksl0fe-hypbit.vercel.app`, deployment
`dpl_1RaF1tahvgZAtNsaaDBfWUfrbxm4`, observed READY. It remains a protected
preview; deployment protection was not disabled to run the tests.

[GitHub Verify #99](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37626660495)
passed for that revision: 1,982 tests, 1,974 passes, zero failures and eight
explicit opt-in database tests skipped. The language contract covered 100
English-source dictionaries with zero key/placeholder mismatches. The build,
76 credential-free HTTP checks and production-dependency audit also passed;
the audit reported zero vulnerabilities. The full local `check:ci` subsequently
passed as well. The isolated local database health is intentionally 503
(`not_configured`), not evidence of deployed database connectivity.

The opt-in `probe-brand-reports-deployed-preview.ts` then completed against
that actual preview using two newly generated synthetic verified accounts:
11 REST calls and 14 MCP calls, including real SDK initialization/discovery
of 25 private tools and all four report tools. It verified create/list/read,
historical reads, history, newer saves, immutable late retry, foreign-owner
isolation, denial of a write through a read-only key, and agreement with the
stored version-3 declaration. A bearer key did not bypass browser-session
authentication. Exact cleanup was verified: zero remaining fixture records.
There were no provider calls, email calls or production writes.

The first attempt stopped at the read-only preflight before creating fixtures:
Vercel CLI 62.5 rejected `--non-interactive` for `curl`. Removing that unsupported
flag allowed the protected health request and the full probe to complete.
This was a test-harness failure, not a successful product transaction.

The deployed guest view at 390 CSS pixels was also exercised, including
scope creation and cancelling navigation without losing the input. Neither
this browser check nor the key-authenticated probe verifies an actual browser
login or authenticated browser save. A bounded read of preview error logs
(`--since 15m --level error --limit 20`) returned no entries; this is not a
guarantee that all runtime paths are error-free.

The separate protected-preview HTTP smoke also completed: 76 checks passed,
database health was 200 (`connected`), and the new private report routes
required authentication. This verifies HTTP/HTML/API contracts and database
readiness; it does not substitute for authenticated browser, email or payment
journeys.

### Native transport follow-up

A final read-only boundary probe found a real cross-client discrepancy: a
strictly valid 65,536-byte REST report becomes 65,648 bytes when wrapped in
the native account envelope. The server accepted it, but the Swift bridge's
generic 65,536-byte cap rejected it before transport. The fixture deliberately
uses a long valid fractional-second timestamp; it is a boundary case, not a
claim about typical report size or independently verified information.

The Swift source now allows up to 67,584 bytes only for outer canonical
`POST /api/native/account` without a query and an inner exact
`POST /api/account/brand-reports`. All other Swift requests retain the old
65,536-byte cap; server route limits, payload validation and authorization
remain unchanged. This follow-up does not change the deployed web/backend
application revision cited above.

The native product bundle was rebuilt against the verified preview origin:
the build and public-bundle/no-website-SEO checks passed. This only bundles
the product's web assets; it neither compiles this Swift change nor proves
physical iPhone behavior, signing, TestFlight or StoreKit transactions.

The follow-up ran 26 focused native Swift-source, native HTTP and report
boundary tests with zero failures/skips, plus targeted ESLint and whitespace
checks. The new regression validates and reparses a real maximum-size report,
checks unchanged declaration time/null verified score, and runs the actual
server envelope parser; its Swift assertions inspect source only.

### Full CI and actual iOS compilation after the follow-up

Application revision `0db4e0bab9c8235fdbafae89f513ebaea96a6fea` was pushed
on the same development branch, without merging `main` or changing production.
[GitHub Verify #100](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37630037536)
passed: 1,983 tests, 1,975 passes, zero failures and eight explicit opt-in
database tests skipped; 100 language dictionaries with zero mismatches;
Vercel build and 76 isolated HTTP checks passed; production-dependency audit
reported zero vulnerabilities.

The existing [iPhone build #32](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37630268579)
was explicitly dispatched on that exact branch/revision. It completed
successfully: actual Xcode Debug and Release simulator builds, packaging,
fresh simulator boot, installation, launch, WebKit search-screen readiness
and screenshot capture. The readiness event had `documentState: complete`,
`errors: []`, heading/input present, five navigation items and `ready: true`.
Every bounded simulator step returned status 0, including cleanup of only
the freshly created job-owned device.

This is an actual iPhone 17 Pro simulator on iOS 26.5, not a physical device.
The workflow uses the protected test backend origin. It does not authenticate,
execute searches, start Trading, bypass Vercel protection or verify native
account/network/payment journeys. No distribution signing, TestFlight or
StoreKit transaction was performed.

The non-expired `sajda-ios-simulator` artifact was uploaded (ID 11487440121,
3,339,869 bytes, SHA-256
`eedf7b324d82865ac4691a54726fef9fda18fe9a42f6e96855af5225ca5808db`,
retained until 14 October 2026). GitHub reported a non-blocking pinned-checkout
Node 20 deprecation warning (runner forces Node 24) and a macOS capacity
notice; neither was silently treated as an application failure or removed.

The report feature remains preview-only and the full-product commercial/App
Store NO-GO gates remain open. Passing this increment's CI and simulator
smoke is not full launch approval.

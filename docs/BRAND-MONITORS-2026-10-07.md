# Daily brand registry monitoring — 7 October 2026

## Implemented scope

Account-owned, version-pinned domain registry monitoring for saved brand
reports. First definitive observations form a baseline, not an alert. A change
requires a newer definitive observation compared with the retained earlier
baseline for the same target and audited RDAP source. Unknown, failed, stale or repeated samples cannot become
an availability claim or change alert. Original source dates are retained.

This is **not** domain ownership verification, perpetual whole-brand monitoring,
social/company/trademark surveillance, price monitoring, investment advice or
legal clearance. Saved user declarations and index scores are not upgraded by
these checks. Notifications are private **in-account only**; no email is sent.
Supported source coverage remains nine reviewed single-label RDAP extensions.
Unsupported suffixes such as `.co.uk` stay unknown without an unsupported fetch.

## Consent, recovery and capacity

Enable/resume/rebind use live paid membership; REST/MCP bearer keys additionally
need the separate domain-search scope. Free/Basic/Premium/Trading permit 0/1/5/10 active monitors. Scope
changes pause the old monitor; explicitly accepting the latest saved scope
starts a new comparison baseline. Pause and reading/acknowledging old alerts
remain available after downgrade. Pause also works with unsaved or historical
UI state and at the configuration/action-history safety ceiling.

Normal cadence is 24 hours after an actual attempt, not after refresh. The
five-minute worker processes at most two due reports, with durable namespace
and report leases, short account transactions and no provider work inside a
database lock. Late results cannot create alerts after pause, scope change,
account removal or membership revocation. Exact UUID command receipts make
uncertain writes retryable without new provider work.

The shared limits are 20 domains/attempt, 10 new attempts/account/environment
per UTC day and 100 retained attempts/report across versions. At full report
history monitoring pauses explicitly; records are not silently deleted.
Daily quota exhaustion defers to the next UTC day. This bounded worker has
no realtime/delivery SLA; its current theoretical admission ceiling is 576
attempts/day before latency, contention or failures. Retention and larger
worker/provider budgets remain separate product decisions before scaling.

Web, private REST, native account adapter and MCP share the same handler and
owner/environment boundaries. Private MCP is 1.10.0 with 31 tools; the four
new tools cover reads, configuration, pause and alert acknowledgment. Public
MCP remains six tools with no private account access. The shared configure
schema is checked with the actual MCP SDK's JSON-schema validator.

## Preview deployment and production boundary

Application commit `76a7a5b0ce2f7c17c4a65aa8bd4a6f9bcc609550` was pushed to
`codex/launch-hardening` in `wolfoftyreso-debug/sajda`. No main merge or
production promotion was performed. The protected deployment is **READY**:
[sajda-l0cxghzje-hypbit.vercel.app](https://sajda-l0cxghzje-hypbit.vercel.app),
`dpl_2YE6gB4HADG1SSfFH9P5jJoGRVxF`. Official Vercel inspection confirms
Hypbit/Sajda linkage, Preview and the exact provider-recorded Git commit.

Fresh ignored exports identify distinct preview and production Neon databases.
Additive migration `0024_brand_monitors.sql` was applied only to preview:
25 migrations applied, none pending. Production still has 22 applied migrations;
reports/checks/monitors migrations and monitoring flags remain unactivated there.
A new sensitive Preview-only cron secret is retained in Vercel, never committed,
printed or saved locally. Metadata-only ID/time pinning permits recovery of this
run's newly created Preview variable without overwriting any unknown or
production secret. The one-off deployment harness is ignored, not a public
operator setup script. Vercel does not automatically schedule previews:
`cronScheduled=false` is deliberately returned even after an authorized test tick.

## Completed local and PostgreSQL verification

`npm run check:ci` passed: 2,046 tests, 2,038 passed, eight opt-in database
tests skipped, zero failures. Lint, application/Vercel TypeScript, 102
English-source dictionaries with no key/placeholder mismatch, UI contracts,
Node syntax, SEO policy, Neon boundaries, Vercel build and 85 credential-free
local HTTP checks passed. Local database 503/not_configured is intentional:
that test has no database credentials and does not prove account persistence.

[GitHub Verify #104](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37649521283)
and job `112888883869` succeeded on the exact application commit. Downloaded
logs independently confirm those test/language/HTTP counts and zero reported
**production-dependency** advisories. Known development-tooling advisories from
the earlier release review are not thereby fixed or hidden.

`probe-brand-monitors-preview.ts` passed against actual isolated Neon PostgreSQL:
owner/environment isolation, atomic receipts/CAS, global admission, provider
outside transactions, baseline/unknown/new-date rules, exact cached samples,
pause/resume cadence, in-flight pause and revocation, expired overlapping leases,
terminal receipt recovery, late-finalizer fencing, eligible-monitor downgrade
selection, explicit history pause, UTC-day deferral and stop at version/10,000
receipt ceilings. It used seven **synthetic checker** invocations, not real
provider/email calls. Two new `example.test` accounts and all owned fixtures
were removed, with zero remaining confirmed. Separate read-only review passed
43 focused tests and 25 after the last safety-stop fix; these are not independent
physical-device or live-provider tests.

The native product bundle builds against the new HTTPS origin and passes the
no-secret/no-website-SEO policy. This does not compile/sign iOS, test StoreKit,
perform TestFlight, prove physical iPhone behavior or authorize production use.

## Deployed and rendered verification

`probe-brand-monitors-deployed-preview.ts` passed against that protected
deployment through authorized Vercel transport: 13 REST requests, 14 MCP
requests using the real Streamable HTTP client and four cron HTTP requests,
including two authorized worker ticks, an unauthenticated rejection and a
forged-query rejection. All 31 private tools were discovered. First actual
worker coverage was two targets: one checked registry source and one unknown
unsupported suffix, no alert. The second explicitly rebound scope completed
with one unknown target, zero baseline and no false unchanged/available claim.

Real runtime proofs include foreign-account rejection, live Premium-to-Free
downgrade, no-domain-scope configure rejection, pause/ack without domain-search
scope, retained original-version history, exact retry receipt and resume cadence.
One deliberately **synthetic alert** tested acknowledgment after downgrade;
no real-world registration change was asserted. Two disposable accounts,
three scoped API keys, their reports/checks/monitors/alerts/receipts, commerce
fixtures, exact quotas/rate hashes and worker leases were verified cleaned to
zero. No emails, payments or production writes were performed.

The strict deployed HTTP smoke completed on 8 October: 85 HTTP/HTML/API
assertions passed over 83 actual requests, with all four report/check/monitor/
database readiness requirements enabled. Database health was 200 (`connected`).
The unchanged runtime assertions used a fresh same-project development OIDC
token scoped only to this preview origin, rejecting redirects. They did not
send account cookies or bearer credentials. Deliberately invalid/unauthorized
POSTs were rejected; no product mutations, provider checks, emails, payments or
production writes were accepted. This is not rendered browser proof.

The authenticated Edge browser probe also completed on 8 October against the
same application commit, using an isolated disposable account. Actual
email/password login, two UI report saves, one real registry check, monitoring
enable/pause/resume, a new scope's explicit rebind and alert acknowledgment
passed. The alert was deliberately synthetic; no real registration change was
claimed. Original declaration/provider dates, persisted receipts and rendered
account state agreed with PostgreSQL after reopening and reload. Reload did
not start a new provider check. Preview explicitly showed its scheduler off.

The monitoring view had no horizontal overflow or clipped controls at 320,
390, 768 and 1,440 CSS pixels. Visible keyboard focus and Enter-triggered
refresh passed at all four widths. This is headless Edge browser emulation,
not a physical iPhone, Safari, VoiceOver or a signed native build. The cropped
390-pixel screenshot was visually inspected; it is retained only in the
ignored `.vercel/brand-monitors-browser` test-output directory.

The initial keyboard-response timeout was disproved as a button defect:
trusted Enter/click events worked, but the accelerated probe made 61 session
reads in 12 seconds and reached the existing 60/minute session limit. The
interface displayed the rate-limit explanation. The repaired harness respects
the real `Retry-After: 48`, verifies no mutation during the wait and performs
one explicit keyboard read retry. That succeeded. No auth limit was weakened,
no shared IP bucket was deleted and no automatic mutation was replayed. The
completed run had 69 session reads: 68 HTTP 200 and one expected HTTP 429.
Reducing redundant session reads without weakening account-switch protection
is a future efficiency task, not something this test silently fixed.

The final browser process exited zero with zero runtime exceptions or
transport failures. Its subsequent exact cleanup verified zero remaining
synthetic users, sessions, grants, reports, checks, monitors, alerts, receipts
and account-scoped rate rows. The `result.json` is written before cleanup;
only exit zero together with the cleanup receipt establishes a full pass.
There were no emails, payments or production writes.

After the tests, official bounded Preview log queries at 11:31 UTC on
8 October returned zero HTTP 5xx records and zero error-level records, each
for the last hour with a 50-record cap. This limited observation is not proof
that every route is error-free or an ongoing monitoring service.

A separate final read-only source pass found no new scoped P0/P1. It identified
and corrected four missing monitoring entries in the detailed MCP scope table.
This is not an independent physical-device or whole-product release approval.

## Remaining whole-release gates

Verified transactional sender/DNS and real inbox delivery; provider OAuth
configuration; complete Stripe sandbox lifecycle; final canonical domains and
callbacks; operator/legal/vendor-retention approvals; Apple account, signing,
TestFlight and actual App Store products; deployed production golden paths.
Neither this preview nor the shared index constitutes clearance of these gates.

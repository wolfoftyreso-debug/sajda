# Release hardening — 7 October 2026

Commercial release verdict: **NO-GO until the external gates close**. Local
verification, real PostgreSQL checks and deployment evidence are distinct.

## Changes

- The developer public console owns a 35-second deadline, prevents rapid
  duplicate requests, aborts its browser request on navigation and supports an
  explicit retry after timeout or a non-JSON upstream failure. All five locales
  have user-safe failure text. This does not prove cancellation of provider work
  already running on the server.
- Daily Trading scheduling excludes older queued/running work before its
  bounded owner selection, deduplicates access grants and propagates unexpected
  storage failures. Only expected eligibility/quota deferrals count as skipped.
- Release evidence cannot claim observations later than its own recorded time.
- MCP SDK is pinned to 1.32.1. The installed version was covered by
  [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h).
  That advisory concerns the affected OAuth client flow; this pass did not
  establish an exploitable Sajda server flow.
- Build-only `source-map-js` was patched to 1.2.2 and
  `postcss-selector-parser` explicitly overridden to 7.1.6. Tailwind 3 remains.
  Native generated CSS is byte-identical before/after the parser change.
- Operator documentation now distinguishes standard-TLD prices, exact-domain
  offers and authenticated Trading checks. Historical database and deployment
  observations are no longer presented as the current schema state.

## Actually verified

- `npm run check:ci`: **1,853 tests; 1,845 passed, zero failed, eight opt-in
  PostgreSQL tests skipped**. Lint, types, 94 English-source language catalogues,
  SEO/Neon policies, the Vercel build and **71 local HTTP smoke checks** passed.
  The final run used filesystem permission required by esbuild on Windows;
  the earlier sandboxed ancestor-directory read failure was reproduced and
  resolved by the permitted run, not suppressed in the test.
- Three separately opted-in PostgreSQL suites passed on the isolated Preview
  database: account membership, account deletion and native commerce. Synthetic
  fixtures rolled back; no real email, Stripe or Apple provider call occurred.
- Read-only Preview and Production migration checks each returned **22 applied,
  zero pending**, with source checksums verified. No schema changes were made.
- Native bundle build passed using the documented HTTPS API origin as a
  process-only setting. No SEO/service worker entered the native bundle.
  Xcode, signing, TestFlight and physical iPhone operation were not verified.
- Current network-backed `npm audit --omit=dev --json`: **zero known production
  dependency advisories**. This is not a security certification.

## Remaining build dependency advisory

Full `npm audit --json` still reports five high entries from the same unpatched
`braces` chain through Tailwind's build-time glob/watcher dependencies.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched braces version; the official registry still supplies 3.0.3.
The installed chain is development-only, uses repository-controlled globs and
was not found imported by the request-serving product code. Do not accept
untrusted build patterns or treat this as zero full-audit findings. Revisit a
patched upstream release or a separately tested Tailwind migration; do not use
`npm audit fix --force` to silently replace the design/build system.

## Configuration is not external verification

Vercel CLI 62.5.0 confirmed the existing `hypbit/sajda` project and its Node 24,
Vite, `npm ci`, `build:vercel` and `dist-vercel` settings. Read-only environment
metadata showed no complete Google, X, GitHub or Apple credential pair. Stripe
settings were present only in Preview; Resend settings were present in both
scopes. Their values, provider acceptance and actual delivery/payment lifecycle
were not established by metadata. No credentials are included in this record.

Final domain/callback alignment, verified email delivery, OAuth applications,
real Stripe sandbox lifecycle, legal approval, deployed golden paths and Apple
enrollment/signing remain separate release gates. The native bundle and public
connector are not evidence that the commercial product is ready to launch.

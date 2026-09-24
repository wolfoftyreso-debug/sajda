# Engineering hygiene — 24 September 2026

## Changes

- The main verification workflow now builds the supported Vercel artifact,
  rather than `npm run build`'s separate static/local output. `check:ci` is the
  same command for developers and CI: source checks, tests, Vercel build, then
  credential-free HTTP smoke. Audit remains a separate blocking CI step.
- CI uses Node 24 and the declared npm 11.13.0, locked dependencies with
  lifecycle scripts disabled, read-only repository permissions, preview/noindex
  context and cancellation of superseded branch runs. It does not deploy.
- The default test suite has an explicit concurrency limit of two, reducing
  resource spikes from simultaneous TypeScript/Vite/artifact subprocesses.
- Fixed a stale runtime assertion that still expected two anonymous MCP tools;
  six are now required. Added Brand Index and name-package page HTTP checks.
- Added `check:runtime:local`: an ephemeral loopback server using actual Vercel
  handlers, with an allowlisted OS environment instead of inherited production,
  account or provider credentials. Startup and smoke are bounded; cleanup runs
  on success and failure.
- Replaced stale README statements about managed Neon Auth and unimplemented
  account APIs with the current architecture. Added a developer source map,
  review agreement and explicit release gates in [the handoff](DEVELOPER-HANDOFF.md).

## Observed verification

- Three focused tooling regressions passed: CI command alignment, credential and
  preload/proxy isolation, and the six-tool runtime inventory.
- `npm run build:vercel` exited 0, generated 22 curated SEO entries and passed
  the generated HTML/crawl policy and browser-secret/provider-boundary checks.
- `npm run check:runtime:local` passed **71 HTTP checks** against actual local
  handlers. Database health was **503 / not_configured**, as intended in this
  credential-free check; no database, email or payment success is inferred.
- A smoke invocation made before the build's SEO generation completed failed
  correctly on `/se` with 404. The runner exited nonzero and its server process
  was confirmed absent afterward. The rerun after the completed build passed.
  The normal CI command sequences these stages with `&&` to avoid that race.
- The entry points, UI source and shipped asset source were searched for
  generator branding. No third-party generator watermark was found. Required
  third-party licences and truthful Sajda-generated export disclosures remain.

These are local observations. The updated GitHub workflow has not been reported
as a completed remote run here, and this pass does not approve production launch.

## Explicit remaining boundaries

Application TypeScript now enables `strict` and `noImplicitAny` after fixing the
15 measured errors with explicit session expiry guards, narrowed provider URLs,
typed portfolio batches, safe language fallback and fail-closed legacy handling.
No broad assertions or new lint/type suppressions were added. The standard
typecheck and a regression test guard the settings. Current lint has no warnings;
documented Fast Refresh exceptions and archival local/Supabase references remain.
No unreviewed code deletion or mass formatting changes were used. Native signing, external
provider delivery, commerce and production environment gates require their own
evidence. See [release evidence](CONNECTOR-RELEASE-2026-09-24.md).

The strict-mode follow-up compiled with no TypeScript diagnostics and passed
40 focused tests across tooling, social observations, project clients/UI,
scenario clients and registrar pricing. One additional test confirmed that the
historical registrar/portfolio adapters reject instead of making provider calls
or inventing valuations. Focused ESLint passed with zero warnings. The standard
lint script now uses `--max-warnings=0`, so future warnings fail the gate rather
than remaining easy to overlook. A final complete release check is still
required after concurrent product changes.

## Dependency and workflow maintenance

Actions were pinned to full commit IDs resolved with `git ls-remote --tags`
against their official GitHub repositories on this date: checkout v4.4.0,
setup-node v4.4.0 and upload-artifact v4.6.2. Both workflows retain version
comments for review. A bounded weekly Dependabot configuration proposes action
updates (at most two open version PRs) and npm direct-dependency patch/minor
updates (at most three). No automatic merge or current dependency mass update
was performed. Configuration was checked against the
[official Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

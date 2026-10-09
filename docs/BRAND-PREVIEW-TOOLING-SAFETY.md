# Brand Preview verification safety

The report, registry-check and monitor services were inspected separately from
their test runners. This increment fixes verified runner hazards; it does not
claim a newly executed deployed brand journey or automatic monitoring delivery.

## Report runner

`scripts/probe-brand-reports-deployed-preview.ts` now requires the exact ignored
exports `.vercel/.env.brand-reports.preview.local` and
`.vercel/.env.brand-reports.production.local`, plus the reviewed non-secret
`.vercel/migration-target.preview.json` and
`.vercel/migration-target.production.json` manifests. The pure guard pins the
Sajda project/team, actual Preview and Production Neon identities, database,
role, environment markers and matching pooled/direct credentials. It rejects
swapped targets and manifest drift, and rechecks that binding before allocation
and cleanup. Production credentials are inspected locally, never connected.

Two unique id/email pairs are declared before setup. Each attempted allocation
is recorded before its INSERT, so a committed INSERT with a lost acknowledgment
is still reconciled. Cleanup first validates every exact id/email binding,
rejects collisions before any deletion, then deletes only those pairs. It can
reconcile a lost DELETE acknowledgment and retry that exact operation once.
Positive final account, owner-record and account-quota reads are required before
the runner publishes its story-success receipt. Credentials and fixture data
remain in memory; protected HTTP headers/bodies use CLI stdin, not arguments.

Before any future run, independently confirm the immutable deployment's exact
project, team, Preview target and release SHA, pull fresh official environment
exports, review the runner and explicitly authorize its bounded fixture scope.
The pure guard cannot establish that an export is fresh or prove a deployment's
commit. No new fixture run was performed for this increment.

## Historical monitor cron runner

`scripts/probe-brand-monitors-deployed-preview.ts` is retired and fails closed
without loading environment files, creating accounts, connecting a database or
making a network call. Its former count-zero preflight did not fence the global
Preview worker: another owner's monitor could become due between preflight and
claim. Do not revive this runner by merely restoring that check or supplying a
cron secret. A genuine fixture-scoped scheduler boundary is required first.

Historical receipts in `BRAND-MONITORS-2026-10-07.md` describe their original
run, not authorization to repeat the retired script. The older local
`probe-brand-monitors-preview.ts` also acquires a global namespace worker lease;
although it refuses a foreign due row before account work, it is not an isolated
fixture scheduler and must not be run against shared Preview without a new
reviewed boundary. Existing browser/check runners likewise need fresh target
and lifetime review before reuse.

## Local evidence

`tests/brand-preview-tooling.test.ts` first reproduced both report setup and
global-cron hazards as failing source-contract tests. After the changes all
eight tests passed, including in-memory lost-allocation and lost-deletion
acknowledgments, exact cleanup collisions, bounded retries, no-effect deletion
failure, invalid fixture plans and sixteen target-refusal cases. These are
local regression tests, not proof of provider behavior, real email delivery,
cron scheduling, browser interaction or production readiness.

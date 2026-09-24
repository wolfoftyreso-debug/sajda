# Developer handoff

This document maps maintained source and repeatable checks. Dated release
reports are evidence snapshots, not continuing guarantees or certifications.

## Code map

| Area | Maintained source | Important boundary |
| --- | --- | --- |
| Website | `src/`, `vite.config.ts`, `public-clean/` | Same-origin API; five-language copy; no provider keys |
| Product routes | `src/app/ProductRoutes.tsx`, `vercel.json` | Web/native route policy and real 404 behavior |
| Native shell | `ios/`, `native.html`, `vite.native.config.ts` | Separate build, navigation and payment rules |
| Functions | `api/`, `middleware.ts` | Request validation, auth, entitlements and safe errors |
| Shared product model | `shared/` | Scoring, state, connector catalogue and public contracts |
| Data | `db/migrations/`, `api/_shared/` | Explicit migration order and isolated account ownership |
| Verification | `tests/`, `scripts/check-*.mjs` | Local contracts do not replace provider/deployment tests |
| Public connector | `scripts/build-public-connector.mjs`, `integrations/sajda-connector/` | Allowlisted artifact; no private account handlers |

## Working agreement

1. Install from the npm lockfile with Node 24 / npm 11.13.0. Do not commit
   `node_modules`, generated builds, local credentials, API tokens, recordings
   containing account data, or deployment-protection share URLs.
2. Read the handler and shared contract before changing UI behavior. Update
   appropriate tests and language keys in the same change. New function routes
   must also be wired to `scripts/serve-vercel-local.ts`; the inventory test
   rejects missing/duplicate mappings.
3. Use the smallest effective change. Preserve required asset licences,
   provenance and generated-code notices required by third-party licences.
   Historical migration code is not an invitation to reconnect Supabase.
4. Run `npm run check:ci` and `npm audit --omit=dev`. The former builds
   `dist-vercel`, not the legacy/local output. If a focused test was used during
   development, the final full check still applies.
5. Record what was actually verified: source, local handlers, browser,
   preview, external sandbox or production. Never relabel an environment or
   skipped test as a successful end-to-end check.

## CI and local HTTP checks

`.github/workflows/ci.yml` uses read-only repository permissions and no deployment
credentials. It installs locked packages without lifecycle scripts, runs the
same `check:ci` command available locally, and audits production dependencies.
Superseded runs on the same branch are cancelled. There is no automatic
production promotion in this workflow.

Vercel is independently linked to this repository's `main` branch. Its
production-only **GitHub Verify** Deployment Check requires the GitHub job
named `verify` and blocks production aliasing until that check passes. Preserve
that exact job name or update the Vercel requirement in the same reviewed change.
Do not force-promote around failed checks. The check configuration was read back
on 24 September 2026; its actual aliasing lifecycle still awaits a production
build that passes the email/configuration gates. Native simulator jobs remain
separate because their path-filtered workflow does not run for every web change.

Action revisions are pinned to verified full commit IDs. Dependabot proposes
bounded weekly updates for GitHub Actions and npm direct dependencies; major
npm version updates are excluded from that routine. Update PRs still require
review and passing checks. There is no automatic merge. Lint warnings fail the
standard gate, rather than being silently accepted.

`check:runtime:local` starts the actual function handlers on loopback with an
allowlisted process environment. Production/database/provider credentials,
proxy settings and Node preload hooks are excluded. It tests route responses,
public MCP metadata and negative authentication/input contracts, not provider
lookups, paid transactions or successful account storage. It terminates its
child server after the smoke run, including failure paths.

To inspect a deployed build, use `check:runtime` with `SAJDA_TEST_ORIGIN` set to
the intended HTTPS origin. A protected preview can use the authenticated CLI
transport described in `scripts/runtime-http.mjs`; do not publish a bypass
credential. `SAJDA_REQUIRE_DATABASE=true` makes a non-ready health response fail,
but a healthy database still does not prove user-level persistence or isolation.

## Release gates beyond CI

- Confirm production canonical/auth origins, a working HTTPS hostname and the
  selected production Neon project. Preview accounts must not be copied into
  production as a shortcut.
- Apply reviewed migrations only to the intended environment; verify schema and
  account ownership. Database writes and migrations are not ordinary CI tests.
- Verify registration, verification, sign-in, recovery, sign-out, deletion and
  return visits using a controlled account. Actually inspect required email
  delivery; an accepted sending request is insufficient.
- Verify the complete commerce lifecycle in provider sandbox, including webhook
  replay, failed payment and entitlement transitions. Live charging remains an
  explicit release decision, not a successful-build side effect.
- Test critical desktop/mobile flows and authenticated API/MCP operations on the
  target deployment. Search evidence must retain freshness and uncertainty.
- Finish operational privacy/consumer disclosures, provider contracts and
  retention policy. A legal page in the bundle does not certify compliance.
- Review sanitized logs, release rollback and incident ownership. Re-run smoke
  after deployment; retain the deployment ID and check timestamps.

App Store release additionally requires Apple enrollment, signing, real-device
and StoreKit sandbox tests, privacy declarations and review. Unsigned simulator
CI is a separate engineering check.

## Known engineering boundaries

Application and server TypeScript now enable strict checking; the application
also explicitly enables `noImplicitAny`. CI tests guard these settings. The
frontend transition required 15 concrete narrowing/typing fixes, not blanket
assertions or suppressions. `skipLibCheck` remains explicit in existing TS
configs. Current lint completes without warnings. Existing documented Fast
Refresh exceptions and the inert historical query shim still need deliberate
review if their modules are changed; strict mode does not remove explicit any
from old compatibility code automatically.

The old Bun lockfile, local/self-host adapters and Supabase migration tree remain
for historical reference. npm + Vercel + Neon is authoritative. Remove archived
material only in a separate reviewed change after verifying every remaining
reference; do not delete it as cosmetic cleanup during release verification.

No generator watermark was found in the maintained entry points, UI source or
shipped asset source during the 24 September 2026 hygiene pass. Legitimate
connector names, Sajda-authored export disclosures and required logo licence
notices are not unwanted generator branding and are retained.

See [current release-hardening evidence](RELEASE-HARDENING-2026-09-24.md),
[connector release evidence](CONNECTOR-RELEASE-2026-09-24.md),
[account API](ACCOUNT-API.md), [architecture](NEON-VERCEL.md),
[privacy inventory](APP-PRIVACY-INVENTORY.md) and
[legal gates](LAUNCH-LEGAL-2026-09-17.md).

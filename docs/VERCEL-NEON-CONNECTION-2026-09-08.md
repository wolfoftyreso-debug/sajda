# Vercel + Neon connection verification — 2026-09-08

## Current scope

Sajda now has a real Vercel project and Neon Postgres provisioned through the
Vercel Marketplace, not Supabase. This follow-up supersedes the unconfigured
infrastructure observations in the earlier local release report.

- Vercel project: `hypbit/sajda`, `prj_UO900Jp4qJF1eS4hkOrebIzwMVlI`.
- Neon resource: `sajda-postgres`, `store_g5CGU6QObsXBKOKO`.
- Neon project: `spring-paper-89655503`; Free plan; Frankfurt (`fra1`).
- Connection targets: **Preview and Development only**. No Production DB env
  was connected and no working deployment was promoted to Production.
- Latest preview: https://sajda-lic1hnub2-hypbit.vercel.app
- Deployment: `dpl_G2w9wf6BpE9miZLLwv11yLF3Cyx9`; READY; functions in `fra1`.
- Existing team projects/databases were inspected for identity only, not changed.

## Database evidence — VERIFIED

- Runtime and direct migration connections point to the explicitly selected
  new Neon project. Migration URL is unpooled; credentials never printed.
- Initial database had no Sajda/public application tables.
- Applied `0000_neon_foundation.sql` and `0001_saved_domains.sql` with the
  transactional, checksummed migrator; subsequent check reports no pending work.
- `sajda.function_rate_limits`, `job_runs`, `saved_domains` and
  `schema_migrations` exist. Ledger count 2, other table counts 0 at verification.
- Saved-domain RLS is enabled with no browser policies. Current runtime role
  is table owner/BYPASSRLS; this privileged credential stays server-only. RLS
  therefore does not replace the owner-scoped API's authorization checks.
- The deployed `GET /api/health` reaches Postgres and returns HTTP 200,
  `ok: true`, `database: connected`, and a safe request ID.
- This is a connection/schema check, not proof of real authenticated persistence
  or isolated database branches for every CLI preview deployment.

## Deployment repairs

1. Anchored root-only upload exclusions as `/public` and `/supabase`.
   Unanchored patterns also removed `api/v1/public` and the inert historical
   compatibility module under `src/integrations`, breaking cloud builds.
2. Added explicit `.js` extensions to relative API TypeScript imports.
   A READY deployment still threw `ERR_MODULE_NOT_FOUND` in its function logs;
   deployed health passed after this repair. API type checking now uses NodeNext.
3. Moved OpenAPI data/declarations under `api/_shared` instead of deploying a
   non-handler as a thirteenth function. Twelve intended handlers remain.
4. Set root TypeScript target/lib for Vercel, which does not follow the project's
   frontend/node reference settings. Final build has no TypeScript errors.
5. Changed allowlisted SPA rewrites from `/index.html` to `/` with
   `cleanUrls: true`. Direct auth URLs previously returned 404. Unknown paths
   remain real 404s; there is no blanket SPA fallback.
6. Added regression checks for API helper placement and clean-URL routing,
   plus an authenticated CLI transport for protected-preview HTTP checks.

The rewrite behavior is documented in
[Vercel's Vite SPA guide](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas);
the Node runtime uses the
[root TypeScript configuration](https://vercel.com/docs/functions/runtimes/node-js#using-typescript-with-the-nodejs-runtime).

## Verification

- Local full `npm run check`: 55 tests, lint/type checks, 19 Node syntax files,
  source policies and five-language UI contracts pass after code repairs.
- Final cloud build: READY, 22 static noindex Swedish preview routes and
  Neon public-bundle policy pass. Upstream unused beta Auth UI dependency
  peer/deprecation warnings remain; npm audit reports zero vulnerabilities.
- Protected-preview HTTP suite: **48 checks passed** on the exact latest URL,
  with database health HTTP 200 / connected. Includes all allowlisted app/SEO
  pages, real 404s, security headers, protected API denial, OpenAPI, public
  preflight and invalid-input handling. Vercel's authorized CLI supplied
  deployment protection access; no bypass token was exported or logged.
- Deployed OpenAPI returns HTTP 200 / 3.1.0; anonymous saved-domain access returns
  401; Swedish static search route returns HTML 200.
- Real public API query for `example.com`: HTTP 200, taken, authoritative
  Verisign RDAP evidence. No current Loopia quote was verified in this run;
  the result correctly reports unavailable pricing, not an invented price.
- Browser: direct `/auth` loads, navigation returns to search, Enter submits
  the exact-domain check, and `example.com` renders Taken. No browser console
  errors observed in that search flow. This is not a successful login test.

## Remaining boundary — NO-GO for commercial launch

- Neon Auth JWKS returned 200 with EdDSA key data; frontend/backend Auth URL
  config matched. A harmless nonexistent-account sign-in was denied with
  **403 INVALID_ORIGIN**. It did not authenticate or create a user.
- Neon console SSO currently shows **Link Vercelmp** and requires confirmation
  of the email sent to the operator. No bypass of that confirmation was attempted.
- After confirmation: authorize the exact intended preview origin, confirm
  branch isolation, test two verified users, saved data, logout/return and reset
  delivery. Do not use a wildcard origin or weaken provider origin checks.
- Stripe, paid entitlements, durable one-free-search enforcement, remaining
  account workspace features and real transactional delivery are still unpassed
  launch gates detailed in the earlier release report.
- Vercel auto-classified the first new-project deployment as Production despite
  an explicit preview command, but that deployment failed to build. Subsequent
  successful deployments are previews. No production database was attached.

## Repeat safely

```powershell
$env:SAJDA_EXPECTED_NEON_PROJECT='spring-paper-89655503'
node --env-file=.env.neon-development.local scripts/check-neon-runtime.mjs
node --env-file=.env.neon-development.local scripts/migrate-neon.mjs --check

# Set this to the installed Vercel CLI entrypoint (no token in the command).
$env:SAJDA_VERCEL_CLI='<installed vercel/dist/index.js>'
$env:SAJDA_TEST_ORIGIN='https://sajda-lic1hnub2-hypbit.vercel.app'
node scripts/check-runtime.mjs
```

Local `.env*.local` files are ignored and excluded from deployment uploads.
Do not paste their contents into logs, chat, frontend code or source control.

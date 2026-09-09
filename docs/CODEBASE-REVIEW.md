# Codebase review — 2026-08-22

## What is actively maintained

Sajda has two deliberate product paths:

1. **Anonymous search** — the Vite client, `api/domain-search.ts`, and the
   loopback full-app server. This path has no account, history, or browser
   database writes.
2. **Private workspace** — the legacy Supabase client, Edge Functions, and
   worker for authenticated scans, saved domains, history, and watchlists.

They remain separate until the private workspace has passed its own migration
and security release gates. Removing it just because the public search exists
would silently remove working product capabilities.

## Completed cleanup

- Removed unused Vite starter CSS, unused service wrappers, and 26 unreachable
  UI primitives.
- Removed 24 unused direct dependencies and synchronized `package-lock.json`.
- Removed a passive React Query provider; the application did not use React
  Query hooks.
- Moved scan-mode data and advanced-brief text helpers out of UI components so
  the search contract is owned by `src/lib/`.
- Turned on TypeScript's unused-local and unused-parameter checks.
- Added `npm run check:node` and included it in `npm run check` so the local
  Node servers, worker, and Vercel build helper receive syntax checks.
- Fixed the Swipe renewal placeholder, anonymous price/multiple filtering, and
  the My Domains background valuation call. The latter now uses the
  authenticated valuation endpoint instead of a job-only endpoint.
- Repaired scan callback dependencies and subscription lifecycle ordering.

## Release gates still required

These items were deliberately not papered over in a cleanup pass:

1. **Registry-data approval:** bulk `.se` / `.nu` availability traffic needs an
   approved registry or registrar integration before public production use.
   Do not scale a WHOIS/DAS fallback as a search-engine backend without written
   approval and suitable quotas.
2. **Worker leases:** the private scan worker needs a durable lease,
   attempt counter, and stale-job recovery migration. A process restart can
   otherwise leave a scan in `running`.
3. **Private deployment hardening:** complete the existing migration/RLS/Edge
   Function hardening plan before exposing the self-hosted workspace. In
   particular, job-only functions must remain non-public and scan ownership
   must be checked server-side.
4. **Public bundle separation:** the public app still has legacy authenticated
   routes in its source tree. A future public/owner app-shell split will reduce
   bundle size and prevent legacy Supabase code from being emitted in the
   anonymous deployment.
5. **Contract tests before engine consolidation:** candidate generation exists
   in the Vercel API, local server, and legacy function path. Add shared
   API-contract tests before attempting to merge them; copying one engine over
   another now would risk changing availability semantics.

## Standard verification

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm audit --omit=dev
```

The Node syntax check is intentionally separate from TypeScript because the
local server and worker are `.mjs` files. Deno checks use the pinned Deno
runtime declared in `package.json`.

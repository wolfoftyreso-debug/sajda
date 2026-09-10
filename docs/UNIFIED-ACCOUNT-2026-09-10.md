# One Sajda account across plans

## Implemented

- A single Better Auth identity/session remains authoritative for search, saved domains, Swipe and Trading.
- GET /api/account/membership reads the verified owner and existing grants in one namespaced PostgreSQL statement.
- Trading inherits one-step swipe undo. Expiry/revocation removes inherited access immediately; a remaining active Premium grant is respected.
- Legacy capability grants are described as assigned access, not proof of a managed subscription. Only actual namespaced commerce access is described as subscription access.
- No migration, copied entitlements, new test identities or payment activation.
- Account and pricing display current access, source and expiry. Unknown/unavailable is never shown as Free.
- One owner-scoped client provider rechecks on focus, expiry and visible polling; logout/account changes abort and hide stale responses.
- Same account entry on search, Swipe, Trading and footer. Authentication returns to the requested workspace, replacing the login history entry.

## Verification

- Full check passed: lint, app/node/API type checks, SEO/Neon boundaries, UI contracts and 658 tests (655 passed, 3 explicit integration skips).
- Additional final client/provider/UI/server membership suite: 39 tests passed.
- Development Neon integration: 30 checks against real PostgreSQL, complete rollback, zero persisted fixtures and no provider calls.
- Local Vercel build passed, including public-bundle secret boundary and 22 curated SEO pages.
- Final full regression before the additional navigation-only tests: 669 tests (666 passed, 3 explicit integration skips). AccountLink adds 8 passing mounted tests, also run alongside Swipe/Trading component suites (48 passed).

## Deployed verification

- READY preview: https://sajda-9c5de9a3l-hypbit.vercel.app (dpl_EbncmRQzfi8FkbGXvur8XMdQLUCk).
- Stable test alias assigned and verified: https://sajda-test-hypbit.vercel.app/account.
- Unauthenticated visitor still receives a Vercel protection redirect. An authorized Vercel request without a Sajda session receives HTTP 401 from membership, with private/no-store, noindex and request correlation headers.
- Deployed health confirms Neon connected. No HTTP 5xx request logs found in the QA window. Node's existing DEP0169 url.parse deprecation warning appears during an auth request; it is not a failed auth response and is not claimed resolved.
- Existing synthetic test account signed in once on the new host. Account -> pricing -> Trading -> account -> Swipe all retain that same identity and Trading access.
- Trading access opens its existing workspace; no new research run, cancellation or quote refresh was requested. The pre-existing research tab was preserved.
- Live mixed Swipe returned 100 registry-verified names. Skipping cismo.xyz showed zujovis.net; fresh server-authorized Undo restored cismo.xyz, preserved zero saved items and disabled another undo.
- Full reload restored the account and its Trading membership without another sign-in.
- 320px: account, pricing, homepage and mixed Swipe controls fit. Spanish mixed-TLD controls also fit; smallest existing shuffle control flexes to about 31px at this narrow width.
- 390px account screenshot confirmed visible tier, assigned-access disclosure, exact expiry and links to all available workspaces. Temporary viewport override reset; final page left in Swedish.

## Boundaries

Basic/Premium checkout and automated monitoring remain unavailable; this change does not pretend catalog prices create access. Existing prices remain USD 0 / 9 / 29 / 1,880 monthly. Production environment, live billing, email provisioning, cron and existing research runs are unchanged.

## Stable test address

Use the dedicated preview alias https://sajda-test-hypbit.vercel.app for subsequent verified previews, with per-deployment BETTER_AUTH_URL set to that origin and SAJDA_LOST_DOMAINS_ENABLED=true. Do not point it at production or change shared cookie scope. The unique deployment URL stays trusted via VERCEL_URL. Never disable Vercel protection to avoid a login.

The alias must be inspected for ownership and verified after each update. A first login on the new address is expected; future updates can retain the same host-scoped Sajda session as long as the preview secret and database remain unchanged.

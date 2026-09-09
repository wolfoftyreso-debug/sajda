# Swipe: one-step Premium undo

## Scope

The latest Keep or Skip can be undone once. A new decision replaces the previous
undo slot; undo never reveals an older history entry. The last card remains
undoable until the visitor explicitly replaces the deck. Failed replacement
requests keep the original deck and undo slot. Undo does not run another domain
search or consume the free-search allowance.

Keep reversal removes only a newly saved, still-unchanged entry, or restores the
previous version of an existing entry. Existing tags/categories, unrelated
domains, and later manual edits or availability refreshes are preserved.
All wishlist writes use a synchronous revision so React batching cannot discard
an edit arriving at the same time as an authorization response.

## Premium boundary

- The browser requests a fresh same-origin POST to
  `/api/account/capabilities` for each undo.
- A current, verified account session and matching `X-Sajda-Account` are
  required. Client plan/role flags cannot create a capability.
- `sajda.account_entitlements` is the server-owned source, with owner foreign
  key, explicit provenance, finite validity, expiry and revocation.
- Migration `0005_account_entitlements.sql` was applied to the existing
  Development/Preview Neon database; six migrations applied, none pending.
  It creates **no grants**. No customer was promoted to Premium.
- Empty, expired, future, revoked and unknown access fails closed.
- The endpoint has no-store responses, account rate limiting and safe
  request-ID errors. Pending operations block duplicate actions and discard
  stale account/deck responses.

This is not an implemented billing lifecycle. Premium purchasing is not enabled
in this preview; the dialog says so. Stripe checkout/webhooks and live customer
entitlement provisioning were not performed. An authenticated user is not
automatically Premium.

The deck and wishlist remain browser-local. The server checks capability before
the normal UI action; this is not a claim that already-delivered browser data or
client-side history is tamper-proof or stored on the server. Reloading/leaving
Swipe loses the temporary undo slot.

## Verification

Final source check: `npm run check` passed (227 passed, 2 opt-in live suites
skipped, 0 failures), including lint, application/server TypeScript and UI
contracts. Final Vercel preview:
`https://sajda-6h0aucs0j-hypbit.vercel.app`,
`dpl_4wYEbWe8CeEwq9KTnnma3X5wdNT6`, READY. A deployment-scoped share link was
created; project-wide deployment protection was not disabled.

- Pure one-step/wishlist tests, real component-callback regression tests and a
  mounted concurrent-React test suite cover Keep/Skip, last card, one-step
  consumption, account switch, delayed/denied authorization, repeated clicks,
  same-batch manual changes and registry refreshes, and deck replacement.
- The mounted tests execute the real Swipe component, wishlist transitions,
  undo model and account HTTP client; provider/presentation boundaries and
  network responses are test fixtures. They are not a live paid-user browser
  transaction.
- Nineteen tests ran against actual PostgreSQL using the production entitlement
  SQL over a transaction-bound transport. All synthetic users, grants and
  rate-limit records were rolled back and verified absent afterward.
- Real browser checks used the built local application and Vercel preview.
  A registry request returned 100 verified cards; Keep and Skip advanced
  normally. Anonymous Undo displayed the honest Premium dialog and preserved
  the card and wishlist. Closing the dialog restored focus to Undo.
- English and Swedish mobile checks at 320×640 and 390×844 kept controls and
  dialog content inside the viewport. The temporary viewport override was reset.
- Preview HTTP checks: Swipe 200, health 200, empty account session 200,
  capability GET/POST without a session 401 with no-store responses.
  These checks were repeated against the final deployment after the concurrent
  wishlist fix. The real PostgreSQL rollback suite was repeated: 19/19 passed.

Useful commands:

```text
npm run check
node --env-file=.env.neon-development.local --import tsx scripts/check-swipe-entitlements.mjs --run
node --env-file=.env.neon-development.local scripts/migrate-neon.mjs --check
```

## Known separate limitations

No production promotion or live Premium charge was performed. Existing
deployment logs show a Node `url.parse()` deprecation during a successful auth
session read, not a failed capability request. The previously observed dev-only
`js-yaml` advisory remains separate from this feature.

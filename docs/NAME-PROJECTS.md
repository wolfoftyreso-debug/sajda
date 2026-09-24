# Name projects

Status: implemented account workspace and private API, **disabled by default**.
The September 13 preview enables a verified-account pilot, not a paid project
entitlement. Existing Free saves continue to behave as before. No collaboration,
automatic monitoring, notification or public/private MCP project operation is
introduced. The public anonymous connector cannot access projects.

## User flow

Open `/projects` with the ordinary Sajda account. Create a brief, optionally add
audience, naming style, language preferences and separate first-year/renewal
budgets. Choose and order finalists from the same account's Saved domains.
Save, return later, archive/restore, or export the saved decision brief.

"Find names for this project" copies a validated saved brief to the existing
search form through local router state, with an initiating-account guard. It
consumes that handoff and replaces the current history entry's state, so the
private brief is not left in router history for a later account to recover. It
does not run a search, enable AI sharing, send private text in a URL, or silently
enforce a price filter. Budget preferences remain visible guidance; exact-name
registration/renewal quotes must be checked separately. A return link reselects
the same project. New candidates must be saved before selection in the project.

Web exports are JSON; the native shell uses escaped HTML through its existing
OS share boundary. Both represent user preferences and saved references, not a
live availability report, valuation, legal clearance or purchase recommendation.
The native account proxy admits only canonical GET/POST with the existing saved
scopes; its project-only request envelope is bounded at 34 KB, with the actual
project JSON still bounded at 32 KB. Other native routes retain 16 KB limits.

The browser discovery flag is derived by `build-vercel.mjs` from configured
account auth plus `SAJDA_NAME_PROJECTS_ENABLED=true`. A stale public flag alone
cannot turn the workspace on. `/projects` is private/no-store/noindex and does
not enter a sitemap. Native builds need their explicit corresponding UI flag.

## Contract

Same-origin `GET /api/account/name-projects` lists up to 50 private projects for
the verified signed-in account in the deployment namespace. `POST` accepts:

```json
{
  "action": "save",
  "project": {
    "id": "4da78788-6425-40fc-9dbb-d104bbf2d82a",
    "expectedVersion": 0,
    "title": "Aurora",
    "description": "A planning app for independent founders",
    "audience": "Independent founders",
    "desiredStyle": "Short, calm and easy to spell",
    "languages": ["en", "sv"],
    "budget": {
      "currency": "USD",
      "maxFirstYearCents": 3000,
      "maxAnnualRenewalCents": 2000
    },
    "archived": false,
    "shortlistDomains": []
  }
}
```

Create with a client-generated UUID and version 0. Edit with the last returned
version. Retrying the identical last operation returns the current receipt only
when its persisted brief also matches and its current shortlist is an ordered
subset of the submitted references (originals may have since been removed);
a different or older operation conflicts with HTTP 409. Archive/unarchive is an
ordinary versioned save, not deletion. No hard-delete API exists in this slice.
Both active and archived projects count towards the 50-record technical storage
ceiling. This ceiling is **not a commercial plan allowance**.

Budget values are integer minor units; `null` means unspecified, `0` means an
explicit zero budget. These are user preferences, not verified domain prices.
All five current product languages are accepted. Shortlists contain at most
100 distinct canonical ASCII domains already saved by the same owner, in the
requested order. IDNs use the punycode returned by saved-domains. Domain URLs,
owner IDs, plan values, duplicate domains and unknown properties are rejected.
NUL and unpaired UTF-16 surrogates are rejected before database access; valid
Unicode text, including emoji, is preserved.

## Privacy and integrity

### Brand-package shortlists (September 16, 2026)

The existing JSON payload also accepts optional `brandShortlist` (at most 25
distinct canonical labels). Each item contains `label`, `requiredTlds`,
`platforms`, `markets`, optional `note`, and `source: "user_supplied"`.
No client-supplied ownership, live availability, price, score, observation or
verification fields are accepted. Existing records without the new field remain
valid. An update omitting it preserves the stored list; an explicit `[]` clears
it. The whole project still uses its original version/hash retry contract,
owner/environment isolation and 32 KiB request/storage limits. No new table or
migration is needed after 0019.

`SaveBrandPackageButton` loads projects only when opened. It saves into an
existing project without losing its brief, budgets or domain shortlist, or
creates a new private project. Double submission is guarded; an unconfirmed
write retains the exact UUID, version and body even if its dialog closes.
Version conflicts require a user-requested reload, never an automatic merge.
Account changes unmount private state and abort its requests.

Saved packages appear in `/projects`. Reopening passes the validated stored
configuration and initiating account through router state to `/name-packages`.
It pre-fills a form; it never starts a provider lookup, spends a search or
restores a stale score as current. Fresh checks and Sajda Brand Index calculation
are explicit subsequent actions. A missing/disabled feature flag still hides
the save action and leaves the backend route disabled.

Verification for this addition: pure configuration/schema tests, mocked-store
retry/preservation/owner checks, actual client acknowledgement tests, and mounted
component tests for save/retry/account switch/project reload/reopen. These are
not claims of new real customer saves or provider checks. The current linked
Vercel preview database passed read-only table/RLS/payload-limit/ownership-FK
preflight using `scripts/check-brand-project-storage.mjs`; no user rows were read
or mutated. Preview flags were unset during that check; deployment-specific
enablement and runtime verification are separate release steps.

- Same account/session, verified email and existing mutation-origin protection.
- Namespace separation for development, preview and production.
- Database owner foreign key; account deletion cascades through projects.
- Both project and saved-domain ownership are in the shortlist foreign keys.
- Removing a project/reference cannot delete a saved original. Removing a saved
  original removes its shortlist references while preserving the project brief.
  This reference removal does not increment the project revision. The next read
  reports the actual current shortlist; an old retry cannot restore a reference.
- Serialized owner mutations, optimistic revisions and owner-scoped rate budget.
- 60 requests per minute per account/namespace; saturated denial is committed.
  Account deletion removes these hashed rate records in every namespace.
- Private no-store/noindex responses, generic correlated service failures.
- No public MCP access, key-auth API access, provider calls, crawling or AI spend.
- A settled account switch or logout aborts account-bound searches and clears
  their brief analysis, refinement context, keyword and result state. A known
  different account also triggers this boundary while its session is loading.
  Old callbacks and late responses cannot restore or resubmit the previous
  account's private search context.
- An ordinary refresh of the same account does not discard its in-memory
  results merely because authentication temporarily reports loading. The guest's
  first useful result is also preserved through initial hydration and signup.
- Only explicitly guest-only v2 result snapshots may enter the tab cache. Legacy
  v1 snapshots are removed rather than restored, because their owner cannot be
  established. No private project brief is included in either the new snapshot
  format or a search URL.

Signed-in search results and their refinement context are **memory-only**. They
do not survive a full reload and are cleared at an account boundary. This is
separate from saved name projects and Saved domains: those remain in the
account's database and can be reopened after login or a return visit. A user
must explicitly save candidates they want to retain; seeing a search result
does not itself save it to a project.

## Enable only after verification

1. Review migration `0019_name_projects.sql`; apply through the established
   Neon migration workflow to a designated development branch, then preview.
   Development migration 0019 was applied on September 13, alongside pending
   additive migration 0018. No production schema was changed.
2. Run the new tests, full check and Vercel build. Exercise real PostgreSQL
   constraints, parallel creates/edits, FK delete races and rollback failures.
   Local mocked-store tests do not prove real PostgreSQL concurrency.
3. Set server-only `SAJDA_NAME_PROJECTS_ENABLED=true` only in the intended test
   environment. Missing or any other value leaves the route at 404 without DB
   access. Keep production disabled until the next steps pass.
4. Retest the localized project workspace for clean/returning accounts, revoked
   sessions, account switching, empty lists and stale edits.
5. Verify deployed same-origin requests and logs. Define actual plan allowances
   and implement entitlement rules before presenting any paid project limits.
6. Expose account-bound API/MCP operations separately with explicit scopes and
   identical owner enforcement; never add private projects to public MCP.

## Verification (September 13, 2026)

- Final full check: 1,410 passing tests and 8 explicitly skipped provider/DB
  tests; lint, types, 76 five-language dictionaries, SEO/bundle/UI policies.
- Real designated development Postgres: independent concurrent connections,
  idempotent retries, version conflicts, owner/namespace isolation, archive and
  restore, FK cascades and rejection of another account's saved references.
  Synthetic accounts and rows were removed by exact fixture IDs; no existing
  customer data was modified.
- Local auth handlers + real Postgres: 36 checks including verified sign-in,
  session restoration, save/retry, project privacy, logout/login persistence and
  password-reset revocation. Test mail links were captured in memory, **not**
  delivered to a mailbox.
- Repeated the 36-check account scenario against Vercel preview
  `sajda-ndpw1xh40-hypbit.vercel.app`: actual deployed sign-in, cookie session,
  project saves/retries/conflicts, cross-account denial and return-visit reads
  passed. Test-account bootstrap and captured verification/reset mail remain
  local to the QA factory; this does not verify Resend inbox delivery.
- Browser fixture: 20 layouts (320, 390, 768, 1440 px × five languages), create,
  save, search handoff, uncertain-save retry and disabled state, no horizontal
  overflow or runtime exceptions. Fixture auth/storage are simulated. Run
  `scripts/check-name-projects-browser.mjs` with Playwright and the serve-only
  fixture `tests/fixtures/name-projects.vite.ts`; it cannot be deployed.
- Web and native JS bundles build; native contains no website SEO or service
  worker. This is not an Xcode build, signing, TestFlight or physical iPhone test.
- Final preview `https://sajda-134q1vgm0-hypbit.vercel.app` is Vercel READY.
  Read-only deployed smoke checks passed: home/pricing/projects return HTML,
  project responses are private/no-store/noindex, anonymous project API reads
  are denied, native GET is rejected at its POST-only boundary, and an unknown
  route returns 404. Vercel deployment protection remains enabled; these checks
  used authenticated deployment access, not a public production launch.
- Repeated all 36 combined account checks against that final preview and the
  designated real Postgres database: passed. Two exact synthetic accounts were
  removed; zero existing users modified. Verification/password-reset links were
  still captured in local QA memory, not delivered through Resend.
- Mounted search-context regressions verify account A to B isolation, rejection
  of stale search callbacks, abortion of an in-flight request and rejection of
  its late successful response, logout cache cleanup, and preservation of the
  same account's transient loading state and the guest's first result. Snapshot
  tests verify guest-only v2 restoration and removal of legacy unowned data.
  These are local implementation tests, not a physical-device privacy test.

Not established: paid project entitlements, actual inbox delivery, native device
sign-in/export, collaborative editing, scheduled watches, and account MCP project
continuity. Keep those out of active product promises.

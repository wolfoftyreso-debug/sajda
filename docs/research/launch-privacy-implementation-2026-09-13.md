# Launch audit: privacy implementation and data provenance

Date: 2026-09-13. Read-only source and isolated-test audit of the current dirty working tree. No product code, configuration, credentials, production data, external account or provider state was changed. This document is implementation evidence for the release owner's legal/App Store review, not a legal opinion or completed Apple privacy declaration.

## Findings requiring reconciliation before release

### 1. Published policy is behind the actual account data model

**Observed:** `src/pages/Legal.tsx:93–104` describes generic browser preferences and optional Neon account storage. The current implementation additionally persists name-project title, description, audience, desired style, languages, registration/renewal budgets, archive state and ordered saved-domain references. Projects are linked to the owner and environment, not anonymous preferences (`shared/name-projects.ts:23–50`; `db/migrations/0019_name_projects.sql:3–28`). Trading scenarios similarly persist a user's thesis, catalyst, invalidation, review date, stance and numeric cost/sale assumptions (`shared/trading-scenarios.ts:37–86`; `db/migrations/0018_trading_scenarios.sql:3–14`).

`docs/APP-PRIVACY-INVENTORY.md` does not include these two new persistent models. Its AI update at lines 7–13 correctly supersedes the older AI row at line 31, but retaining both descriptions makes the inventory harder to use. The current `docs/AI-PRIVACY.md` and consent UI accurately include refinement feedback, up to 50 previous names and five favorites.

**Required decision:** reconcile the public privacy notice and Apple engineering inventory with the release's enabled features. State purpose, account linkage, recipient classes and actual deletion/retention boundaries. Root legal review supplies the required legal particulars; do not infer them from schema fields.

### 2. “Up to 30 minutes” currently describes snapshot usability, not guaranteed erasure

**Observed:** `src/lib/searchSession.ts:3–5,25–56` uses `sajda.search-results.v2`, explicitly guest-only. It removes the legacy unowned v1 key on read/write. Expired, future or malformed v2 records are ignored at lines 34–35, but are not removed by that read. Physical removal occurs on an explicit empty write at line 55, tab/site-data clearing, or replacement. Signed-in search results are no longer written to this unowned cache (`src/contexts/ScanContext.tsx:421–423`).

The public English and translated policy says search results are kept in session storage for up to 30 minutes (`src/pages/Legal.tsx:95`, corresponding locale entries). That overstates physical retention and does not distinguish guest from account searches. The internal inventory already correctly warns that snapshot age checks do not establish physical erasure (`docs/APP-PRIVACY-INVENTORY.md:36,46`).

**Required correction:** either describe 30 minutes as the restore/freshness window, or implement and verify physical deletion when records expire. Do not claim a guaranteed wall-clock erase while the tab is inactive. Mention the guest-only behavior.

### 3. Configured Cloudflare exact quotes are another recipient

**Observed:** the public connector's adapter sends a bounded list of exact domains to Cloudflare's account-specific Registrar `domain-check` API (`api/_shared/connector-registrar.ts:119–143`). It sends `{domains: requested}`, not the account user's brief/email; the authorization belongs to the configured operator integration. The product's internal inventory names several registry/registrar recipients but does not identify this new configured Cloudflare quote path (`docs/APP-PRIVACY-INVENTORY.md:27–28`). This is separate from simply displaying a Cloudflare purchase link.

**Required correction:** add the conditional recipient, field categories and credential ownership. The chosen external AI/MCP client also receives tool output under its own terms. Do not label all no-account requests anonymous, private or on-device.

### 4. Source attribution is present on screen but not in the exported research artifact

**Observed:** `src/pages/LostDomains.tsx:418–420` includes applicable awesome-selfhosted source URLs, author attribution, CC BY-SA 3.0 link and independence notice. The project source-operations document explicitly instructs retaining source, author, license and modification notice (`docs/LOST-DOMAINS-SOURCE-OPERATIONS.md:19–27`). The CSV offered on the same page (`src/pages/LostDomains.tsx:201–206`) serializes `source_url` but no author/license/modification notice (`src/lib/tradingReport.ts:26–42`).

**Required review:** determine the licensed-material scope of exported rows and make export attribution consistent with the reviewed source contract. This audit does not determine that individual domain facts are copyright-protected or that infringement occurred.

Source admission has useful controls: disabled by default, explicit review reference, robots allowance, review timestamps and a maximum 30-day review window (`db/migrations/0006_lost_domains.sql:14–30`; `api/_shared/lost-domains-store.ts:191–202`). Live robots checks reject disallow, unavailable/invalid policy and nonzero crawl delay (`api/_shared/lost-domains-engine.ts:266–303`). Those technical controls do not themselves prove permission for commercial extraction, redistribution, dataset reuse or attribution sufficiency. Actual approved rows, their rights evidence, publisher limits and usage volume were not queried.

### 5. Retention, export and deletion remain distinct operations

**Observed:** project archiving is reversible and preserves payload and references; the current project endpoint offers list/save, not an individual permanent-delete action. A saved project can be downloaded as JSON on web or escaped HTML via native share (`src/pages/NameProjects.tsx:141–153,189,202`; `src/lib/nameProjectDraft.ts:26–28`). This is a project export, not a full account data export. `src/pages/Account.tsx` exposes deletion and AI settings, but no full-account export workflow was found.

Owner deletion cascades projects and Trading scenarios via their foreign keys. Its local cleanup also removes the new project rate-limit identities (`api/_shared/account-deletion.ts:159–173`). Existing deletion is an authenticated two-step flow with a code sent only to the stored owner's email, five durable guesses, an explicit DELETE confirmation, billing correlation and transactional success. A mail outage prevents deletion and returns a retryable error (`api/_shared/account-deletion.ts:95–125`). Real delivery and the operator's alternative support path therefore remain release dependencies.

Anonymous contact messages and provider/mailbox copies are not linked to an account deletion. The contact guard stores HMAC fingerprints, leases/status and timestamps, and opportunistically removes up to 100 rows older than 30 days during later reservations (`api/_shared/contact-guard.ts:89–98`). This is not an unconditional 30-day purge promise. Auth/session/API token expiration likewise is not a backup, log or database retention schedule.

**Required operator work:** agree an actual retention/deletion/rights-request process including provider records, mailboxes, backups, downloaded/shared artifacts and individual project removal requests. A UI export button is neither automatically necessary nor sufficient for handling all data access requests; that legal assessment belongs to the release owner.

## Storage and communication inventory observed

| Surface | Actual stored or shared data | Boundary |
| --- | --- | --- |
| Web authentication | Session cookie, Neon session token, account link, IP and user-agent fields | Better Auth cookie prefix `sajda`, HTTP-only, SameSite=Lax, Secure on HTTPS; seven-day session validity. `api/_shared/account-server.ts:33–62`; auth schema `0002_vercel_auth.sql:19–33`. |
| Browser preferences | `name-quest.language.v2`; `sajda.ai-permission`; `sajda.free-search.v1`; inspiration/signal cycle keys; day-scoped local logo counter | Device/origin storage, not necessarily tied to signed-in identity. No complete browser-origin erase promise on account deletion. |
| Guest search | `sajda.search-results.v2`, max 50 names/offers, no input brief or account/token fields by intended writer | Guest-only restore window 30 minutes; old v1 removed. Inactive expiry does not erase the raw key. |
| Entry handoff | `sajda.search-entry-preset.v1`: keyword/brief and selected options | Same-tab session storage, consumed and removed on read, accepted for ten minutes; avoids public URL query (`src/lib/searchEntryPreset.ts:4–24,68–96`). Name-project handoff uses separately validated router state that Index consumes and scrubs. |
| Swipe | `sajda.swipe.wishlist.v1`: domain/result snapshot, category, user tags, dates | Explicitly browser-local independent of account (`src/lib/swipeWishlist.ts:3–10,18–28,112–141`). |
| Marketplace drafts | `sajda.marketplace.local-drafts.v1`: domain, asking price/currency, description, contact name, dates | Browser-only drafts, no transaction or provider integration (`src/lib/marketplaceListings.ts:1–7,14–35`). Legacy development repository is not evidence of a live Supabase processor. |
| Name projects / scenarios | Detailed user input and selected names, plus owner/version/environment | Private Neon models, account deletion cascades; archive is not erase; exports leave the account boundary. |
| Search with optional AI | Theme, brief, criteria/language, feedback, previous names/favorites; Top 10 review data | Explicit versioned device permission; Vercel Gateway → Google Gemini (`google`/`vertex` route). No permissions inferred from purchase/API key. AI off still uses registry/registrar services. |
| Account mail | Verification/reset URL or deletion code to the stored account email | Resend; reply-to support, no recovery copy to support (`api/_shared/account-email.ts:111–125,183–205`). Actual sender/inbox delivery not checked here. |
| Contact | Name/email/subject/message to `dev@hypbit.com`, supplied email in reply-to | Resend fixed recipient, strict validation and immutable retry; no message body in contact guard. `api/_shared/account-email.ts:128–178`. |

No dedicated product analytics/tracking SDK references were found for Vercel Analytics/Speed Insights, Sentry, PostHog, Mixpanel, Amplitude, Google Analytics/Tag Manager, Clarity or Facebook in the inspected `package.json`, `src`, `api`, `shared`, `index.html`, `public` and `ios` sources. This does not establish that hosting injects nothing, infrastructure has no logs, transitive native dependencies do not collect data, or Apple declarations should say “Data Not Collected.”

Application auth/contact/project/AI logging inspected uses bounded event/status/correlation fields, not raw passwords, recipient messages, AI prompt text or provider error bodies (`api/_shared/account-server.ts:64–67`; `api/_shared/account-email.ts:177`; `api/_shared/ai-gateway.ts:206–213`; `api/account/name-projects.ts:52–55`). Some legacy UI error handlers log caught errors; their reachability and infrastructure collection should be checked in the final bundle. No complete production-log or provider-retention audit was performed.

## Verification performed this audit

Command: `node node_modules/tsx/dist/cli.mjs --test` with the following files:

- `tests/scan-account-privacy.test.ts`, `tests/search-session.test.ts`
- `tests/ai-consent.test.ts`, `tests/ai-consent-ui.test.ts`
- `tests/account-deletion.test.ts`, `tests/account-deletion-client.test.ts`, `tests/account-deletion-ui.test.ts`, `tests/account-deletion-email.test.ts`, `tests/auth-deletion-cleanup.test.ts`
- `tests/contact.test.ts`, `tests/contact-guard.test.ts`, `tests/contact-client.test.ts`
- `tests/name-projects.test.ts`, `tests/name-projects-client.test.ts`

**100 tests passed, 0 failed, 0 skipped.** These are source/unit/mounted React and injected database/provider-boundary tests. No `.env` file was loaded, no actual customer database mutation was run, and no real email, registrar or AI-provider request was sent.

The new mounted privacy regression passes: account A's brief/results are cleared on switch/logout, pending requests abort, late A responses cannot restore A state under B, same-account refresh preserves work, and only deliberate guest snapshots survive hydration. Exact absent/revoked consent paths do not call AI; all five consent locales and cross-tab revocation pass. Deletion wrong-owner/expired/invalid-code/late-session and contact duplicate/uncertain-send failure cases pass.

## Explicitly unknown / not verified

- The final production deployment's enabled processors, region/branch, log drains, access logs, consent telemetry and backup deletion/restore practices.
- Current DPA/subprocessor/transfer arrangements and the operator's lawful bases, controller identity, actual retention schedule and rights-request handling.
- Real Resend domain verification and inbox receipt, plus account deletion after actual mail delivery.
- Live account deletion cascades, refund/cancellation behavior and paid sandbox commerce for this release. Earlier reports are not new tests.
- Physical iPhone storage/keychain/share cleanup, final native archive SDK/manifests, Apple App Privacy answers or App Store acceptance.
- Live source approvals and license evidence, commercial crawl frequency, registrar/feed cache/redistribution rights and external AI-client data handling.

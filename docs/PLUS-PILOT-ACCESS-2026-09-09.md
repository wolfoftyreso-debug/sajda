# Plus pilot access and USD presentation

This is a follow-up to the initial Lost Domains pilot. The operator explicitly requested a test login and dollar-denominated monthly pricing.

## Current state

- Preview: `https://sajda-5mcurq6s2-hypbit.vercel.app`, deployment `dpl_98QixxcUCAdAP3zMX8G781g8S2gT`, READY, not production.
- A new synthetic identity `plus-pilot-20260909@sajda.test` was created in the reviewed development/preview Neon project. No existing user's credentials or identity were changed.
- It has an explicit operator Plus grant until **2026-09-16T01:39:34.514Z**, no admin role, no billing and no daily refresh.
- The .test address is a synthetic login, not a real mailbox or a claim of email ownership. Ordinary signup verification was not relaxed. Passwords use the installed Better Auth password hashing implementation. No password or session token is included in this document or source code.
- `SAJDA_LOST_DOMAINS_ENABLED=true` was supplied to this preview deployment only. It was not added to global/production environment configuration. A future deploy will need its own explicit opt-in.
- A single expiring non-production smoke source is configured: example.com → iana.org. It tests the real engine and persistence; it is **not** a commercial lost-domain catalog or production dependency. Live robots and network safety checks remain mandatory. Source approval expires with the pilot grant.
- The indicative display is now **USD 2,000/month**, explicitly US dollars and not an FX conversion claim. No Stripe price or subscription was created; final tax/commercial terms remain unsettled.

## Verified on the actual preview

The bounded real HTTP test exercised:

1. Vercel share-link access and anonymous private-API denial.
2. Real email/password sign-in and cookie session.
3. Server-side Plus entitlement and enabled engine with one source.
4. Start → source discovery → registry checks → completed persisted report.
5. Correct result: iana.org is registered; zero confirmed registrable finds.
6. Logout denies private access.
7. A second sign-in returns the same saved report.
8. Test sessions removed by normal sign-out.

Run ID: `522fd4ee-a822-42bc-a59b-9295fface99b`. Actual PostgreSQL state after the check: one active Plus grant, one saved assessment, zero active runs and zero remaining test sessions.

This consumed one of the account's two runs per rolling 24 hours. The user can inspect the saved report and start the remaining run after the five-minute cooldown. Source and attempt budgets are unchanged. No background schedule is active.

The browser was used to verify the deployed login route, return path and new USD copy. Positive authentication/workflow verification was performed through real deployed HTTP sessions, not by fabricating browser state.

Repository checks: **316 tests, 314 passed, zero failures, two opt-in tests skipped**; lint, TypeScript, policy and UI checks passed. Runtime logs show the existing DEP0169 url.parse deprecation warning on a successful auth request, not an observed failed request.

## Operator scripts

- `scripts/create-plus-pilot.mjs`: defaults to plan-only, refuses production/wrong project, and never overwrites an existing account or approved source. Explicit --apply creates this one synthetic identity with a random password and seven-day grant.
- `scripts/check-plus-pilot-deployed.mjs`: accepts a private JSON line through stdin, validates the preview host/test identity, performs one bounded real run and returning-user check, prints no passwords/cookies, and signs its sessions out.

Do not place credentials in CLI arguments, committed fixtures, documentation, screenshots or public links. Hand the generated test password directly to the requesting operator. This account has no working mailbox/password-reset delivery; it is not a substitute for completing Resend verification for real customers.

## Still not commercial launch approval

The test login unlocks the actual pilot, not a complete 30-name commercial feed. Licensed/approved discovery sources, historical/backlink risk data, exact registrar availability and prices, validated ranking, payment lifecycle, account email delivery and production release gates remain separate work.

Reference for the strictly limited illustrative source: [IANA example-domain guidance](https://www.iana.org/help/example-domains). Do not build a production service that depends on example-domain HTTP uptime.

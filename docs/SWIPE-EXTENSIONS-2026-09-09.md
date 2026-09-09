# Swipe extension fix — 2026-09-09

## Scope and behavior

- Removed the client-only `.com` restriction. Swipe now shares search's audited extension list: `.com`, `.ai`, `.dev`, `.app`, `.net`, `.org`, `.xyz`, `.info`, `.biz`.
- All supported endings are initially selected. The user chooses endings and explicitly starts the first deck before using the free-search allowance.
- Only authoritative available results for the requested endings become cards. Unknown/taken responses and mismatched suffixes are excluded, never replaced with `.com`.
- The server preserves verified responses already in flight and deals cards across the selected suffixes instead of ordering only by registry response speed. It starts no extra requests after reaching the target; the candidate cap remains 180.
- The 22-second request-wide launch deadline leaves room for bounded in-flight registry checks within Vercel's 30-second function limit. Partial decks are valid; 100 cards and representation of every suffix are not guaranteed when registries throttle or fail.
- CentralNic `.xyz` negative responses with HTTP 404, `errorCode: 404`, and `objectClassName: "error"` are now accepted. Contradictory domain objects, HTML errors and rate-limit errors remain unknown.
- Existing cards survive denied/failed replacement attempts; first-request retry retains its selected endings. An exhausted deck has a finished state, not an idle spinner.
- The mobile settings footer remains visible while the endings list scrolls. The settings button shows the active ending or mixed count.

`.se`, `.nu` and `.io` still lack an approved secure registry connector in the Vercel runtime. The dialog explicitly states this limitation. No unsafe transport or fabricated availability was added.

## Verification

- Final `npm run check`: 161 passed, 2 opt-in database tests skipped, 0 failed. Includes seven API Swipe regression tests, four client deck-filter tests and request-wire/UI contracts.
- `npm run build:vercel`: passed locally and in the Vercel remote build.
- Real registry probes: all nine configured connectors returned authoritative availability across bounded exact checks. Real `.dev` and mixed Swipe requests returned verified cards; `.xyz` was reproduced failing before the parser change and passing afterwards. No AI calls.
- Real local browser: select only `.dev`, start, receive nine verified `.dev` cards, save one, reject a second search without losing existing cards, skip remaining cards and reach the explicit finished state.
- Mobile browser: 375x812 and 320x640 settings inspected; the 320px footer overflow was reproduced, fixed and visually reverified.
- Deployed HTTP checks: anonymous share entry and `/`, `/swipe`, `/contact`, `/auth`, `/api/health` returned 200; private saved-domains API returned 401; invalid Swipe length returned 400.
- Real deployed browser: all nine endings selected, explicit Start, 100 registry-verified cards returned. The first nine cards cycled through `.com`, `.biz`, `.xyz`, `.dev`, `.app`, `.info`, `.org`, `.ai`, `.net`; eight real skip actions were exercised. This is observed live output, not a mocked registry or a guarantee of future results.

## Deployment

- Vercel preview: `https://sajda-b9mtf2jjr-hypbit.vercel.app`
- Deployment: `dpl_3nhAAZLD3T2YpDxQ3m8HZZKtZyh7`, READY.
- Deployment-scoped share link created for the user; no project-wide protection change and no production promotion.
- No database migrations, credentials, paid AI calls or email sends were part of this change.

## Separate build-tool finding

The remote install reported `js-yaml@4.3.1` / GHSA-2883-xcg3-v3hh through development-only ESLint. `npm audit --omit=dev` reports zero vulnerabilities. A compatible 4.3.2 patch is available; updating and rechecking this development dependency remains separate follow-up work. No production import was found.

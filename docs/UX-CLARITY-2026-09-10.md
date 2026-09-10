# How-it-works clarity pass — 2026-09-10

## Scope and implementation

The user's mobile screenshot identified confusing headings and excessive text on
`/how-it-works`. The existing colours, surfaces, icons and page identity remain.
No account, entitlement, payment, database or search-engine behaviour changed.

- Replaced abstract headings with concrete search, check and comparison actions
  in English, Swedish, Spanish, French and Chinese.
- Each search card now has one prominent action heading and one short visible
  explanation; removed the competing uppercase heading.
- Moved secondary search mechanics and detailed scoring criteria into native,
  initially closed `details` disclosures with uniquely named summaries.
- Kept availability uncertainty, price-source limitations, final provider
  confirmation and non-valuation/legal caveats explicit.
- Strengthened section headings and made the header wrap at narrow widths.

Mobbin's Deel flow examples informed the short, verb-led step hierarchy, not the
visual design or factual product claims:
https://mobbin.com/sites/sections/5a67b45d-ed23-4364-9812-2ece7d9b50ef

## Verification

- Five-language rendered regression test: 6 tests passed. Covers heading levels,
  single visible card explanation, closed native disclosures, distinct accessible
  names, retained limits/caveats, safe internal links and no component network calls.
- Local browser: all five languages at 320px; Swedish and English at 390px;
  French at 768px; English at 1440px. No horizontal overflow in measured layouts
  or search cards. No observed browser console errors.
- Native disclosure opens with Enter and closes with Space; visible focus ring,
  detail text exposed on opening, and summary touch targets at least 44px high.
- English desktop: all three collapsed search cards measured 218px high.

- Full `npm run check`: passed lint, frontend/server TypeScript, SEO/Neon/Node
  policies and UI contracts; 683 tests, 680 passed, 3 skipped, no failures.
- `node --env-file=.env.local scripts/build-vercel.mjs`: passed production build,
  all 22 existing curated SEO pages and the browser-secret boundary check.

## Deployed verification

- Vercel preview `dpl_J89jgJcX9n73hDGaMTcg7mMPTMCa` reached READY:
  https://sajda-w1qwv9tn9-hypbit.vercel.app
- Its `/how-it-works` route was inspected in the browser at 390px, including
  actual disclosure open/close, visible expanded detail and absence of overflow
  or observed console errors.
- Existing alias https://sajda-test-hypbit.vercel.app now points to that preview.
  Browser verification on the alias confirmed the new Swedish headings, closed
  disclosures and page entry at scroll position zero.
- Preserved preview `SAJDA_LOST_DOMAINS_ENABLED=true` and the existing stable
  `BETTER_AUTH_URL` origin. Deployment protection remains unchanged.
- This was not a production rollout or another verification of payment/email/
  Trading-provider integrations; those are outside this presentation-only pass.

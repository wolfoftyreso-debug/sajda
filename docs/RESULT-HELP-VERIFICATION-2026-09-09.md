# Search-result help: placement and clarity

## Change

Replaced the fixed bottom-right `SajdaSignal` overlay with `SearchResultHelp`, a collapsed disclosure after the search filters and before the result grid. It is part of normal document flow on all viewport widths and never covers a domain card.

The title is now “Så läser du resultaten” / “How to read the results”. Three localized explanations distinguish point-in-time registry availability, standard extension prices versus exact-domain quotes, and naming quality scores versus financial valuation. There is no rotating content, background feed request or automatic dismissal. Escape closes the disclosure and restores focus to its button.

## Verified

- Component/integration regression tests: 7 passed.
- `npm run check`: 396 passed, 0 failed, 2 opt-in skipped (398 total), including lint, TypeScript, SEO policy and server boundary checks.
- Vercel preview deployment `dpl_HXf9fTQrEX13MGDhDBtU8bmTCv7F`: READY.
- Preview origin: https://sajda-n6kfznl2q-hypbit.vercel.app
- Deployed HTTP smoke: 52 passed; database health HTTP 200, connected.
- Actual browser search submitted through the visible form for synthetic QA domain `sajdalayoutcheck9q7x.com`; one real registry-checked result rendered. No domain purchase or registration performed.
- Browser visual/DOM checks at 320, 390 and 1440 CSS-pixel widths: no horizontal document overflow; help position `static`; first domain card begins below the help in expanded and collapsed states.
- At 320px, help/card separation was approximately 36.7px in both expanded and collapsed states. Escape closed the disclosure and returned focus to its button.
- English and Swedish rendered copy inspected. All five supported languages covered by component tests.
- Browser warning/error log inspection returned no entries during this verification.
- Viewport override restored after testing.

## Scope / limits

This verifies the result-help change on the deployed preview, not an actual iPhone/Safari session or all unrelated product flows. The user's screenshot was from an older immutable deployment. Production was not promoted and project-wide deployment protection was not disabled. Payment, email, database schema and Plus entitlements were not changed.

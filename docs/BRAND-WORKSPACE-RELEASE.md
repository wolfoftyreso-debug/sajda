# Brand workspace release — 2026-09-17

## Delivered workflow

Home / domain result → brand-package workspace → idea search or exact-name check → shared candidate Brand Index → compare up to three → save a private package configuration → reopen and explicitly recheck.

- Creative package search checks the same label across selected extensions, within existing search budgets. Taken extensions stay visible instead of disappearing from a package.
- Every candidate uses the shared, versioned Brand Index projection also exposed by REST/MCP. It exposes score dimensions, evidence coverage, conflicts and missing checks.
- Per-package exact checks retain unrelated candidates, reject unsolicited rows, release the browser allowance after transport/empty failures, and abort on account changes or navigation.
- Saved package configuration includes label, extensions, social channels and markets in the existing owner-scoped Neon name project. It is not a persisted claim of current availability or ownership.
- Home, domain cards and the existing-brand lookup/worksheet link into the same workflow. Private project handoffs use owner-validated router state, not query-string content.
- Five languages; progressive options; mobile single-column and desktop two-column cards; comparison wraps without horizontal page overflow.
- Optional AI consent remains explicit and off unless the user opts in. The package editor exposes its current state in a collapsible disclosure without removing the full explanation.

## Evidence

- 68 focused core/API tests, 49 protocol/OpenAPI regression tests, 22 mounted package UI tests and 46 persistence/client/mounted save tests passed.
- Three additional workspace handoff/merge/language tests passed.
- Browser provider fixtures: 20 width/language combinations, 101 geometry checks, zero runtime exceptions; exact mode, compare, retry, export and retained candidates exercised. These are synthetic observations, not live registrar or account tests.
- Browser widths: 320, 390, 768 and 1440. Languages: EN/SV/ES/FR/ZH.
- Fresh Vercel preview-injected Neon metadata verified existing project tables, RLS, owner foreign keys and JSON size constraint. No user rows read or database mutation used for this preflight.
- Preview project flag enabled. Production flag, aliases and production data unchanged.
- First preview build passed Vite, 22 static SEO route checks and the browser-secret/Neon boundary policy; deployed package page returned200 and unauthenticated social POST401.
- Actual browser search on the first preview returned10 packages with .com/.ai observations, visible taken-name conflicts, candidate Brand Index and enabled save-entry navigation. AI consent remained off. No account creation or purchase was performed.
- Global language contract:90 dictionaries, zero key/placeholder mismatches.

## Final preview verification

- Final preview: https://sajda-o2nf3d3rh-hypbit.vercel.app/name-packages
- Deployment `dpl_7MG6tm2pAAJnypiEAqFupkKiyQLs` completed with `READY`, preview target. Production was not promoted.
- Final local UI contracts, application TypeScript check and focused ESLint completed successfully.
- Final deployed browser: idea/exact mode switching, compact configuration and AI disclosure verified. Exact `example` check returned both selected domains, retained their conflicts and displayed a 40/100 candidate index; no availability/ownership was fabricated. No browser error logs were observed.
- The parallel CLI smoke test timed out on the busy workstation; it is not counted as a final-preview pass. A separate sequential OpenAPI HTTP check returned 200. Earlier preview smoke evidence remains listed separately above.
- Final sequential intelligence verification passed: OpenAPI 200; MCP initialize and tools catalogue 200; one real REST package search 200 and one real MCP package search 200, each returning one package with the shared candidate `brand_index`, unknown legal/ownership evidence, and the supported score ceiling. The private unauthenticated package endpoint returned 401. Two public searches, zero social checks, account mutations or purchases.
- That script initially expected the older MCP version 1.2.0. The actual repository and deployment both use 1.4.0; the test expectation was corrected and the entire sequence rerun successfully. This was a test-only change, not a production protocol change.
- Final 390px browser inspection passed visually. Reload restored the candidate without treating restored observations as current evidence. The viewport override was reset after verification.
- Vercel React and full-story verification guidance informed cancellation/account-boundary protections and the browser/API verification strategy.

## Remaining verification boundaries

The index is candidate readiness, not independently verified brand ownership, a valuation, a legal opinion or trademark clearance. At present the supported score ceiling is70/100. Unknown data never earns legal/ownership points.

Domain status is time-sensitive. GitHub profile presence/absence is not registration availability. Other social channels and company/trademark registers still require manual checks.38 country review plans include official source links, not automated legal searches.

Saved-package writes and reopening were verified through the real client/component/store contracts with synthetic account transport. A real signed-in preview account save→reload cycle remains to be exercised; no credentials or account were invented for this test.

The generic local SSR UI-contract harness initially timed out while importing an existing dictionary on the busy workstation. Its dev-server configuration was isolated from production plugins; the follow-up found an unnecessary default-false request field. That field now stays omitted from ordinary search requests for backwards compatibility.

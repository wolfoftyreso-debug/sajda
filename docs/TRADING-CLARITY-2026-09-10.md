# Trading: an explicit next step

Scope: address the user's difficulty knowing where to click. This change does not expand research budgets, crawl sources, account access, valuation claims, prices or payment behavior.

## Observed problem

The previous workspace put a method link, status refresh, long capacity text and start action ahead of the useful report. A completed report with no current shortlist hid its checked domains under "Other checks". Unknown/loading access also rendered the sales panel as though the user lacked Trading.

## Implemented

- A single prominent, state-aware next-step card immediately after the Trading heading.
- First scan: **Start domain scan**. Existing run: **Follow scan progress**. Completed report: **View results**, or **View checked domains** when no current shortlist exists. Starting another scan is secondary.
- Guest sign-in uses the normal Sajda account route; it is not a separate Trading login. Loading, failed access reads, unavailable research and confirmed missing access are distinct states.
- Checked domains open by default when no current candidates exist. Registered, excluded and expired observations retain their real status and do not become opportunities.
- Candidate domain names are keyboard-accessible buttons that open their evidence. Their expanded state stays synchronized with the details summary.
- Filter/export, scope/timing, account and methodology controls use disclosures. Result explanations sit below the domain list, with per-domain uncertainty and purchase restrictions intact.
- All new copy has English-source contracts and explicit Swedish, Spanish, French and Simplified Chinese translations. Long-running checks are disclosed; no claim of background processing is added.

The inspected [Elicit recent-work screen](https://mobbin.com/screens/d24b4334-a8fa-4a9e-b8e0-50ed35eaf752) provided a limited interaction reference: separate creating work from opening existing work. No copy, visual assets or product design was copied.

## Verification

- The mounted real page/client test suite covers ten next-step states, double-start prevention, account boundaries, stale evidence, report filtering, candidate expansion and existing-run continuation. All HTTP behavior in these tests is fixture-bound.
- Real browser interaction with the production page/CSS and real route scroll restoration, isolated by local synthetic auth/network fixtures: start to running; follow progress; view report; domain expansion by click and Enter; details synchronization; filtering to zero and clearing; guest/loading/locked/error/waiting/unavailable states.
- Layout checks at 320, 390, 768 and 1440 CSS pixels. All five languages checked at 320 pixels. No horizontal page overflow; the first scan action remained visible within a 760-pixel-tall viewport, including the fixture banner.
- A second visual pass removed excessive explanation before the actual domain list. Anchor navigation both scrolls to and focuses the requested report/progress section.
- No real Trading run, quote request, subscription, account or provider was created, advanced or cancelled for this UX test.

The ignored local fixture is not shipped and is not an application feature flag.

## Release evidence

- Application commit: `f183b2ba4e2c39f6e77b71db7cdcc1f07e0a9418`, pushed to `main`.
- Final `npm run check`: 1,020 tests, 1,015 passed, five opt-in integration tests skipped, zero failures. Lint, TypeScript, 71 language dictionaries, UI, SEO policy, Node syntax and Vercel/Neon boundaries passed.
- The focused mounted Trading suite passed all 38 tests. Production web and native product bundles built successfully.
- [GitHub Verify](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34534148774): success. [iPhone workflow](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34534148766): native bundle, sync, unsigned Debug and Release compiles passed; simulator boot was still running at the time of this record. This is not physical-iPhone or TestFlight verification.
- Vercel deployment `dpl_EH4HuY96CxBNvy1RktYNTsu46L4d` reached **READY**: [immutable preview](https://sajda-drl7fvomi-hypbit.vercel.app/plus). The stable [test alias](https://sajda-test-hypbit.vercel.app/plus) was assigned to it.
- Live read-only HTTP probe: `/plus` 200 and noindex; deployed `index-Cbr_1xGD.js` references `LostDomains-BkiM-KG6.js`, which contains the eight checked new UI markers; `/auth?next=%2Fplus` 200; private Trading without an application session 401/no-store with no report data.
- Actual deployed-browser mobile check: new Trading guest screen renders, its primary action reaches the shared account sign-in page with the correct return route, and no runtime console errors were recorded in this interaction. Authenticated report interactions were tested with isolated fixtures, not a newly started real scan.
- Bounded Vercel 5xx log check returned no entries during the verification window. This is a smoke check, not evidence that future runtime failures cannot occur.

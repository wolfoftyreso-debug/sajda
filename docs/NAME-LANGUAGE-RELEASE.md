# Name-language selection

## Delivered behavior

- Brand-package discovery has a separate **Name language** selector: English, Swedish, French, Spanish, German, Italian and Portuguese. English is the default, independent of interface locale.
- The selected language reaches the server-side candidate engine and the existing consent-gated AI prompt. Non-AI generation uses language-specific naming corpora; it is not a general-purpose translation service or a guarantee of native editorial quality.
- Exact-name checks do not translate names or apply the discovery language. General search keeps its existing advanced-language controls.
- Accepted results retain their actual request language. Changing the form does not relabel existing results, and unrelated exact searches cannot inherit a previous language label.
- Saved packages preserve language, including on reopening. Package identity includes language, so the same label in two languages does not overwrite another package. Legacy entries without language remain compatible with English.
- New projects created from a package inherit its naming language, not the interface language. REST/MCP package discovery and OpenAPI share the seven-language contract.
- Project titles are context rather than mandatory English prefixes in package discovery, allowing a French result for an English-titled project.

## Verification evidence

- Package UI: 24/24 mounted tests passed, including language independence, exact-name behavior, result provenance, saved handoffs and account boundaries.
- Persistence/API/store: 25/25 tests passed; save/project/client UI: 22/22 passed.
- Connector/OpenAPI: 13/13 passed; language/package handler: 9/9 passed. A final focused regression pass (3/3) covers corpus corrections and foreign-language generation from an English project title.
- The actual search request serializer passed its regression for all seven languages, interface-locale independence, AI-off behavior, and exact/general-search request compatibility.
- Language contract validation: 91 English-source dictionaries, zero key/placeholder mismatches. Focused ESLint checks passed.
- Final application and Node/API TypeScript checks both passed. `git diff --check` passed.
- Some initially parallel Vite SSR suites timed out during module loading on the resource-constrained local host. Focused serial reruns passed; the larger search-refinement suite remains unverified in this environment. No timeout is reported as a test pass.

## Deployed browser check

On preview `https://sajda-32arximdb-hypbit.vercel.app/name-packages`, a real guest search used Swedish interface text, the query `bageri`, French name language and AI disabled. It returned French-root candidates including `fourelan`, `fourrive`, `painelan` and `cuisineagile`, and displayed **Namnspråk: Franska**.

Changing the form selection to Swedish did not relabel those existing French results. A 390px browser viewport showed a usable native selector, wrapped helper text and no horizontal document overflow. No browser console errors were captured.

The React and full-flow verification skills guided checks of accepted-result provenance, stable save identities, exact-name preservation and account reset behavior.

## Scope and limits

- Preview deployment only; production has not been promoted.
- No new provider credentials, dependencies, live database migration, account creation, payment, email or Git push was performed for this change.
- Real signed-in persistence and live consented AI generation were not exercised; persistence/API behavior was verified with automated tests.
- Domain status remains time-dependent. Language choice does not verify social-handle registration, corporate-name availability or legal trademark clearance.

Final source-aligned preview: `https://sajda-meepmbilj-hypbit.vercel.app/name-packages`.

Vercel deployment `dpl_FLbzRsuy6XP1prmmzUaijct3eU5k` completed **READY**. The deployed build passed its 22 preview SEO/noindex checks and Vercel/Neon public-bundle boundary check. On this final preview, the selector again defaulted to English with Swedish interface text. A real guest search for `design studio` with Italian selected and AI off returned `telaluce`, `bottegadolce`, `disegnodolce` and other Italian-root candidates, with **Namnspråk: Italienska**. No console errors were captured. This release note was finalized locally after deployment; deployed application code matches the tested source.

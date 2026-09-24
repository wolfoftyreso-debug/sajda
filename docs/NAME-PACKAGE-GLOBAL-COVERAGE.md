# Country-aware name-package review

Updated 2026-09-13. This is a review-plan feature, not an automated global company-name or trademark clearance service.

## Implemented scope

38 selectable countries: the United States, all 27 EU members, Iceland, Liechtenstein, Norway, the United Kingdom, Switzerland, Canada, Australia, New Zealand, Singapore and Japan. The default is USA + EU (28 countries). EU is a preset expanded to country codes, not a corporate registry jurisdiction. Country selection does not follow browser language, infer incorporation country from a domain suffix, or change requested domain extensions.

The same versioned catalog (`shared/name-package-markets.ts`) supplies:

- Web/app name-package market presets and individual choices.
- A single expandable official-source review list for the result set.
- The private HTML export, including selected countries and source-catalog review dates.
- REST and MCP's strict `markets` request field and `market_coverage` response.

Selection stays in the current account-bound UI workspace; it is not persisted, sent to external registers, or added to URLs. Existing domain observation timestamps and scores do not change when countries change. The legacy domain generator is not being represented as a country-specific linguistic or legal engine.

## Evidence contract

`requested_markets` describes intended scope. `checked_markets` remains empty and `automated_checks_available` is false. Every company and trademark review path has `status: not_checked` and human-only source links. The catalog's `reviewed_on` date is not a check of any candidate name. The stable lexical entity ID is not an incorporated company's identity.

The existing package evidence percentage remains a domain/profile/category metric, not country coverage. Selecting more countries cannot add legal points or turn the readiness index into a clearance probability. Source pages may require language selection, login or further navigation, and may be temporarily unavailable.

USA company-name rules require the relevant state, not only a federal trademark search. EU company registers remain national; BRIS covers specified company forms, not every business name/right. Canada has province/territory coverage gaps. Japan's linked corporate-number directory has an English subset and does not approve company names. WIPO covers participating collections, not every right worldwide, and forbids automated querying of its public Global Brand Database.

See [official-source research](research/NAME-PACKAGE-MARKETS-2026-09-13.md) for source URLs, actual access models and restrictions. No company/trademark name queries, purchases, registrations, legal approvals or new database migrations are performed by this feature.

## API example

POST `/api/v1/public/name-packages` (or the authenticated equivalent `/api/v1/name-packages`), or call MCP `name_packages_search`:

```json
{
  "query": "logistics software",
  "tlds": ["com", "dev"],
  "platforms": ["github", "linkedin"],
  "markets": ["US", "SE", "DE"],
  "count": 10,
  "locale": "en"
}
```

Omitting `markets` uses USA + EU. Supplied selections must be nonempty, unique supported uppercase ISO country codes. `EU`, arbitrary countries, lowercase codes and duplicate selections are rejected rather than silently broadened. Response country order is catalog order, independent of input order. Existing limits and authorization remain in force; country count does not multiply external provider calls.

## Next substantive data work

Integrate permissioned national sources behind the same explicit jurisdiction contract, beginning with documented company data in the UK/Norway and candidate trademark APIs where access is available. Confirm credentials, commercial use, limits, retention, completeness and source scope first. Add timestamped collision observations per name and jurisdiction only once actual lookups occur. An empty search is never legal approval, and public portal availability is not permission to scrape it.

## Verification ledger

Verified locally:

- 59 combined catalog, API, projection, generated OpenAPI and real-SDK MCP tests passed.
- 18 UI/export tests passed, including account-switch reset, all five languages, unchanged scores/dates and no provider calls from market selection.
- App/Node and Vercel API type checks passed. Scoped lint and UI contracts passed; 81 English-source language dictionaries had zero key/placeholder mismatches. `git diff --check` passed.
- Real Edge browser with synthetic providers: 15 language/viewport combinations, 75 layout measurements, zero overflow/runtime errors or external requests. Market presets, expanded source sections, country-scoped report export, first search, stale evidence and recovery were exercised. Two initial local fixture startup/navigation attempts timed out on the busy host; the unchanged third run passed. This was not a real account, register lookup or physical iPhone test.

Vercel preview deployed READY: https://sajda-8wgymm6ai-hypbit.vercel.app (`dpl_GC2uVBrNcqnKccBgzxKE1unptefp`). Build and public-bundle/SEO preview guards passed. No production promotion or separate public-connector deployment was performed.

Deployed requests through authorized Vercel CLI access, without an app account:

- Public REST returned HTTP200 for `markets: [US,SE,DE]`; output preserved catalog order `[US,DE,SE]`, no checked markets, human-only official review paths. Trace `req_TFr8A8XfuY78ujWq`.
- Real MCP `tools/call` returned HTTP200/ok with the same market coverage and matching structured/text output. Trace `req_HVDpH42oMsDp4SxH`.
- Invalid pseudo-country `markets: [EU]` returned HTTP400 `invalid_request`, not a silently broadened search. Trace `req_5k5aCxszy8T455da`.

Both live valid requests observed `software.com` as taken. No available name, legal clearance, complete social identity or price was invented. Preview deployment protection is unchanged; the separate public connector host still requires its own release.

Runtime logs corroborated both successful request traces and the intentional400. Count-only completion events remained intact. The existing dependency `url.parse()` deprecation warning appeared on cold REST startup with HTTP200; it was not resolved by this country-scope feature. Browser screenshots were visually inspected at mobile width.

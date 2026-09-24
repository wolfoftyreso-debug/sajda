# Name lookup with Wikidata — 2026-09-13

## Recommendation and boundary

Use Wikidata for **name discovery and database-sourced public profiles**: enter a name, show candidate entities, let the user select the intended entity, then display attributed website/social assertions. This supports looking up arbitrary input names without requiring an initial self-assessment. It does not guarantee that every name has a record or that a returned entity is the intended company, brand, or person.

Keep this provider separate from user-reported ownership and independently verified control. A Wikidata assertion must not become `reported_owned`, `reported_authorized`, or verified ownership merely because the lookup succeeded. Missing data is unknown, not absence. A name lookup alone provides no justified IKEA score of 99.

Official API documentation, policies, and property definitions were reviewed. No name-query probes, social-site requests, scraping, ownership tests, or bulk downloads were performed in this research task.

## Minimal official request contract

Use the fixed HTTPS Action API endpoint `https://www.wikidata.org/w/api.php`, with GET and URL-encoded parameters. Do not accept an upstream host or arbitrary URL from the caller. [Wikibase API documentation](https://www.mediawiki.org/wiki/Wikibase/API/en).

| Operation | Parameters for a small adapter | Verified semantics |
| --- | --- | --- |
| Find candidates | `action=wbsearchentities`, `search=<name>`, `language=<allowed language>`, `uselang=<display language>`, `type=item`, `limit=5`, `format=json` | Searches labels and aliases, returning IDs and available labels/descriptions. `language` controls matching; `uselang` controls display language. The documented limit is 0–50; default 7. Search position is not an identity-confidence score. [Generated search documentation](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities). |
| Fetch selected profile | `action=wbgetentities`, `ids=<validated QID>`, `props=info\|labels\|descriptions\|claims`, `languages=<allowed language>\|en`, `format=json` | Pipe-separated entity IDs are supported, normally up to 50. Redirects resolve by default; preserve the canonical result ID. For this UI, one explicitly selected profile is sufficient. [Generated entity documentation](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities). |

For complete known-entity JSON, the official linked-data interface also supports `https://www.wikidata.org/wiki/Special:EntityData/<QID>.json`, including revision-specific retrieval and caching. The Action API keeps the minimal search/detail integration uniform; the linked-data route can be evaluated if entity retrieval performance requires it. Avoid SPARQL regex/fuzzy-name search: Wikidata directs that use case to search. [Data-access guidance](https://www.wikidata.org/wiki/Wikidata:Data_access).

## Field mapping and honest labels

| Property | Meaning and display | Do not infer |
| --- | --- | --- |
| [P856](https://www.wikidata.org/wiki/Property:P856) | “Website listed by Wikidata”; the property's own label is “official website”. Retain applicable language/jurisdiction qualifiers where present. | Live website availability, domain registrant, administrative access, or trademark ownership. |
| [P2002](https://www.wikidata.org/wiki/Property:P2002) | “X username listed by Wikidata”; the property supplies usernames and X/Twitter formatter patterns. | That the handle still exists, is controlled by the subject, or carries verified brand authorisation. |
| [P2003](https://www.wikidata.org/wiki/Property:P2003) | “Instagram username listed by Wikidata”. | Current Instagram access, account ownership, or platform verification. Do not infer a Threads account from this value. |
| [P4264](https://www.wikidata.org/wiki/Property:P4264) | “LinkedIn organisation ID listed by Wikidata”. This property covers company, school, organisation, and showcase pages, not only companies. | A personal profile, a universal numeric ID, or guaranteed correctness of a guessed `/company/` route for every page type. |

Recommended classification: `DATABASE_ASSERTION`, provider `WIKIDATA`, with `control_verified=false`. Any derived URL is a **constructed profile link**, not a successfully visited profile. Use code-owned, allowlisted platform URL templates and validated/encoded IDs; never execute arbitrary formatter URLs from upstream property data. Keep unsupported or ambiguous formats as text rather than inventing a working link.

## Statements, time, ambiguity, and coverage

- Parse structured statements, not rendered HTML. Retain the QID, statement ID, property, rank, relevant qualifiers, and a Wikidata source link. Handle value/unknown-value/no-value snaks explicitly; a non-value snak cannot produce a URL. [JSON data model](https://www.mediawiki.org/wiki/Wikibase/DataModel/JSON).
- Do not choose the first claim blindly. Exclude deprecated assertions from current suggestions; retain multiple eligible alternatives and their qualifiers. Normal rank is neutral about accuracy/currency, and preferred rank is not independent verification. Ended, future, or temporally ambiguous claims must not be labelled current. [Ranking](https://www.wikidata.org/wiki/Help:Ranking), [qualifiers](https://www.wikidata.org/wiki/Help:Qualifiers).
- Separate `fetched_at` from entity modification/revision metadata and statement/reference dates. A recent entity edit may concern another field; fetching today does not verify today's real-world ownership. Reference retrieval dates are not an administrative-control check.
- A selected QID is a chosen database identity, not legal entity resolution. Do not merge owner, brand, parent company, subsidiary, and franchisee records. Keep alternative candidates visible, including an option that none is the intended subject.
- No result means “no matching Wikidata item found in this bounded search”, not “the name is unused”. No P2003 means “not listed in this fetched profile”, not “Instagram available”. Do not derive national trademark rights, worldwide market presence, or a 38-country denominator from a profile's country or website fields.
- Wikidata is collaboratively edited and does not guarantee validity. A database-profile completeness measure, if ever added, must be named separately from an ownership/control index and must not reward well-documented brands as though documentation proved control. [General disclaimer](https://www.wikidata.org/wiki/Wikidata:General_disclaimer).

## Access, rate limiting, caching, and reuse

The application must use an informative User-Agent identifying its name/version and a **real operator contact URL or email**. Do not ship a placeholder contact or impersonate a browser. Browser integrations can supply `Api-User-Agent` where the browser controls `User-Agent`; a server adapter is preferable for central budgeting. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).

The current 2026 global policy lists 200 requests/minute for unauthenticated bots with a compliant User-Agent and 10/minute for unidentified clients. These limits are experimental/changeable, not capacity guarantees. The global guidance recommends at most three concurrent requests; Action API etiquette prefers serial calls. Honour `Retry-After` on 429/503; absent that header, wait at least five seconds or use exponential backoff. Do not evade limits with multiple agents or identities. [Global API limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits).

Use an operator-wide upstream budget, cache and single-flight deduplication in addition to Sajda's per-user/public quota. Cache name searches by normalised query plus language and profiles by canonical QID, requested language, and adapter version. Keep the original fetch/revision times when serving cached results. Select a bounded product TTL; do not invent a Wikimedia-mandated freshness interval. GET and caching are recommended for read traffic. [Action API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).

Noninteractive refresh jobs should use `maxlag=5` and back off on the API's lag error; interactive requests may omit it. Inspect API error bodies as well as HTTP status. A provider error, timeout, malformed/truncated response, or size cap must become unavailable/partial, never “no matches”. [Maxlag guidance](https://www.mediawiki.org/wiki/Manual:Maxlag_parameter), [Wikibase errors](https://www.mediawiki.org/wiki/Wikibase/API/en).

Structured Wikidata data is CC0; attribution is not required by that dedication but is requested as good practice. Display “Source: Wikidata” with the item/revision link, without implying Wikimedia endorsement. This does not grant blanket rights to Wikipedia article text, images, trademarks, or content behind external links; keep those outside this minimal adapter. [Wikidata data reuse](https://www.wikidata.org/wiki/Wikidata:Data_access).

## Implementation acceptance checks

Bound query/QID/language, result count, statement count, string sizes, response bytes, and request duration. Render labels/descriptions as text, validate outbound links, and never fetch claim/reference URLs. Search queries are sent to Wikimedia, so disclose the provider and do not log raw names or attach account identifiers/secrets to upstream requests.

Test ambiguous names, no results versus provider failure, missing/deleted/redirected entities, language fallback, multiple/preferred/deprecated/ended claims, invalid URLs/handles, cache re-aging, 429/503/maxlag handling, and oversized responses. Assert that every path leaves ownership/control verification unset and that importing suggestions cannot silently create self-reported ownership evidence.

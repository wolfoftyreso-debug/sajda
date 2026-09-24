# Existing-brand Sajda Index — sources and safeguards

Reviewed: 2026-09-13. Research scope: official IKEA organisational disclosures and a proposed scoring methodology. No trademark/company-register name queries, ownership challenges, account access, scraping, or bulk collection were performed. This is not a scored IKEA audit or legal opinion.

## Recommendation

An existing-brand index should reward evidenced, coherent brand presence within an explicit scope. It is a different objective from finding an unused new name, **not** `100 - name availability`: a taken domain or handle may belong to an unrelated party. IKEA is a useful structural example, not a justified hardcoded score of 99.

Use a brand-ecosystem subject with linked legal entities. Report presence, authorised operation, operational control, and trademark rights separately. An authorised franchisee can contribute to coherent brand presence without being the brand owner or a subsidiary of that owner.

## What IKEA's official sources establish

| Finding | Official source | Consequence for the index |
| --- | --- | --- |
| Inter IKEA Systems B.V. is the IKEA franchisor and owner of the IKEA Brand; other entities perform range and supply functions under agreements. | [Inter IKEA Group: business in brief](https://www.inter.ikea.com/en/this-is-inter-ikea-group/our-business-in-brief) | Identify the brand owner separately from product, supply, and retail operators. |
| Ingka Group operates sales channels through franchise agreements with Inter IKEA Systems B.V. Ingka and Inter IKEA Group have different owners and management. Franchisees receive rights to use IKEA trademarks and other IP for that purpose. | [Ingka: how we are organised](https://www.ingka.com/this-is-ingka-group/how-we-are-organised/) | A licence relationship is not shared corporate ownership. Do not merge both groups into one legal entity. |
| IKEA's public franchise diagram uses simplified company/group labels that are not necessarily the contracting franchisees' legal names. | [IKEA: one brand, many companies](https://www.ikea.com/us/en/this-is-ikea/about-us/one-brand-many-companies-pub0b23b310/) | A market/operator label needs a separately evidenced legal-entity mapping before it supports identity or rights claims. |
| Inter IKEA's privacy statement identifies certain central websites as owned by Inter IKEA Systems B.V., while explaining that linked country websites have franchisee operators and independent privacy policies. It separately identifies the Netherlands retail website operator. | [Inter IKEA privacy and cookie statement](https://www.inter.ikea.com/en/ikea-policies/privacy-and-cookie-statement) | Shared branding and even a shared domain do not establish one legal operator for every country page. A link supports association, not an administrative-control test. |
| Official terms attribute the IKEA name and related marks to Inter IKEA Systems B.V.; US website terms describe content rights as belonging to one or more IKEA entities. | [Official IKEA terms](https://jobs.ikea.com/en/terms), [IKEA US terms](https://www.ikea.com/us/en/customer-service/terms-conditions/) | Preserve the specific claimed owner and asset/right. These disclosures are not a current registry audit of every mark, class, territory, or licence. |

These first-party sources support an organisational model, not independent proof of every live account, domain registration, trademark registration, or franchise agreement. Avoid freezing a franchisee count from a general overview: disclosures can use different dates and groupings. Country-by-country conclusions require scoped evidence.

## Proposed anti-gaming safeguards

The following are methodology recommendations, not facts asserted by IKEA.

| Risk | Required safeguard |
| --- | --- |
| Cherry-picking easy markets or channels | Freeze a versioned scope and weighted requested slots before collecting evidence. Keep omitted, failed, and unknown slots in that scope. Label custom scopes; compare rankings only within the same scope. Always show country/channel counts alongside a score. |
| Scoring only successful lookups | Distinguish `verified_present`, `verified_controlled`, `authorised_operator`, `confirmed_absent`, `conflicting`, and `unknown`. An outage, empty weak search, unsupported source, or unexamined market is unknown, not absence. Do not renormalise weights over successful results. |
| Turning a small scope into a global claim | Require a predeclared minimum breadth and evidence coverage before publishing a headline rating. A perfect result for one country is a scoped result, not global 99. Show requested and evaluated breadth even when evidence coverage is high. |
| Same name, handle, logo, or URL being treated as ownership | Record these as discovery or consistency signals only. A guessed official URL, HTTP response, DNS record, redirect, logo, follower count, or matching handle does not prove the brand controls it. Even a demonstrated technical challenge proves a specific account's technical control, not trademark entitlement. |
| Public links overstating control | Store an explicit assertion such as `officially_linked` or `first_party_declared`, rather than silently upgrading it to `verified_controlled`. Keep legal owner, operational controller, and licence/authorisation relationship separate. |
| Company identity being substituted for IP rights | A corporate-register match supports entity identity within that register's scope. Trademark evidence additionally needs the mark/right, owner, territory, goods/services, status, and observation date. Domain registration and authorised retail presence do not substitute for trademark evidence. |
| Repeating evidence to inflate coverage | Deduplicate canonical asset IDs and slot keys. One global domain is one domain-control observation; its reuse across country pages is not many independent ownership proofs. A global account may satisfy predeclared shared-channel slots, but cannot manufacture local-market evidence. Do not reward duplicate URLs, aliases, or arbitrarily many low-value TLDs. |
| Old or fabricated “verified” evidence | Validate each observation's provenance and timestamp; reject future, malformed, or missing dates for freshness credit. Re-age after restore/export/recalculation. Never substitute response receipt or catalog-review dates. A client-provided URL, timestamp, or `verified` flag is an assertion, not trusted verification. |
| Weak sources overwhelming contradictory evidence | Cap repeated/correlated evidence and keep contradictions visible. Define source precedence and a dispute state; do not select whichever duplicate gives the highest score or let many low-quality signals outweigh a conflicting authoritative record. |
| Reputation leaking into the score | No brand-name exceptions, IKEA bonus, model-estimated fame, or hand-entered demonstration scores in production. A renamed input with identical evidence must produce the same score. Synthetic fixtures must be labelled and isolated from real reports. |

For every scored assertion retain the subject/entity, canonical asset and slot, market, relationship type, evidence method and provenance, upstream observation time, expiry, and any unresolved contradiction. Render the assertion strength in exports and machine output, not only in UI tooltips.

## Handling unknowns without inventing precision

At minimum, return a headline score only after a documented coverage gate; otherwise return `insufficient_evidence`, with observed strengths and missing checks. Unknown must not be described as poor real-world control.

One possible diagnostic for a strictly binary, fixed-weight component is an **evidence bound**, not a statistical confidence interval. With total requested weight `W`, verified qualifying weight `C`, and unresolved weight `U`, the proven lower bound is `100*C/W`, and the maximum still possible is `100*(C+U)/W`. Confirmed non-qualifying slots remain in `W` and outside `U`. This exposes why a single known success among many unknowns cannot support a confident 99. More complex graded components need their own published bounds rather than reusing this formula blindly.

Keep consistency, breadth, control evidence, and rights evidence distinguishable even if a later version combines them. Otherwise a famous brand can score well through visibility while the product silently claims ownership it never verified.

## Minimum adversarial tests

- Adding unknown slots cannot increase proven coverage or its lower bound; deleting failures cannot improve a fixed-scope report.
- Duplicate evidence, duplicate markets, equivalent URLs, or several paths on the same domain cannot multiply ownership credit.
- Changing only the subject's display name to IKEA cannot change the score.
- A matching third-party handle, a guessed official link, and a corporate-name match cannot become verified brand control or trademark rights.
- Stale, future-dated, malformed, missing-date, or restored observations cannot regain freshness from a newly generated envelope.
- An authorised franchisee can support ecosystem presence while retaining a different operator and owner; missing authorisation stays unresolved.
- Conflicting observations stay visible; a caller-supplied verification flag cannot cross the trusted-evidence boundary.

Any future register or platform connector requires its own access and reuse review. In particular, WIPO's public Global Brand Database prohibits automated querying; an existing-brand workflow is not an exception. [WIPO FAQ](https://www.wipo.int/en/web/global-brand-database/faqs_branddb), [WIPO terms](https://www.wipo.int/en/web/global-brand-database/terms_and_conditions).

# Search quality and verification

Last checked: 2026-09-08. This records implementation and local execution against real public providers. It does **not** claim a successful Vercel preview or production deployment.

## Changes

- Keep literal spelling when joining words; do not silently remove vowels. Reject obvious repeated compounds such as `guideguiden`.
- Normalize accented and Nordic Latin letters consistently, including `æ`, `ø`, and `ß`. Remove conversational stop words from reference input.
- Lead with the typed reference and meaningful multiword combinations. Group `getcoffee`, `mycoffee`, and `coffeeworks` into the same naming family so prefixes cannot crowd out other concepts.
- Expand common Swedish/English topics, including coast/ocean, coffee, consulting, hair salons, cleaning, shops, and pets.
- Respect explicit length, language and excluded-word constraints. In automatic mode a recognized English reference can select English vocabulary even when the interface is Swedish.
- Return `namingScore` and `rankingPosition` separately from commercial fields. The legacy `estimatedValue` is zero because no market valuation was performed; it must not be presented as a zero-dollar appraisal. The score is a spelling/length heuristic, not a purchase recommendation.
- Reject malformed or empty explicit-domain lists instead of silently replacing them with creative suggestions.
- Validate RDAP media type, coherent error bodies, and the exact domain in positive responses. Bound response bytes and abort slow responses. Stop launching normal-search registry work after the request budget.
- Honor upstream `429`/`Retry-After` with a per-instance registry cooldown. Google `.app` and `.dev` share the same endpoint and cooldown.
- Remove the local Internetstiftelsen WHOIS search-backend path and insecure `.nu` DAS path. `.se`/`.nu` stay unknown until a secure, approved availability connector is available.

The deployed API and historical local server share the normalization, spelling-score and RDAP-evidence helpers in `api/_shared/search-quality.mjs`. Their surrounding engines are still separate implementations; testing the actual Vercel handlers is therefore the preferred regression path.

## Repeatable regression suite

```sh
node --import tsx --test tests/search-quality.test.mjs
npm run check:vercel
npm run check:node
```

All **14 search-quality tests passed**, along with the Vercel TypeScript and Node syntax checks. The fixtures cover deterministic generation, uniqueness, extension distribution, topical diversity, exact/multiword references, Nordic/Latin normalization, Swedish constraints, automatic English language choice, non-monetary scores, malformed requests, JSON request shape, RDAP evidence, bounded bodies, national-registry fail-closed behavior, and cross-suffix rate-limit cooldowns.

Provider responses in these tests are controlled fixtures. They verify behavior under success and failure, not current registry status or delivery performance.

## Actual live checks

The opt-in script uses the same handler deployed by Vercel, running locally with synthetic/public test inputs:

```sh
node --import tsx scripts/probe-search-quality.mjs
```

| Probe | Domains | Observed handler time | Observation |
| --- | ---: | ---: | --- |
| Exact registry controls | 3 | 937 ms | `example.com` and `example.org` returned registered; synthetic `.com` returned registry-not-found. |
| Swedish coast theme | 8 | 295 ms | Registry responses received for all eight domains. |
| Swedish building-permit theme | 8 | 226 ms | Registry responses received for all eight domains. |
| Coffee theme | 8 | 256 ms | Six registry responses; two unknown after Google `.app` throttling. |
| Swedish hair-salon theme | 8 | 257 ms | Four registry responses; four unknown after Google `.app` throttling. |

Across this recorded run: **35 domains, 29 confirmed registry answers, 6 unknown**. These are one-run observations, not a latency benchmark or service-level guarantee. The observed throttling motivated the cooldown regression test; no unknown response was converted into “available”.

The exact-control run also exercised the real Loopia public price adapter. It returned verified **standard-TLD** registration prices, including SEK 161.25 for `.com` and SEK 323.75 for `.org` including VAT at that observation. Those amounts are time-sensitive source observations, not domain-specific checkout offers; a registered control domain cannot be bought for the standard registration price.

Separately, the historical local server was started on a temporary port and tested with an eight-result Swedish advanced-search request plus two exact domains. Length and exclusion constraints held, the registered `.com` control was identified, and `.se` returned unknown. The temporary process was stopped afterward.

## Evidence semantics and limitations

- RDAP `404` means the registry returned no matching registration. It does **not** guarantee registrability, absence of reserved/premium restrictions, or the final checkout price. Recheck with the chosen registrar before purchase. [RFC 7480 §5.3](https://www.rfc-editor.org/rfc/rfc7480.html#section-5.3) permits an empty negative-response body; this occurs in the live Verisign response and is intentionally supported.
- Positive RDAP responses must identify the requested domain object. [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083.html) defines the response objects. Sources are fixed, audited HTTPS endpoints, not arbitrary redirect targets.
- Public registry capacity is finite. The cooldown is per running instance, not a distributed upstream quota. A commercial high-volume service needs an approved registrar/registry integration with adequate capacity; a browser-local free-search flag does not provide that capacity or enforce paid entitlements.
- Internetstiftelsen distinguishes its WHOIS/contact service from Free/DAS. Its public documentation lists HTTP Free/DAS endpoints and a separate usage limit. Do not silently substitute WHOIS as a commercial search backend. [Official service terms](https://internetstiftelsen.se/domaner/registrera-ett-domannamn/regler-och-beskrivning-av-domannamnssokningar/).
- Most candidate generation is deterministic vocabulary and ranking logic, **not a semantic language model**. An optional configured OpenAI call can analyze an advanced brief; that does not establish availability, trademark clearance, market value, or naming suitability.
- The naming score measures length, vowel/consonant pattern and spelling complexity. It does not validate meaning, originality, spoken-language comprehension, company registration, trademark rights, or resale value. Human linguistic/brand review remains necessary.
- Non-Latin reference-only input is rejected with an explanatory message instead of receiving unrelated fallback suggestions. Broader name-language support remains future work; translated interface text is not evidence of equivalent generation quality in every language.
- `.se`/`.nu` need an approved secure connector, optional price-feed/provider credentials need separate verification, and deployed runtime behavior remains a separate release gate.

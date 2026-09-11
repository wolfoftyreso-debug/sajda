# Secure .se / .nu availability connector

Checked 2026-09-11. Status: **not connected**. Keep `.se` and `.nu` hidden from creative/Swipe suffix selection, and keep exact checks `unknown`, until a permitted HTTPS connector passes live verification. DNS absence, WHOIS/RDAP absence and stale zone data are not proof of registrability.

## Verified current state

- `api/domain-search.ts` deliberately disables IIS DAS. Internetstiftelsen's [official Free/DAS documentation](https://internetstiftelsen.se/domaner/registrera-ett-domannamn/regler-och-beskrivning-av-domannamnssokningar/) still publishes HTTP endpoints. Certificate-verified HTTPS attempts to `free.iis.se` and `free.iis.nu` failed from this environment. Do not bypass TLS verification or retry over cleartext.
- The same official page prohibits commercial reuse/search-engine backend use of its WHOIS/contact-search service. Do not scrape its public search UI as an API replacement.
- Relevant credentials were absent from local configuration, downloaded Vercel environment files, the process environment and the current `hypbit/sajda` Vercel environment inventory. Only configuration names/presence were relevant; no credentials belong in this document.
- The existing read-only Porkbun adapter is real, but the public [supported-TLD pricing response](https://api.porkbun.com/api/json/v3/pricing/get) contained neither `se` nor `nu` at this check. It is not a verified national-domain connector.

## Latest transport and UI check

Rechecked on 2026-09-11 with certificate verification enabled and redirects disabled: both documented DAS hosts return `ERR_TLS_CERT_ALTNAME_INVALID` over HTTPS. The presented certificate covers only `cardpayment.registry.se`, not either DAS hostname. A certificate for a different registry service is not permission to substitute that service or bypass hostname validation. The official Free/DAS documentation still lists HTTP only; no documented credentialless HTTPS replacement was found. Relevant registrar credentials remain absent from the current local and downloaded Vercel environment files and process environment; only names/presence were inspected.

The search extension selector now explains the unavailable checks before expansion, in all five interface languages. `.se`, `.nu` and `.io` remain excluded by the existing public capability list; `.io` also lacks an audited public HTTPS connector. A manual link opens [Internetstiftelsen's official .se/.nu search](https://internetstiftelsen.se/sok-doman/) in a new tab with no query parameters or referrer. The application does not automatically query that page, send the user's idea, or interpret manual results as verified availability.

## Preferred candidate: Openprovider

Openprovider documents a [HTTPS REST availability operation](https://support.openprovider.eu/hc/en-us/articles/360025299493-2-Domains-API-Check-Domain) and API registration support for [.se](https://support.openprovider.eu/hc/en-us/articles/360000750748--se) and [.nu](https://support.openprovider.eu/hc/en-us/articles/360000756528--nu). Its [developer site](https://developers.openprovider.com/) offers a free reseller account. No account, permission or successful authenticated availability call has been verified for Sajda.

Minimum operator steps:

1. Create or provide an active Openprovider reseller account. Confirm that Sajda's neutral public comparison/search service, anticipated generator volume and short-lived result cache are permitted. A provider account alone is not evidence of permission for every reuse.
2. Enable a separate API user with the narrowest available access. Store credentials as server-only Vercel Preview secrets, not in chat or frontend variables. Proposed names are `OPENPROVIDER_API_USERNAME` and `OPENPROVIDER_API_PASSWORD`; these are **not implemented configuration** yet. Review IP restrictions against Vercel's actual outbound setup without weakening an existing security policy.
3. Confirm the live API version and response schema. The newer [quick start](https://developer.openprovider.com/get-started.html) uses `/v1`; older reference material uses `/v1beta`. The marketing site's simulated examples are not a live contract test.
4. Implement a separate read-only adapter, then verify known unavailable/reserved names, a candidate checked live, malformed responses, rate limits, authentication failures and timeouts in deployed Preview. Enable frontend suffixes only after these checks pass.

[REST authentication](https://support.openprovider.eu/hc/en-us/articles/360019461160-How-to-secure-your-Openprovider-Account) uses username/password to obtain a bearer token; XML API password hashes do not work for REST. Cache tokens securely. Respect [published API limits](https://support.openprovider.eu/hc/en-us/articles/218390187-What-are-Openprovider-API-calls-limits) with shared Neon-backed rate limiting/backoff across Vercel workers. The [fair-use policy](https://www.openprovider.com/legal/fair-use-policy) disallows using the service for dropcatching: this connector must not silently become Trading's bulk dropcatch engine.

## Adapter boundary to implement after access exists

Return an exact-domain observation containing `domain`, `provider`, `method`, `checkedAt`, `expiresAt`, `status: available | unavailable | unknown` and a bounded reason code. A registrar's `unavailable` does not necessarily mean the domain is registered; it may be reserved or blocked. Do not relabel all such responses as registry-confirmed `taken`.

Use a fixed reviewed HTTPS endpoint, redirects disabled, strict request/response bounds, exact-domain matching, shared token/rate controls, timeout and fail-closed handling. Never request WHOIS, purchase, renew, transfer or change DNS. Keep registrar observations distinct from registry evidence. Price information, if later enabled, requires its own exact-domain quote contract: a wholesale account price is not automatically the public customer's final total.

## Alternative: Loopia, with important constraints

[LoopiaAPI](https://support.loopia.se/wiki/loopiaapi-innan-du-borjar/) provides HTTPS XML-RPC at `https://api.loopia.se/RPCSERV`; [`domainIsFree`](https://support.loopia.com/wiki/domainisfree/) explicitly checks registrability. However, the documented cap is **15 domain searches per minute**, unsuitable for Sajda's generator without a different approved arrangement. [Customer API terms](https://www.loopia.se/pdf/allmanna_villkor_api.pdf) cover the customer's own account, while [reseller API terms](https://www.loopia.se/pdf/allmanna_villkor_api_af.pdf) describe sales in Loopia's name and require an active reseller agreement. Obtain explicit permission for Sajda's neutral metasearch use before implementing.

# Sajda Developer API

## Top business-name recommendations

Use `POST /api/v1/public/business-names` without credentials, or
`POST /api/v1/business-names` with a scoped bearer key granting `domains:search`.
Both share the `business_names_recommend` MCP operation and existing package
engine. They implement requests such as “Sajda, suggest the top ten names for my
business,” without requiring the caller to construct a package search first.

```json
{
  "businessDescription": "An independent bakery making artisan bread for local families",
  "keywords": ["bread", "craft"],
  "nameLanguage": "fr",
  "locale": "en",
  "tlds": ["com", "se"],
  "count": 10
}
```

`businessDescription` is required (1–1000 characters). Optional `keywords`
accepts up to eight unique Latin-script phrases of at most 40 characters.
`count` is 1–10, default 10; omitted endings default to `com`, social platforms
to `instagram` and `linkedin`, and markets to the US plus all 27 EU countries.
The strict JSON body is limited to 6 KiB; unknown fields, including budgets,
AI consent, account IDs and caller-supplied evidence, are rejected.

`nameLanguage` selects generated names: `en`, `sv`, `fr`, `es`, `de`, `it`, `pt`;
English is the default. It is independent of the five-language `locale`
(`en`, `sv`, `es`, `fr`, `zh`) and market selection. Domain spellings use ASCII
transliteration. This option also exists on the package-search contract below;
it is not an extra field on the legacy domain-search contract.

The bounded deterministic heuristic considers the whole brief and exposes its
compressed interpretation. One package search checks at most ten candidate
labels across the selected endings. Recommendations are ranked by Sajda Brand
Index, name fit and naming heuristic; this is not an exhaustive market search.
Each recommendation requires at least one fresh authoritative observation of
an available requested domain. Preserve `requested_count`, `returned_count`,
`completeness` and `shortfall_reason`: fewer or zero results are valid. The full
`intelligence` retains taken and unknown candidates separately. Never pad the
recommendations with unchecked names.

Company names, trademarks and social registration are not cleared. Prices and
affordability are not assessed. A name is not reserved, purchased or saved, and
no third-party AI is invoked. Follow source dates and limitations in
`sajda.business-names.v1`; a Brand Index score is a derived readiness signal,
not ownership proof or legal advice. See [release status](AGENT-API-RELEASE.md)
for deployment evidence; source support does not update the separate public
connector host automatically.

## Name-first brand lookup

`POST /api/v1/public/brand-lookup` searches public Wikidata records by name, then
returns a selected entity profile. It is separate from name generation and the
self-assessment worksheet. The public `/brand-index` page uses this name-first
workflow; the worksheet is at `/brand-index/assessment`.

```json
{ "operation": "search", "query": "IKEA", "locale": "en" }
```

After reviewing the candidates and selecting the intended entity, request its
profile using the returned Wikidata ID:

```json
{ "operation": "profile", "entity_id": "Q54078", "locale": "en" }
```

The ID above illustrates the format; applications must use the user's selected
candidate, never assume that the first match or a recognized name is the right
entity. Search queries accept 1–100 Unicode characters. Entity IDs must be `Q`
followed by 1–12 digits with no leading zero. `locale` supports `en`, `sv`, `es`,
`fr`, `zh` and defaults to `en`; it does not identify a country or legal market.
Both operation branches reject unknown fields, including credentials, provider
URLs, verification claims and mixed search/profile parameters.

Wikidata assertions describe what the database reports, not independently
verified ownership, active registrations, platform availability or legal
clearance. A profile does not receive a brand strength or ownership score:
scores remain null. Missing assertions remain missing; related names and
database source URLs are not proof. No domain engine, registrar, AI, private
account state, save or purchase operation is invoked.

Send JSON up to 6 KiB (6,144 UTF-8 bytes), without Authorization or URL query
parameters. Responses use `no-store`, `noindex` and credential-free public CORS.
REST allows a best-effort 12 requests/minute per network address per instance.
Shared per-instance upstream capacity/backoff can also return `429`; respect
`Retry-After`. This is not a global/project rate guarantee. The adapter permits
one upstream request at a time, at least one second apart, up to 30/hour per
instance, with a shared cooldown. Bounded caches retain search results for five
minutes and profiles for fifteen minutes; retrieval timestamps do not advance
on cache hits.
`404` means the requested profile was not found; `503` means lookup failed, not
that a brand is absent. Errors never echo the query or upstream diagnostics.

The `brand_lookup` MCP tool exposes the same strict two-operation contract.
Public MCP needs no credentials; account MCP requires `domains:search` but uses
no domain-search quota. Existing MCP transport request limits and shared
upstream limits still apply. The tool is read-only and open-world because it
queries a public external database. Discover the full generated schemas in
`GET /api/openapi` and `tools/list`. Source support does not establish deployment
to the separately hosted public connector or approval by an AI platform.

## Existing-brand self-assessment

`POST /api/v1/public/brand-index` is a public, CPU-only calculator for an existing
brand's declared domain, social and market scope. It makes no external queries,
saves nothing and consumes no domain-search or provider quota. Send JSON up to
64 KiB (65,536 UTF-8 bytes), without Authorization or query parameters. Public
CORS does not permit credentials. Responses are `no-store` and `noindex`. A
best-effort per-instance request guard allows 120 requests/minute per network
address; a `429` includes `Retry-After`.

```json
{
  "brand_name": "Example Brand",
  "identity_label": "example",
  "primary_domain": "example.com",
  "domains": ["example.com"],
  "socials": [{ "platform": "github", "handle": "example" }],
  "markets": ["US"],
  "observations": []
}
```

This deliberately empty report returns `reported_score: null` and zero reported
coverage, not a guessed score. All provenance is `USER_SUPPLIED`; the index is
`SELF_ASSESSMENT`. `verified_score` and `confidence` are always null and verified
coverage is zero, including when a caller reports ownership of every target.
Observations refer only to declared `domain:example.com`,
`social:github:example` or `market:US` targets. Valid statuses are
`reported_owned`, `reported_authorized`, `matching_name_only`,
`reported_conflict` and `unknown`. Optional `reported_at` describes the user's
report, not a verification time. Optional public HTTPS `source_url` must omit
credentials, query and fragment, and is never fetched.

Scope is required: 1–20 unique registrable domains including the primary domain,
one handle per selected platform (1–6), and 1–38 unique supported ISO countries.
No locale, TLD or recognized brand name selects a country or provides evidence.
Up to 64 unique in-scope observations are allowed. A score requires at least 60%
weighted resolved report coverage and one current resolved report in each
category. Reports older than 30 days, future reports, missing dates, unknowns
and matching names alone do not meet this threshold. Neither a high score nor
a market report means independently verified ownership, legal clearance,
reputation, brand value or investment advice.

The same strict schema is exposed by `brand_index_assess` on public MCP (noauth)
and account MCP (`domains:search`; ordinary authenticated request quota only).
MCP retains its smaller 16 KiB JSON-RPC message cap. See `BrandIndexAssessmentRequest`
and `BrandIndexAssessmentResponse` in `/api/openapi`; versioned output is
`sajda.brand-presence-index.v1` / `brand-presence-1.0.0`. This source contract does
not imply deployment to any particular host or AI-platform approval.

## Name identity intelligence

`POST /api/v1/public/name-packages` accepts no key; the equivalent server-side
`POST /api/v1/name-packages` requires a persisted account key with
`domains:search`. These routes share the existing search quotas and non-AI
engine. A request has this shape:

```json
{
  "query": "European logistics software",
  "tlds": ["com", "dev"],
  "platforms": ["github", "linkedin"],
  "markets": ["US", "SE", "DE"],
  "count": 10,
  "locale": "en",
  "nameLanguage": "en"
}
```

The response includes a versioned methodology, stable lexical candidate IDs,
derived subscores, individual source observation dates and explicit unknowns.
It may return fewer than ten packages. No social lookup, company clearance,
trademark clearance, budget assessment or purchase is implied. Inspect
`NamePackageIntelligenceResponse` in `GET /api/openapi` and the
[trust contract](BRAND-IDENTITY-INTELLIGENCE.md).

`markets` is optional. Omission selects the United States and all 27 EU member
countries. An explicit selection must contain unique supported uppercase ISO
country codes from the published request schema, with at least one entry.
`"EU"` is a UI preset, not an API country code. `locale` only selects language;
neither it nor a domain ending determines the selected markets or a candidate's
country, which remains null.

The additive v1 `market_coverage` field includes its own `catalog_version`,
`requested_markets`, `checked_markets: []`, `automated_checks_available: false`
and manual company/trademark review sources for each selected market. Source
review dates describe the catalog, not a lookup of the proposed name. All
company/trademark checks remain `not_checked`. Scores and
`evidence_coverage_percent` retain their category-based method; they do not
measure completion of country checks. Selecting more markets adds no provider
calls, quota units or legal-score points.

Availability of these new routes on a main-project preview does not mean the
separate public connector host has been updated or approved by an AI platform.

Sajda publishes a small, no-key surface for modest public integrations and a
separate protected route for approved server-side use. They share the same
registry evidence model, but they are intentionally not the same product tier.

## Public API — available now

The stable public domain-search contract is:

```text
POST /api/v1/public/domains
Content-Type: application/json
```

No key, signup, billing flow, or browser credential is required. CORS is
enabled for JSON requests, but the endpoint accepts no cookies and deliberately
rejects an `Authorization` header. A protected key belongs only on a trusted
server and must use `/api/v1/domains` instead.

```sh
curl --request POST "https://YOUR-SAJDA-ORIGIN/api/v1/public/domains" \
  --header "Content-Type: application/json" \
  --data '{
    "query": "calm scheduling for small clinics",
    "tlds": ["com", "dev"],
    "count": 10,
    "locale": "en",
    "creativeMode": "medium"
  }'
```

The public v1 endpoint permits only this strict body schema:

| Field | Rule |
| --- | --- |
| `query` | Optional naming theme, maximum 100 characters. |
| `domains` | Optional list of 1–10 unique, fully-qualified domains using one of the selected audited TLDs. |
| `tlds` | Required list of 1–11 unique supported public TLDs: `com`, `net`, `org`, `app`, `dev`, `ai`, `xyz`, `info`, `biz`, `se`, `nu`. |
| `count` | Optional integer from 1–10; defaults to 10. |
| `locale` | Optional `en`, `sv`, `es`, `fr`, or `zh`; defaults to `en`. |
| `providers` | Optional list of public provider IDs; defaults to `loopia`. |
| `creativeMode` | Optional `light`, `medium`, `heavy`, or `deep`. |

Unknown body properties, missing/unsupported TLDs, duplicate values, and
non-JSON bodies return `400` or `415`; a body above 6 KiB returns `413`.
The public v1 API intentionally
does not accept Swipe, advanced brief analysis, arbitrary criteria, backend-only
providers, provider credentials, or URL/query-string API keys.

The endpoint shares a best-effort, in-memory **6 requests per IP per minute**
budget with Sajda's anonymous search product. It returns `X-Request-Id`,
`X-Sajda-Public-Api-Version`, `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on `429`.
Those limits protect a registry-facing public service; they are not a paid
plan, durable quota, service-level agreement, or usage ledger.

The following public read-only endpoints need no key as well:

```text
GET /api/openapi
GET /api/fact-signals?tld=com&limit=6
```

`/api/domain-search` remains Sajda's broader anonymous **product** endpoint.
It is CORS-enabled for the consumer search UI, but its advanced and Swipe
fields are not the stable public developer contract. New integrations should
use `/api/v1/public/domains`.

## Protected integration API — development and preview

> Neon-backed self-service keys are deployed and verified in development and
> protected preview. The production key migration has not been applied. This
> is not a production rollout or a purchasable API plan.

`POST /api/v1/domains` is a narrow, authenticated domain-search API for trusted server-side
integrations. It uses the same bounded candidate generator, authoritative
registry verification, and transparent provider comparison as Sajda's
anonymous search surface.

The Neon-backed control plane lets verified, signed-in Sajda users create,
list and revoke their own keys through the same-origin developer routes:

```text
GET    /api/developer/api-keys
POST   /api/developer/api-keys       { "name": "Preview service", "scopes": ["domains:search"], "expiresInDays": 90 }
DELETE /api/developer/api-keys?id=<key-uuid>
```

The browser control plane uses the genuine Sajda session cookie and matching
`X-Sajda-Account`; mutations require the same origin. An API key cannot manage
other keys. Native key management uses the authenticated native gateway, not
a fabricated browser cookie or origin.

`POST` returns a 256-bit opaque `sj_live_…` or `sj_test_…` key **once** as
`apiKey`. Copy it straight to the integration's trusted server. The dashboard
never persists the raw key in browser storage; later list responses show only
name, safe prefix, last four characters, scopes, environment, timestamps, and
revocation state. Keys expire after 90 days by default, with a 365-day maximum.
Sajda stores only a SHA-256 digest of the complete raw token in the server-only
Neon table `sajda.developer_api_keys`, protected by RLS with no browser policies.

Use a generated key with `domains:search` for `POST /api/v1/domains` or the
domain tools at `/api/mcp`. Other explicitly selected scopes enable the
documented [account API](./ACCOUNT-API.md) and [MCP tools](./MCP.md); they do not
grant paid membership or billing actions. Do not put a key in a frontend bundle,
source control, URL, analytics event, support ticket, or client-side environment
variable. The control-plane session is not an integration API key.

The machine-readable OpenAPI 3.1 document is available at:

```text
GET /api/openapi
```

The protected search endpoint is:

```text
POST /api/v1/domains
Authorization: Bearer <Sajda API key>
Content-Type: application/json
```

It uses the same strict body schema shown above.

Example:

```sh
curl --request POST "https://YOUR-SAJDA-ORIGIN/api/v1/domains" \
  --header "Authorization: Bearer $SAJDA_INTEGRATION_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "query": "quiet planning tools for teams",
    "tlds": ["com", "dev", "ai"],
    "count": 10,
    "locale": "en",
    "providers": ["loopia", "cloudflare", "spaceship"],
    "creativeMode": "medium"
  }'
```

A response can contain `available`, `taken`, or `unknown`. Only an
authoritative configured registry response can result in `available`; an
`unknown` result is never permission to register or buy a domain. Provider
prices remain separate from availability and are not a checkout quote.

## Required deployment configuration

Development and protected preview use the reviewed migrations under
`db/migrations/`, including `0013_developer_api_keys.sql`. Production migration
and rollout remain pending. Keep preview data isolated from production.
`DATABASE_URL` and `BETTER_AUTH_SECRET` are server-only; browser authentication
uses Sajda's same-origin `/api/auth` service backed by Neon. Do not publish
database credentials or configure a direct Neon browser auth endpoint.
Missing database/key storage fails closed rather than using an in-memory key
or quota fallback.

Before issuing keys with `projects:read`, `projects:write`, `social:check` or
`trading:write`, apply reviewed migration `0020_agent_product_scopes.sql` to the
intended environment. It expands the permitted scope constraint to eleven
values; it does not modify existing keys or grant them additional permissions.
New keys still default to `domains:search` only. Older code rejects stored keys
containing the new scopes: do not roll back code or the constraint blindly
after such keys are issued. Plan a compatible rollback or explicit key
replacement; never silently broaden existing credentials.

`SAJDA_API_KEY_HASHES` remains supported only as a server-only legacy fallback
for integrations that were provisioned before the database key flow. It
accepts comma- or newline-separated `client_id:sha256_hex` values and cannot
be created, listed, or revoked from the dashboard. It applies only to the
legacy protected domain-search route, never private account APIs or MCP. New
integrations should use a self-service key in a migrated environment.

## Shared account workspaces

Use a persisted bearer key with `GET` or `POST /api/v1/account?resource=...`.
The account comes only from that key. Project availability, verified email,
ownership, Trading entitlement and durable product limits remain enforced.

| Resource | Method and body | Required scope | Result |
| --- | --- | --- | --- |
| `name-projects` | `GET` | `projects:read` | Account-owned project list, including saved brand-package configurations. |
| `name-projects` | `POST {"project": ...}` | `projects:write` | Only the affected project in `projects`, never unrelated workspace records. |
| `social-profiles` | `POST {"handles": ["example"]}` | `social:check` | Up to five public GitHub profile observations. |
| `trading-scenarios` | `GET` | `trading:read` | Account-owned scenario journal; active Trading access required. |
| `trading-scenarios` | `POST {"scenario": ...}` | `trading:write` | Only the affected scenario in `scenarios`; active Trading access required. |

Project/scenario bodies use the published schemas, without an extra `action`
field. Use a stable UUID `id`, `expectedVersion: 0` for creation and the returned
version for updates. Retry the identical payload after an uncertain save;
version conflicts do not authorize overwrites. Saved-domain references must
already belong to the account. Write permissions do not imply list access.
Missing or ambiguous mutation receipts return a safe failure, since the write
may already have committed.

REST body ceilings are 32 KiB for projects, 16 KiB for scenarios and 4 KiB for
social checks; underlying product envelope/storage limits also apply. MCP
retains its 16 KiB complete JSON-RPC message limit. A GitHub `not_found`
observation does not prove registrability. Other social networks remain manual
review candidates. Scenario prices and probabilities remain user assumptions.

The current source catalogue contains 21 authenticated MCP tools and six public
tools; discover contracts using `tools/list` and `/api/openapi`. This is not a
claim of universal feature parity: billing, authentication, key management and
account deletion remain separate control-plane workflows, not agent tools.
Disabled legacy Supabase features are not exposed. Deep Review has its existing
product endpoint but no versioned REST/MCP operation; budget-aware
`domains_suggest` remains a public MCP tool without full versioned REST parity.
Swipe gestures and browser-local state are not a remote workspace contract.
Saved/watchlist items are snapshots, not an automatic-monitoring service.
Deep Review currently consumes client-supplied prior evidence; an authoritative
agent operation would require server-side rechecks before claiming verification.

## Limits and production boundary

Protected domain search allows **4 requests per account and environment per
minute**, shared across that owner's keys, REST `/api/v1/domains` and MCP domain
tools. Neon stores this fixed-minute bucket durably; changing keys, adapters
or Vercel instances does not reset it. REST returns:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix seconds)
- `Retry-After` on `429`
- `X-Request-Id` on every response

Key-backed API traffic also shares a **120 requests per account/environment
per minute** bucket. Key management has its own **20 requests per minute**
bucket and a maximum of **10 active keys per account/environment**. Expired or
revoked keys cannot authenticate. Storage failures return a safe error rather
than permitting unmetered requests.

These are durable rate limits, not monthly allowances, paid entitlements or a
billable usage ledger. The introductory search allowance remains browser-local;
durable free/account/monthly search quotas are not implemented. The anonymous
public API retains its separate best-effort per-IP limit described above.
Do not sell an SLA or paid API usage plan until usage metering, entitlements,
billing and operations controls are separately implemented. See
[API-PLATFORM.md](./API-PLATFORM.md).

## Local verification

The loopback QA server (`npm run serve:qa`, default port 8095) executes the real
Vercel handlers, including both developer search routes:

```text
http://127.0.0.1:8095/api/v1/public/domains
http://127.0.0.1:8095/api/v1/domains
```

The public route needs no key. Real key lifecycle tests require the development
Neon database, reviewed migrations and genuine verified account sessions.
The separate legacy full-app server's loopback-only, in-memory key harness is
not evidence of persistent-key or deployed Vercel behavior.
The anonymous `/api/local-search` route stays loopback-only and unauthenticated;
enabling a v1 key does not widen that local route.

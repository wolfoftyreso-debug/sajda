# Sajda remote MCP

Endpoint: `https://<your-sajda-host>/api/mcp`. Transport: MCP Streamable HTTP with JSON responses. The source server version is `1.5.0`; the official TypeScript SDK is pinned to `@modelcontextprotocol/sdk` **1.30.0**.

Public source version `1.6.0` advertises six tools; the authenticated catalogue
has 21. Both additionally expose two opt-in prompts and two static policy resources.
See [connector distribution](CONNECTOR-DISTRIBUTION.md) for the current release
and [earlier API release status](AGENT-API-RELEASE.md) for tested account boundaries.

`business_names_recommend` accepts a business description and returns up to ten
ranked recommendations, each backed by at least one fresh authoritative
available-domain observation. For example:

```json
{
  "businessDescription": "A bakery making artisan bread for local families",
  "nameLanguage": "sv",
  "locale": "en",
  "tlds": ["com", "se"],
  "count": 10
}
```

It is available on both MCP endpoints and through public/protected
`POST /api/v1/[public/]business-names`. Public access needs no key; private
access requires `domains:search`. A single bounded package search shares the
existing search quota. `nameLanguage` supports `en`, `sv`, `fr`, `es`, `de`,
`it`, `pt` and defaults to English, independently of the five-language
interface `locale`. The same naming-language option applies to
`name_packages_search`. Respect partial or empty results and their explicit
shortfall; never fill the list with unverified names. Scores are deterministic
heuristics, not legal clearance, company-name availability, social
registrability or valuation. Budgets are not assessed and no AI, save or
purchase is performed. See the [REST contract](API-V1.md#top-business-name-recommendations).

`brand_lookup` is the name-first entry for an existing brand:
send `{operation:"search", query:"IKEA"}`, review the returned candidates and
request `{operation:"profile", entity_id:"<selected Wikidata Q ID>"}`. Optional
`locale` defaults to `en`. The two strict branches reject mixed arguments,
caller source URLs, credentials and verification claims. Search/profile results
are database-sourced assertions, not verified ownership, availability, legal
clearance, reputation or valuation. Scores remain null. A matching name alone
does not select the intended entity or prove ownership.

This tool is read-only, non-destructive and open-world: it queries public
Wikidata through a bounded source adapter. It does not use the domain engine,
registrars, AI, account product state or domain-search quota. Ordinary MCP
request limits and shared upstream capacity/backoff apply. Respect retry hints;
an unavailable source does not mean an absent brand. See the
[lookup API contract](API-V1.md#name-first-brand-lookup). The separately deployed
public connector and AI-platform approval remain separate release concerns.

`brand_index_assess` remains an explicit self-report worksheet. This
existing-brand calculator accepts only a declared identity, selected domain,
social and country targets, and bounded user reports. It performs no external
query, database write, availability check, ownership verification or legal
clearance. `index.classification` stays `SELF_ASSESSMENT`; all provenance is
`USER_SUPPLIED` and `verified_score` is always null. Do not manufacture reports
or treat matching names, recognized brands or user-supplied URLs as proof.

Its annotations are read-only, non-destructive, idempotent and closed-world.
Account access requires `domains:search` and the usual request quota, but no
domain/provider quota. The public tool uses only the connector request guard.
MCP messages remain capped at 16 KiB; larger valid reports can use the 64 KiB
public REST calculator. Input/output versions, an empty-report example and
strict report rules are documented in [the API guide](API-V1.md#existing-brand-self-assessment).

The new `name_packages_search` tool shares the website's name-package scoring
method and requires `domains:search`. Public MCP exposes the same
read-only operation under the anonymous search budget. It accepts a query,
domain extensions, social platforms, optional markets and a bounded result count. Its declared
output schema separates observations, derived scores, freshness and unknowns.
See the [machine trust contract](BRAND-IDENTITY-INTELLIGENCE.md). This version
change does not upgrade protocol support or automatically update the separately
deployed public connector host.

For example, pass `markets: ["US", "SE", "DE"]`. Omission uses the United States
and all 27 EU countries; explicit markets must be unique supported uppercase
country codes from discovery. `"EU"` is not a valid code. Language and domain
endings never imply a market selection or a candidate country. The additive
`market_coverage` response has a versioned manual-source catalog, an empty
`checked_markets` array and `automated_checks_available: false`. Company and
trademark checks remain `not_checked`; scores and category evidence coverage do
not represent country clearance. Market selection triggers no additional lookup.

The implemented and tested negotiated protocol versions are **2025-11-25**, **2025-06-18**, and **2025-03-26**. The SDK's latest supported protocol is 2025-11-25. This does not claim support for a newer dated specification merely because the documentation website defaults to one. Unknown offered versions negotiate the SDK's supported version; an unsupported `MCP-Protocol-Version` request header is rejected.

## Connect

Create a scoped API key from the Sajda account that owns the saved domains and Trading membership. Keep the key in the MCP client's secret settings. Send `Authorization: Bearer <key>` on **every** request. Keys belong to one account and deployment environment, expire, and stop working after revocation or loss of a verified account.

This release supports MCP clients that can send a configured bearer header. It does **not** implement OAuth discovery, OAuth registration, or OAuth login for clients that require those flows. A browser session cookie and the legacy operator search key cannot authenticate this endpoint.

App-sign-in management is deliberately not an MCP tool or a public API-key
scope. It belongs to the account's web/native control panel; see
[account connections](ACCOUNT-APP-SESSIONS.md).

Example using the actual SDK client, with the key supplied through the host environment:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const key = process.env.SAJDA_API_KEY;
const endpoint = process.env.SAJDA_MCP_URL;
if (!key || !endpoint) throw new Error("Configure SAJDA_API_KEY and SAJDA_MCP_URL.");
const client = new Client({ name: "my-sajda-integration", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
}));
const { tools } = await client.listTools();
const report = await client.callTool({ name: "trading_report", arguments: { limit: 10 } });
await client.close();
```

Use HTTPS outside localhost. The deployment must configure its own trusted origin through `BETTER_AUTH_URL` and/or Vercel deployment metadata. Request hosts are validated; a supplied Origin must match that host's configured origin. Cross-origin CORS access is not enabled.

## Tools and scopes

`tools/list` publishes complete strict JSON input schemas, output schemas, scope metadata and MCP annotations. Listing tools never invokes a product handler or spends a search/Trading provider budget. All calls still require authentication and use the shared request rate limit.

| Tool | Scope | Effect |
| --- | --- | --- |
| `business_names_recommend` | `domains:search` | Rank up to ten business names backed by fresh available-domain evidence; explicit shortfall if fewer qualify. |
| `domains_check` | `domains:search` | Check 1–10 exact domains through the existing search engine. |
| `domains_search` | `domains:search` | Generate and check names with the documented search options. |
| `name_packages_search` | `domains:search` | Compare name candidates with versioned evidence and derived scores. |
| `brand_index_assess` | `domains:search` | Pure existing-brand self-assessment from supplied reports; no external verification or domain quota. |
| `brand_lookup` | `domains:search` | Search public brand records and inspect a selected Wikidata entity; database assertions are not ownership verification. |
| `account_membership` | `account:read` | Read current verified plan, capabilities and expiry. |
| `name_projects_list` | `projects:read` | Read naming projects and saved brand-package configurations. |
| `name_projects_save` | `projects:write` | Save one versioned project; return only its mutation receipt. |
| `social_profiles_check` | `social:check` | Observe up to five GitHub profiles; absence is not registrability. |
| `trading_scenarios_list` | `trading:read` | Read the scenario journal with active Trading access. |
| `trading_scenarios_save` | `trading:write` | Save one user-authored scenario; return only its mutation receipt. |
| `saved_domains_list` | `saved:read` | Read the account's saved list; follow `nextCursor`. |
| `saved_domains_save` | `saved:write` | Upsert one domain and its research snapshot. |
| `saved_domains_remove` | `saved:write` | Remove one saved domain, safely repeatable. |
| `trading_status` | `trading:read` | Read access and run status; no candidate body or provider work. |
| `trading_report` | `trading:read` | Read an existing report page; default 25, maximum 100 candidates. |
| `trading_start` | `trading:run` | Explicitly create/reuse a research run using a UUID `requestKey`. |
| `trading_advance` | `trading:run` | Explicitly advance one bounded batch for an existing `runId`. |
| `trading_stop` | `trading:run` | Cancel an owned run, including while the engine is paused. |
| `trading_refresh_quote` | `trading:quote` | Explicitly refresh a server-approved candidate's registrar observation. |

There are no payment, purchase, registration, reservation, or automatic buying tools. Trading scopes do not grant Trading membership; the same server-side membership, quota, kill-switch, candidate and ownership checks used by the website remain in force. Saved fields are research notes, not an authoritative quote. Domain results preserve unknown availability, evidence dates, price scope, and currency.

The four new permissions are opt-in. Apply migration
`0020_agent_product_scopes.sql` before issuing keys with `projects:read`,
`projects:write`, `social:check` or `trading:write`. Existing keys remain unchanged
and new keys still default to `domains:search`. Write does not imply list/read
access; `trading:run` does not authorize scenario writes. Older application
code cannot interpret keys containing new scopes, so coordinate rollback with
compatible readers or explicit key replacement rather than silently changing
grants.

Authentication, billing, account deletion and key management remain separate
control-plane workflows. Disabled legacy features are not exposed. Deep Review
does not yet have a versioned REST/MCP operation; the public budget-shortlist
tool `domains_suggest` has no equivalent versioned REST resource. Browser swipe
gestures are not themselves an API. These boundaries are deliberate, not a
claim that every page has become a remote tool.
Saved/watchlist snapshots do not enable automatic monitoring. The existing
Deep Review product consumes client-supplied prior evidence and must not be
presented as independently verified agent output without server-side rechecks.

## Requests, retries and failures

The endpoint accepts one JSON-RPC message per POST. Use `Content-Type: application/json` and `Accept: application/json, text/event-stream`. Successful requests return JSON; accepted notifications return HTTP 202 with no body. GET and DELETE return 405 because this server does not offer a standalone SSE stream or stateful sessions. Bodies are bounded to 16 KiB. There is no `MCP-Session-Id`, no process-local account session, no background run started by initialization, and no SSE replay cursor.

Ordinary tool results include matching text and `structuredContent`:

```json
{"ok":true,"status":200,"requestId":"req_...","data":{"accountId":"...","membership":{}}}
```

Product failures return `isError: true` and an error envelope with the original HTTP status, stable product code, safe message and optional `retryAfterSeconds`. For example, missing scope is status 403 with `insufficient_scope`; provider unavailability remains 503. Protocol errors use JSON-RPC errors: malformed JSON `-32700`, invalid messages `-32600`, unknown methods `-32601`, and unknown tools or invalid arguments `-32602`. HTTP authentication failures are 401 with a bearer challenge. Revocation is checked on every subsequent call, even after successful initialization.

Start and quote tools require a caller-generated UUID `requestKey`. **Reuse the exact same key after a timeout or uncertain response.** Quote keys are bound to account, run and domain; attempting another candidate with that key returns a conflict. Their existing durable product stores own replay handling. MCP request IDs only correlate messages and do not provide business idempotency. Repeated save/remove operations are idempotent by account and domain. `trading_advance` may perform additional work on each call and is explicitly marked non-idempotent; inspect status after an uncertain response. Status/report reads do not advance work.

Project/scenario saves accept `{project: ...}` or `{scenario: ...}` with a stable
UUID `id` and `expectedVersion` (zero to create; current version to update).
Retry the identical payload after an uncertain response. Conflicts require a
fresh read, not a blind overwrite. Successful saves return a one-element
`projects` or `scenarios` receipt, never the entire private collection. The
same operations are available at `/api/v1/account` resources `name-projects`,
`social-profiles` and `trading-scenarios`. REST permits larger project bodies
(32 KiB) but MCP's complete message still cannot exceed 16 KiB. Product storage
and envelope limits also apply. The website's project feature flag, verified
email, account ownership and provider budgets are unchanged.

The common request limit is 120 requests/minute across an account's keys and protocols. Exact and creative searches additionally share the account's 4 searches/minute quota. Existing saved-domain and Trading limits still apply. Report offsets refer to the current report snapshot; use its run identity when presenting pages and restart pagination if the completed report changes.

## Implementation and verification

`api/mcp.ts` uses the official SDK `Server` and `StreamableHTTPServerTransport`. A fresh server and transport are created for every request, suitable for Vercel's stateless functions. The product executor imports the real website handlers. A private WeakMap delegates an already-authenticated principal internally, then the account handler verifies the current user; no fabricated cookie, Origin, or user-supplied account ID is used. Scope mappings and input validation are shared with the [account REST endpoint](ACCOUNT-API.md).

Run `npx tsx --test tests/mcp-server.test.ts tests/account-api.test.ts`. The MCP suite uses a real local HTTP server and the official SDK client/transport. It verifies initialization, dated negotiation, schema discovery, protocol/media errors, origin rejection, scopes, real handler dispatch, account isolation, passive reads and preservation of idempotency keys. Persistence/provider fixtures are explicitly labelled; these tests do not claim to have contacted a live registrar or production database. The existing account, API-key, saved-domain and Trading store/PostgreSQL tests cover their underlying data boundaries.

Official references: [versioned Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [versioned tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), and [TypeScript SDK 1.x](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).

### Deployed integration evidence

The 2026-09-10 protected Vercel preview was tested against its actual development
Neon database using the official SDK client: account/key lifecycle and passive
MCP reads passed, followed by a separate REST → MCP → browser saved-domain
write/read/update/remove check. The latter used one explicitly synthetic
`.invalid` fixture and confirmed cleanup without changing pre-existing saves.
The final preview also passed the opt-in exact-domain test: two real checks of
`example.com` (one REST, one MCP) returned authoritative taken status. The final
run passed 58 checkpoints, followed by 43 saved-data checkpoints. No creative
AI generation, Trading run, manual Trading quote refresh or purchase was performed.
See the [release evidence and remaining limits](RELEASE-2026-09-10.md).

`scripts/test-developer-live.mjs` is an explicit development-only probe.
`scripts/test-developer-saved-live.mjs` additionally requires
`SAJDA_QA_SAVED_MUTATIONS=true`. Both require `SAJDA_DEVELOPER_LIVE_TEST=true`,
an existing verified QA account supplied through environment secrets, and an
explicitly approved development origin. Never run them against production.
`scripts/test-developer-vercel.mjs` reuses the authenticated operator CLI for a
protected preview; it runs the saved-data probe only when the extra flag is set.
This transport does not establish external MCP connectivity or remove Vercel's
deployment protection. No protection-bypass credential belongs in client setup.

The baseline probe can also opt into `SAJDA_QA_EXACT_SEARCH=true`. This adds
`domains:search` and performs exactly two known-domain checks of `example.com`,
one via REST and one via MCP. It requires authoritative registry evidence and
uses real registry/price sources, but never creative AI generation, Trading,
registration or billing. Leave the flag unset for the no-provider baseline.

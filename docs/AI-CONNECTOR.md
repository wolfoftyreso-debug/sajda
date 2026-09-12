# Sajda AI connector

Status as of 2026-09-12 (Europe/Stockholm): **1.1.0 is deployed with live Cloudflare exact pricing verified**. An anonymous SDK request for ten names within USD 30 for the first year checked a 120-name reserve and returned **10 confirmed exact offers, 0 provisional ideas and no shortfall**, stopping at `target_reached`. This is one successful, dated provider-backed search, not a guarantee of ten matches for every brief or a final tax-inclusive checkout total.

The most recent full local `npm run check` recorded 1,370 passed, 0 failed and 7 skipped tests (1,377 total); that full suite was not rerun for this configuration/deployment step. The current step passed 24 scoped local tests. The release includes the host-seed contract correction for ASCII DNS labels of 1–63 characters and an exact-provider timeout covering both fetch and response-body reading. Local regressions, live SDK/provider observations and host-model behavior remain distinct evidence. No ChatGPT, Claude or Grok host-model evaluation, directory submission or approval has been completed.

The public MCP endpoint helps a founder move from an idea to a budget-aware domain shortlist, recheck selected names, and open a registrar to decide whether to buy. Registration and payment happen separately at the registrar. The connector cannot purchase, reserve, save, or register a domain, and it cannot read Sajda accounts, private search history, saved names, or Trading data.

## Endpoint and authentication

Paste this live public connector URL into a compatible client, with no authentication:

```text
https://sajda-connector.vercel.app/api/mcp/public
```

The [public setup page](https://sajda-connector.vercel.app) includes the endpoint and host setup links. For scripts that use an origin variable, set `SAJDA_ORIGIN=https://sajda-connector.vercel.app`, without a trailing slash. Use this stable production alias, not a generated deployment URL or the main Sajda site. Never include protection-bypass secrets in the URL or client instructions.

| Host / endpoint | Purpose | Authentication |
| --- | --- | --- |
| `sajda-connector.vercel.app/api/mcp/public` | Two bounded public discovery tools | None; omit `Authorization`, API keys, and account credentials |
| Main Sajda deployment: `/api/mcp` | Existing private account integration, not deployed on the connector host | Scoped Sajda API key in a bearer header; not OAuth |
| `sajda-connector.vercel.app/api/mcp` | No private integration exists on this host | 404; do not send a private key here |

The public endpoint rejects an `Authorization` header. It does not create an account principal or forward cookies, account headers, or caller credentials to the search engine. Connecting it does not link a Sajda account. Private client setup and existing private integration evidence are documented separately in [MCP.md](MCP.md). The dedicated release has one function and no private account/database/payment/AI-provider modules. Version 1.1 permits only its dedicated server-side Cloudflare quote credentials, configured by the operator as described below; public users still provide no credentials. The main Sajda deployment and its protection are outside this release.

Transport is stateless MCP Streamable HTTP with JSON responses. Send one JSON-RPC message per `POST`, using `Content-Type: application/json` and `Accept: application/json, text/event-stream`. There is no standalone SSE stream or session ID; `GET` and `DELETE` return 405. `OPTIONS` supports the configured browser origins. Normal MCP clients perform initialization and tool discovery before calling tools.

## Public tool contract

`tools/list` is the machine-readable source of truth for input and output schemas. Both tools declare `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true`, and `securitySchemes: [{ "type": "noauth" }]`. Discovery does not run a domain search.

| Tool | Inputs | Result |
| --- | --- | --- |
| `domains_suggest` | Required project `query` and explicit `budget`; optional `candidateSeeds`, `tlds`, `count`, `locale` | Confirmed exact-domain budget offers in `items`; at most ten separate, explicitly provisional ideas in `provisionalItems` |
| `domains_check` | `domains`: 1–10 unique exact names; optional `locale` | Availability observations and registrar price evidence for those names |

For `domains_suggest`:

- `query`: 1–100 characters describing the project in ordinary words, without full domain names, domain lists, or URLs, including reference sites. Use `domains_check` for exact names and `tlds` for preferred endings. This validation prevents a brief from switching the engine into its separate exact-list mode.
- `candidateSeeds`: optional 1–30 ASCII DNS name labels of 1–63 characters suggested by the host assistant, without extensions, URLs, whitespace or punycode. Internal hyphens and digits are permitted by this contract; labels are lowercased and deduplicated. Prefer distinctive, short, pronounceable ideas. Generic or nonsensical labels can fail the quality screen, and ranking does not guarantee inclusion. Seeds are naming ideas, never availability or price evidence.
- `count`: 1–10, default 10.
- `tlds`: unique supported extensions; default `com`, `dev`, `app`.
- `locale`: `en`, `sv`, `es`, `fr`, or `zh`; default `en`.
- `budget.amount`: positive amount, at most 100,000, in increments of 0.01.
- `budget.currency`: `USD`, `EUR`, `GBP`, or `SEK`.
- `budget.period`: `first_year` or `annual_renewal`.

The budget is per domain, not a total for buying every result. Ask for missing amount, currency, or period before suggesting. A renewal budget does not constrain the initial registration cost or guarantee future renewal terms.

Both tools support `com`, `net`, `org`, `app`, `dev`, `ai`, `xyz`, `info`, `biz`, `se`, and `nu`. Exact checks accept ordinary ASCII domain names with these endings, not URLs, paths, wildcard names, or subdomains. The current provider selection is Loopia, Porkbun, Namecheap, and Cloudflare; this is bounded coverage, not every registrar.

Example tool arguments, to be passed through an MCP client:

```json
{
  "query": "A calm planning app for independent founders",
  "candidateSeeds": ["Quietagenda", "Solopace", "Dayharbor"],
  "tlds": ["com", "app"],
  "count": 10,
  "locale": "en",
  "budget": { "amount": 25, "currency": "USD", "period": "first_year" }
}
```

An exact follow-up uses the actual names selected from the result:

```json
{ "domains": ["example.com"], "locale": "en" }
```

`example.com` is an illustrative exact check, not a recommendation or availability claim. An exact check does not apply a budget filter; preserve the evidence and compare the relevant price period before describing it as a budget match.

## Interpret the evidence

Successful calls return an `ok`, `requestId`, and `data` envelope in both text and `structuredContent`. In 1.1, `items` contains **only** `confirmed_exact_offer` results. `returnedCount = confirmedCount = items.length`, and `shortfall = requestedCount - confirmedCount`. `complete` requires the requested number of confirmed exact offers; `partial` has fewer and `empty` has none.

`provisionalItems` contains at most ten `conditional_tld_estimate` ideas. `provisionalCount` and its compatibility alias `conditionalCount` count only that separate collection. Provisional ideas never enter `items`, reduce `shortfall`, make the status `complete`, or terminate the refill loop. For example, ten provisional ideas and zero exact offers means `returnedCount: 0`, `confirmedCount: 0`, `shortfall: 10`, `status: "empty"` for a ten-name request. Explain `exclusions`, `warnings` and `search.stopReason`; do not merge the two collections into a claimed successful shortlist.

| Evidence | What the assistant can say |
| --- | --- |
| `conditional_tld_estimate` in `provisionalItems` | Optional unconfirmed idea only. The registry observation and published extension price do not establish this name's exact price; premium pricing or registration conditions may differ. Do not count it as a budget match. |
| `confirmed_exact_offer` | A recent registrar observation for this exact name met the price comparison. Preserve its observation/expiry dates and caveats; it is not a reservation or guaranteed final total. |
| Taken, unknown, stale, missing price, or over budget | Exclude from an eligible suggestion shortlist. Exact checks retain unknown and taken states. Explain a shortfall instead of inventing names or prices. |

Keep native currency, first-year versus renewal amount, tax treatment, fees, source URLs, and observation dates visible. Reference conversions use dated ECB evidence, not a payment exchange rate or a registrar quote. If a needed conversion is unavailable, do not invent a rate. A published extension estimate must remain conditional even after conversion. Registry-not-found evidence also does not establish trademark clearance or that a registrar will sell the name.

## Connect in a host app

Official platform guidance was checked on 2026-09-11. UI labels, account access, and workspace policies can change. These are setup instructions awaiting Sajda host testing, not a claim of universal availability.

### ChatGPT

For developer testing, open Settings → Security and login → Developer mode, if the account and workspace allow it. Open ChatGPT Plugins, use the plus button, supply the Sajda name/description, and set the connection URL to the live public endpoint above. Review the discovered tools, then enable the connection in a new conversation. After metadata changes, refresh the connection and retest. This developer connection does not publish a directory listing. See [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Use no authentication for this endpoint. OpenAI documents `noauth` for anonymous tools. The private Sajda bearer-key endpoint is not a ChatGPT OAuth integration; do not paste its API key into public setup. See [OpenAI's authentication guide](https://developers.openai.com/plugins/build/auth).

### Claude

Individual users can open Customize → Connectors → Add custom connector and enter the public endpoint, using no sign-in. Free, Pro, and Max support custom connectors; Free is limited to one. Team and Enterprise owners first add the connector in Organization settings → Connectors, then members connect and enable it for conversations. The remote server must be reachable from Anthropic infrastructure, including when the user runs Desktop or mobile. See [Claude's setup guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Claude supports Streamable HTTP and authless servers. Account-specific OAuth and fixed-header credentials are separate modes; this Sajda endpoint needs neither. See [supported transports](https://claude.com/docs/connectors/building) and [authentication](https://claude.com/docs/connectors/building/authentication).

The [public setup page](https://sajda-connector.vercel.app) includes a button that prefills Claude's custom-connector form with the name and percent-encoded public URL. The user still confirms; the form/host flow remains untested for this release. Directory approval is a separate distribution step. See the [documented install-link format](https://claude.com/docs/connectors/building/directory-vs-custom).

### Grok

On [grok.com/connectors](https://grok.com/connectors), select New Connector → Custom and enter the public endpoint. It requires no Sajda sign-in. Grok's official guide describes custom MCP connectors for all Grok users; organization administrators must provision them first for Business/Enterprise. See [consumer connectors](https://docs.x.ai/grok/connectors) and [organization setup](https://docs.x.ai/grok/connector-management). Initial Sajda verification must use the documented web route; this guide does not claim that mobile or Grok in X setup has been tested.

Grok requires a publicly reachable server and documents both Streamable HTTP and SSE. No private or localhost address works directly. See [network requirements](https://docs.x.ai/grok/connectors/custom-mcp-tunneling).

### Developer APIs and other clients

An API integration is configured by the application developer and does not install a connector in a consumer account. Claude's Messages API has a remote MCP connector with Streamable HTTP/SSE and tool-call support; xAI exposes remote MCP through its SDK, Responses API, and Speech-to-Speech API. The public endpoint needs no bearer token. xAI's `require_approval` and `connector_id` request options are not supported. See [Claude API](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) and [xAI API](https://docs.x.ai/developers/tools/remote-mcp).

Other clients need remote Streamable HTTP and anonymous tool support. Verify initialization, tool discovery, calls, and model behavior in each before adding a compatibility claim.

## Data, limits, and operations

The public tools use Sajda's non-AI naming/search path; they do not invoke third-party AI generation. The host assistant can contribute `candidateSeeds` under its own service terms. Sajda receives tool arguments, and registry/registrar services receive domain queries needed for checks and price evidence. No account history is exposed through these tools. Do not include confidential project details that are unnecessary to search.

One suggestion builds a deterministic reserve of up to 120 distinct names, balancing selected extensions and several naming directions. The local semantic lexicon targets English and Swedish; an unsupported or context-free brief can yield fewer or no candidates. Host seeds retain the public ASCII DNS-label contract, receive a separate generic/nonsense screen, and carry explicit attribution; generated labels normally use the stricter 6–20-character naming screen. Naming scores are spelling/relevance heuristics, not valuations.

The reserve consumes **one** anonymous engine allowance, not one per name. Registry work has a 22-second admission deadline. Fresh registry-not-found candidates then enter at most six Cloudflare quote batches of at most 20 names each, refilling until the requested number of exact budget matches is reached or the reserve/work/provider limit stops the run. No new quote batch starts after 45 seconds from tool start; the final already-started check may use its eight-second timeout, shared by fetch and response-body reading. These limits bound work, not promise 120 completed checks or ten matches. `search` records pool size, registry/quote checks, batches and stop reason. Missing exact credentials stops with `exact_pricing_not_configured`, not a fabricated successful shortlist.

Search calls share the existing anonymous engine allowance of 6 searches per minute per IP per warm process. MCP requests, including metadata, have an additional bounded 120-per-minute per-IP process-local guard. These are best-effort abuse controls: different serverless processes do not share their memory, and clients behind a common host IP may share a bucket. They are not an account entitlement, a durable monthly quota, or a paid API plan.

Respect HTTP `Retry-After` and tool `retryAfterSeconds` values. Report provider failures or rate limits honestly, and do not compensate with unverified suggestions or repeated automatic calls. Read-only status does not make calls costless or exempt them from provider limits.

## Cloudflare operator setup — production configured, not public-user authentication

The adapter calls only Cloudflare's official `POST /accounts/{account_id}/registrar/domain-check`, never registration, DNS modification, reservation or payment. Its reviewed response handling excludes premium/unregistrable names and requires domain-bound registration and renewal pricing. The five-minute `expiresAt` is Sajda's evidence freshness limit, not a Cloudflare price lock. See [Cloudflare's check contract](https://developers.cloudflare.com/api/resources/registrar/methods/check/).

Cloudflare's [Registrar API guide](https://developers.cloudflare.com/registrar/registrar-api/), reviewed on 2026-09-11, specifies **Registrar write** permission for its broader workflow. In contrast, the single-account `Registrar: Domains Read` token below empirically succeeded for Sajda's live check-only request. This evidence applies to this account/endpoint and does not establish a universal permission guarantee or authorize registration. Keep the tested least-privilege scope; do not silently broaden it. A token limited to an account is not necessarily an *account-owned API token*: Cloudflare's [support table](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/) listed Registrar as unsupported for the latter when reviewed. Provider/account access must be verified during setup, not inferred from owning an account.

Current setup evidence: after user approval, exactly one token named `Sajda connector registrar checks` was created for the intended single account, with `Registrar: Domains Read` and expiry `2026-12-01`. The two values below were stored as Secret, production-only environment variables in the isolated `sajda-connector` project. No token, account identifier or account email is included in this document, repository or chat. The subsequent anonymous live search successfully received exact Cloudflare price observations. Preview credentials were not configured by this step; public users still authenticate neither to Sajda nor to Cloudflare.

Store only these operator-managed values in the **dedicated `sajda-connector` Vercel project's server environment**, scoped to the environments explicitly being released/tested:

- `SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID`
- `SAJDA_CONNECTOR_CLOUDFLARE_TOKEN`

Use Vercel's secret environment input; never paste the token in chat, command arguments, a URL, the public client, a frontend-prefixed variable, source control or staged release files. Do not copy the main Sajda environment or attach a team-wide credential set. Token scope and expiry remain operator security considerations. Billing/registration agreements or other new commitments are not part of this setup; escalate if provider access requires them. After any configuration change and authorized deployment, repeat a real anonymous MCP search plus a live exact-check response review. Public `noauth` remains unchanged.

## Current 1.1 live exact-price release evidence

The isolated connector production deployment `dpl_Dw2S6r563rWbpfifvtbiJ4gaGiQR` is READY at `https://sajda-connector-ro5cgxdng-hypbit.vercel.app`; clients continue to use the unchanged stable public alias. The main Sajda application was not deployed by this step.

An anonymous SDK probe exited 0. For the calm-planning-app brief and ten-name USD 30 `first_year` budget, it generated a pool of 120, performed 120 registry checks and 14 exact quote checks in one batch, and returned `confirmedCount: 10`, `returnedCount: 10`, `provisionalCount: 0`, `shortfall: 0`, `status: "complete"`, `search.stopReason: "target_reached"`.

All ten offers came from `cloudflare` with `dataSource: "official_provider_api"`, independent registry-not-found RDAP evidence and an exact Cloudflare available response. Native USD registration/renewal observations ranged from 10.46 to 14.20 per name; each name had the same observed registration and annual renewal amount. They were checked at `2026-09-11T23:17:17.361Z` (2026-09-12 01:17 CEST) and assigned `expiresAt: 2026-09-11T23:22:17.361Z`. That five-minute freshness boundary is local evidence handling, **not a price lock**. Tax status was unknown. See the ten-name evidence table in [CONNECTOR-EVALS.md](CONNECTOR-EVALS.md).

The exact follow-up returned `example.com` as taken at `2026-09-11T23:17:17.631Z`. A second anonymous SDK probe with the same brief and a USD 0.01 budget exited 0 with no confirmed offers, shortfall 10 and `candidate_pool_exhausted`: 120 registry checks, 14 quote checks in one batch, 106 unavailable exclusions and 14 over-budget exclusions. It did not pad the shortlist.

Final anonymous isolation checks on the new deployment returned root 200 without `Set-Cookie`, with `noindex`; `/api/auth`, `/api/account/membership` and `/api/mcp` each returned 404 without `Set-Cookie`, with `noindex`. The latest immutable production URL remained 302 to Vercel SSO. No automation bypass was created in this configuration/release step. There is no current authentication/configuration blocker for the tested public path.

Nothing was bought, reserved or trademark-cleared. These observations verify one successful exact-price search, honest low-budget failure and current route boundaries, not a live multi-batch refill, host-app model behavior or future availability. Normal price freshness, unknown tax and provider coverage limitations remain.

## Historical 1.1 pre-credential release evidence

The isolated `sajda-connector` project (`prj_ZyWiT77gZEULbBCF8Bale2nhEZyv`) released server version `1.1.0` on 2026-09-11. The main Sajda application was not changed by this deployment.

| Check | Recorded result |
| --- | --- |
| Preview | READY; `dpl_55GDX2WtXZaCKbt4GhKzfL17R7kJ`, `https://sajda-connector-kp4q68p4v-hypbit.vercel.app`; initialization verified through the Vercel CLI operator bypass, not anonymously |
| Production | READY; `dpl_EkJqsJAshy8rnVsLtPYAAxAsbpdN`, generated URL `https://sajda-connector-eopnl2ut2-hypbit.vercel.app`; clients still use the stable public alias above |
| Anonymous SDK | Initialization, discovery of the two public tools, suggestion and exact check succeeded on the stable alias |
| Suggestion | Calm planning app for independent founders; requested 10, USD 30 per domain for `first_year`; pool 120, registry checks 120, quote checks 0, returned/confirmed 0, provisional 10, shortfall 10, stop `exact_pricing_not_configured` |
| Provisional evidence | Examples `calmtask.dev`, `calmagenda.com`, `indiepace.com`, with registry observations around `2026-09-11T16:56:03Z`; all ten provisional results used Loopia published pricing plus ECB reference conversion, not exact-domain checkout quotes |
| Exact check | `example.com` returned `taken` from `verisign-rdap`, checked at `2026-09-11T16:56:10.823Z` |
| Browser | Public setup page displays the updated candidate-reserve explanation |
| Cleanup and boundaries | Only the QA auto-bypass created at 16:55 was revoked; no other credentials were affected. Protection remains `prod_deployment_urls_and_all_previews`. After cleanup, anonymous root returned 200 with no cookie and `noindex`; `/api/account/membership`, `/api/auth`, and `/api/mcp` each returned 404 without cookies; the immutable production URL remained 302 to Vercel SSO. |

These dated observations verify the deployment, anonymous protocol and registry/provisional path, not live Cloudflare pricing, successful exact-price refill, host-model behavior or ten budget matches. Availability and prices can change. Detailed acceptance boundaries are retained in [CONNECTOR-EVALS.md](CONNECTOR-EVALS.md).

## Historical 1.0 deployment and release evidence

The historical deployment was `dpl_BU1nmvfwgfQaQJmfTpnAN4BhqRd3` in project `sajda-connector` (`prj_ZyWiT77gZEULbBCF8Bale2nhEZyv`), server version `1.0.0`. Its generated address, `https://sajda-connector-9l5oy5tvs-hypbit.vercel.app`, was protected and must not be used as the client URL. This is historical evidence, not a 1.1 deployment claim.

On 2026-09-11, anonymous 1.0 SDK probes initialized, listed only the two public tools, and called them against the stable alias using real external providers. The old response to a ten-name USD 30 first-year request reported 3 conditional candidates, 0 exact offers, and a shortfall of 7; it used Loopia SEK prices and dated ECB conversion. **That historical count is not valid under 1.1:** with the same evidence, confirmed/returned would be 0 and shortfall 10, with the three ideas separate. This probe never established ten budget matches. An exact `example.com` check returned `taken` from `verisign-rdap` at `2026-09-11T15:20:29.675Z`. These are time-specific observations, not current prices or availability. See [CONNECTOR-EVALS.md](CONNECTOR-EVALS.md).

Anonymous HTTP probes confirmed the setup page returned 200 without `Set-Cookie`, while `/api/account/membership`, `/api/auth`, and `/api/mcp` returned 404 on the connector host. The generated deployment address and the original Sajda protected-site probe redirected to Vercel SSO (302). Project environment inspection returned zero configured variables and no linked shared variables.

## Repeat the isolated release safely

Use the repository's `scripts/build-public-connector.mjs`, not the main site's build or existing `.vercel/output`. It bundles `infra/public-connector/entry.ts` into one Node 24 function plus small static setup/404/robots files in `tmp/public-connector-release`. The builder checks private dependencies, replaces the AI gateway with a fail-closed stub, and rejects unreviewed staged files, including `.env` files. Build Output API function directories and version-3 configuration are documented by [Vercel](https://vercel.com/docs/build-output-api/primitives).

For an authorized redeployment, with Vercel CLI 59.14.0 available as `vercel`, run the following from the repository root. These are operator instructions, not an automatic deployment step:

```powershell
node scripts/build-public-connector.mjs
vercel link --yes --project sajda-connector --scope hypbit --cwd tmp/public-connector-release
```

Before upload, verify the staged `.vercel/project.json` has exactly the dedicated project ID above, not the main Sajda project. CLI 59.14.0 created `tmp/public-connector-release/.env.local` containing `VERCEL_OIDC_TOKEN` during this release's link step; it was removed without reading or displaying the secret. Remove that exact staging file if linking creates it again, then rerun the builder so its allowlist passes. Stop if any other unexpected credential file appears. Do not copy, upload, print, or commit credential contents. Do not use `vercel pull` to populate this release with the main site's environment.

```powershell
if (Test-Path -LiteralPath './tmp/public-connector-release/.env.local') {
  Remove-Item -LiteralPath './tmp/public-connector-release/.env.local'
}
node scripts/build-public-connector.mjs
vercel project protection sajda-connector --json --scope hypbit
vercel deploy --prebuilt --prod --project sajda-connector --scope hypbit --cwd tmp/public-connector-release
```

The release gate is Vercel Authentication with Standard Protection (`ssoProtection.deploymentType: prod_deployment_urls_and_all_previews`), no unrelated environment variables or linked shared credentials, and the reviewed stage only. Version 1.1's only optional provider credential allowance is the two dedicated server-side Cloudflare variables above; zero configured credentials must remain a supported fail-closed state. Inspect names and scope without exposing values. If protection differs, stop and correct the dedicated project only; do not disable protection on the main site or team. Standard Protection keeps the production alias public and previews/generated deployment addresses protected. The CLI command to configure it, when authorized, is `vercel project protection enable sajda-connector --sso --scope hypbit`. See [Vercel's protection settings](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) and [CLI protection commands](https://vercel.com/docs/cli/project).

Never pass `--public`: that option exposes deployment source at `/_src`; it is not the anonymous-access switch. Deploy only with `--prebuilt` from the dedicated stage, then repeat anonymous SDK and route-isolation probes on the stable alias. A Vercel CLI-authenticated or bypassed request is not anonymous evidence. See [Vercel deploy](https://vercel.com/docs/cli/deploy).

## Deployment and submission checklist

- [x] Historical 1.0: deploy a dedicated stable HTTPS endpoint and verify anonymous access without operator/protection-bypass credentials.
- [x] Historical 1.0: run MCP initialization, discovery, and both public tools with real providers; these probes did not establish an exact-price shortlist.
- [x] Historical pre-credential 1.1: verify anonymous SDK discovery/both tools and the honest `exact_pricing_not_configured` stop; this earlier result did not establish ten exact matches.
- [x] Revoke only the temporary QA auto-bypass and recheck anonymous public access, private-route isolation and unchanged deployment protection.
- [x] Configure the approved single-account Read token as two production-only Secret variables; verify a live anonymous search with ten exact Cloudflare offers within the selected budget, no provisional padding and no purchases.
- [ ] Exercise optional host seeds and successful multi-batch exact-price refill against the live provider; the recorded successful search reached its target in one batch, and local fixtures do not establish these additional live outcomes.
- [ ] Complete and retain the full deployed validation, origin-policy, rate-limit, and provider-failure regression matrix after release changes; the successful live probes above do not establish every failure case.
- [ ] Run [CONNECTOR-EVALS.md](CONNECTOR-EVALS.md) in each advertised host and record actual transcripts/results. Protocol tests alone are not host-model tests.
- [ ] Publish accurate website, support, privacy, and terms pages describing search data, provider sharing, retention, and the absence of purchase/account functionality.
- [ ] For OpenAI public distribution, use a verified developer/business identity and a submitter with Apps Management write access. Verify control of the MCP domain, provide accurate tool annotations and metadata, and supply five positive and three negative cases. A remote MCP-only submission is supported; UI is optional.
- [ ] Submit for review only with final evidence and truthful attestations. Submission does not approve or publish the connector automatically; publish from the portal after approval. No directory submission or approval has been performed for this public endpoint.

OpenAI's [submission requirements](https://developers.openai.com/plugins/deploy/submission) define the final distribution process. Do not advertise Sajda as listed or reviewed until that separate process has completed.

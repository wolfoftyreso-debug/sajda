# Agent API extension — release evidence

Date: 2026-09-17. Status: **public MCP released; main API verified on preview**.

## Implemented source

- Public and authenticated `POST /api/v1/[public/]business-names`, sharing
  `business_names_recommend` on both MCP surfaces. A business description can
  request up to ten ranked names with Sajda Brand Index and dated domain
  evidence. Output preserves partial/empty results rather than inventing ten.
- Independent `nameLanguage`: English default, plus Swedish, French, Spanish,
  German, Italian and Portuguese. Interface `locale` remains separate.
- Authenticated naming-project read/save, GitHub profile checks and Trading
  scenario read/save through REST account resources and MCP. Same underlying
  web handlers, account ownership, verified email, feature/plan gates, quotas
  and optimistic concurrency.
- Source catalogues: 21 private tools (`1.4.0`) and six public tools (`1.5.0`).
- Four opt-in permissions: `projects:read`, `projects:write`, `social:check`,
  `trading:write`. UI and server share the eleven-scope catalogue. New keys
  still default only to `domains:search`; existing keys gain nothing.
- Project/scenario write receipts contain only the affected record. This fixes
  the discovered possibility of a write-only credential receiving the full
  private collection from a reused web handler.

Recommendation generation is bounded and deterministic, with no third-party
AI. Each recommendation requires at least one fresh authoritative observation
of an available requested domain. Other endings may be taken or unknown.
Company names, trademarks and social registration are not cleared; price and
budget are not assessed. GitHub profile absence is not registrability. Scores
are derived heuristics, not ownership proof, valuation or legal advice.

## Database rollout

Migration `0020_agent_product_scopes.sql` must be applied to the intended
environment before issuing keys with the new permissions. It changes only
the scope allow-list constraint; it does not update existing credentials or
weaken RLS. Applying a migration is not evidence of live API-key issuance.

Rollback must account for keys containing new scopes: older application code
rejects them, and the old database constraint cannot accept their stored values.
Use a compatible rollback or explicit key replacement plan. Do not rewrite
historical migrations or silently grant/revoke permissions.

Migration applied using `.vercel/.env.preview.runtime.local` (VERCEL_ENV preview,
Neon host verified). Follow-up database check: 21 migrations applied, none pending.
No existing keys or stored account data were updated by this constraint migration.

## Local verification

Recorded for this increment:

- `tests/agent-api-permissions.test.ts`: **5/5 passed**. Shared catalogue,
  unchanged defaults, explicit opt-in, precise operation scopes, old-key
  rejection at the product boundary and additive migration constraints.
- Focused ESLint for that test: **passed**. Owned-file whitespace check: passed.
- API/MCP parity and regression group: release coordinator reports **43/43
  passed**, including the **7/7** new parity tests covering write-only mutation
  receipts and public recommendation calls through the real local MCP SDK.
- Business-name engine group: release coordinator reports **20/20 passed**.
- Consolidated engine/API/MCP/OpenAPI/guide suite: **77/77 passed**.
- Developer-key and native-auth regressions: **25/25 passed**.
- Isolated public-connector artifact build/SDK test: **1/1 passed**, zero private dependencies.
- App and server TypeScript: passed. Focused ESLint and whitespace checks: passed.
- Language contracts: 91 dictionaries, zero key/placeholder mismatches.

Local provider/store fixtures are not live registrar, database or external
AI-client evidence. No result here establishes production readiness by itself.

## Deployment verification

- Main-project preview: `https://sajda-4dxu4wnbm-hypbit.vercel.app`,
  `dpl_8hTLYiaU7qr6s5dDgkcSUsA7Ymnh`, READY. The earlier preview
  `dpl_5EeV4uDZDMYK6cz15QtwPXPYb8Bn` was also tested before a copy correction.
- Both previews passed real REST and MCP searches: French logistics brief
  returned five recommendations; Swedish returned six. Both reported partial
  results accurately and retained dated available-domain evidence. Capabilities
  and OpenAPI returned 200; invalid input 400; unauthenticated private requests 401.
- Browser: developer guide heading, expanded request example, added scope labels
  and final protocol copy were inspected on deployed previews.
- Live account-key creation, project/scenario persistence and provider checks:
  **not established by the tests above**.
- Production/main-site promotion: **not recorded**.
- Stable isolated connector released as `dpl_g1P8U9JS4RLgBJMVzJR4yhgzXjkq`.
  Anonymous initialize returned 1.5.0; actual SDK discovery returned all six
  public tools. Anonymous French logistics recommendation returned five fresh
  available .com observations and five taken candidates, not ten fabricated results.
  An earlier bakery brief returned no qualifying names: this bounded ten-candidate
  strategy does not guarantee ten recommendations and needs broader refill research.
- Anonymous root returned 200; auth, account membership and private MCP returned
  404 without cookies. Immutable production URL still returned 302 to protection.
  Dedicated stage has no database, account or payment code. Protection and existing
  provider credentials were not changed. Previous production rollback reference:
  `dpl_Dw2S6r563rWbpfifvtbiJ4gaGiQR`.
- No 5xx entries were returned by deployment-scoped Vercel log queries for the
  final preview or connector during verification. Earlier preview logs contained
  Node DEP0169 deprecation warnings; their dependency origin remains untraced.
- ChatGPT/Claude/Grok installation, host behavior and directory approval:
  **not verified**.

## Remaining intentional boundaries

Billing, authentication, deletion and key management stay in controlled
web/native account workflows. No agent tool makes purchases or reservations.
Disabled Supabase history/daily-list features are not exported as functioning
Neon APIs. Deep Review has no versioned REST/MCP operation, and the public
budget-shortlist tool has no equivalent versioned REST resource. Swipe UI
gestures and browser-local state are not remote API operations.
Saved/watchlist data are snapshots, not automatic monitoring. The current
Deep Review product accepts client-supplied prior evidence; independent agent
verification requires a server-checked contract before that feature is exposed.

The main application was not promoted to production. Private key issuance and
successful authenticated project/scenario writes were tested with local fixtures,
not a real deployed customer key. No ChatGPT, Claude or Grok host-model run was performed.

See [API-V1.md](API-V1.md), [MCP.md](MCP.md) and
[AI-CONNECTOR.md](AI-CONNECTOR.md) for contracts and deployment distinctions.

## Result clarity follow-up

The release above exposed machine-readable completeness, but that alone was
not a sufficient user explanation. A person asking for ten names must not
receive six names presented as an unexplained "Top 10".

The follow-up contract requires a localized `result_summary` before the list:
the requested and delivered counts, the shortfall, what was actually assessed,
why candidates did not qualify, and practical next steps. The display language
is `locale` (English, Swedish, French, Spanish or Chinese), independently of
the requested naming language. Known-taken names must remain separate from
unknown, stale or missing observations. A candidate with one taken ending and
another unresolved ending is unresolved, not confirmed unavailable everywhere.

Counts describe this bounded candidate pool, not all names on the internet.
A smaller requested result limit does not turn otherwise eligible candidates
into failures. No explanation may invent provider outages, legal clearance,
additional completed searches, exact-price checks or automatic retries.

REST consumers and MCP clients must present the summary and next steps with
partial or empty recommendations. The service supplying that explanation is
not proof that every external AI host displayed it; ChatGPT/Claude/Grok host
presentation must be verified separately. Deployment and test evidence for
this follow-up are recorded only after those checks actually run.

Local follow-up evidence: `business-name-clarity`, `business-names`,
`agent-product-openapi` and `mcp-documentation` passed **22/22 tests**.
Focused ESLint passed for both edited test files. These checks include all five
explanation locales; six of ten with separate taken/unconfirmed reasons;
mixed-ending, stale, missing and zero-result cases; a complete smaller request;
generation shortfall; and rejection of altered explanations or duplicate
upstream candidates. The checked-in OpenAPI artifact was regenerated from the
same response validator and now requires `result_summary`. These fixture tests
do not establish fresh registrar observations or external AI-host presentation.

### Verified clarity release — 2026-09-17

- Main preview: `https://sajda-mi2q7c9wm-hypbit.vercel.app`,
  `dpl_9c3EoCUgxBZAkKYgTHCKiMPjrFh6`, READY. No main production promotion.
- Public connector: `https://sajda-connector.vercel.app/api/mcp/public`,
  production `dpl_3FTtA3Brr5Jz7hBat48vupN2Z4vh`, READY; public MCP 1.5.1.
  Previous connector production rollback: `dpl_g1P8U9JS4RLgBJMVzJR4yhgzXjkq`.
  No protection, credentials, DNS, database, prices or account settings changed.
- Final combined result-clarity/engine/API/MCP/OpenAPI/UI regression: **87/87**.
  Isolated connector artifact test: **1/1**, zero private dependencies.
  App/server typecheck, Vercel function types, focused lint and whitespace checks passed.
  Language contracts: **92** dictionaries, zero key/placeholder mismatches.
- Browser fixture: **20** viewport/language combinations and **103** layout checks,
  zero overflow/runtime errors. A six-package/four-available fixture visibly explains
  both counts and registered versus unresolved candidates; the recovery button opens
  the real editor without submitting another search. Exact searches do not invent a
  ten-name target. Failed searches distinguish retained results from the latest attempt.
  First cold fixture startup timed out during dependency optimization; the repeat
  completed. Browser evidence uses synthetic providers/accounts, not a live customer.
- Deployed main REST returned **5/10**, with the reason five requested .com domains
  were registered. Deployed public MCP returned **6/10** for Swedish names, with the
  localized explanation of four registered candidates as its **first text block**.
  Full machine JSON and structuredContent are retained. Auth failures remain 401
  and invalid input 400. The deployed NamePackages chunk includes the summary.
- Anonymous stable-connector SDK test returned **5/10** with that explicit explanation
  before JSON; no credentials, cookies or protection bypass. Public isolation checks
  remain root 200, private/auth/account endpoints 404 without cookies.
- A separate live budget search reached **10/10** exact-price offers through Cloudflare
  after 120 registry checks and 14 price checks; summary accurately said complete.
  Price freshness, unknown taxes and non-reservation caveats remain attached.
  Known-registered `example.com` returned taken. No domains were purchased or reserved.
  This successful search is not a guarantee that every brief can return ten matches.
- Deployment-scoped 5xx queries returned no entries during this verification window.
  ChatGPT/Claude/Grok host presentation and installation are still not verified.

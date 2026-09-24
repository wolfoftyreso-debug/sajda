# Sajda Brand Identity Intelligence

## Implemented scope

Sajda's website and machine interfaces share the name-package scoring engine. A new
`name_packages_search` MCP tool and public/scoped REST routes provide bounded
non-AI discovery with inspectable evidence. This is name-candidate research, not a
completed identity registration, legal clearance or investment recommendation.
PIOTRR and Wavult are not modified by this implementation.

Existing brands now have a **separate** scoped model at `/brand-index`, with
`POST /api/v1/public/brand-index` and the `brand_index_assess` MCP tool. It measures
current self-reported control/authorized use and identity consistency, not new-name
availability. The existing-brand `reported_score` is explicitly a self-assessment;
`verified_score` is always null until an independent evidence path exists.
See [the existing-brand methodology](EXISTING-BRAND-INDEX.md) for fixed-scope rules,
coverage thresholds, freshness, limitations and current-turn verification.

| Surface | Entry | Authorization |
| --- | --- | --- |
| Website / bundled app | `/name-packages` | Existing product account rules |
| Public REST | `POST /api/v1/public/name-packages` | No key; shared anonymous search budget |
| Server REST | `POST /api/v1/name-packages` | Persisted account API key, `domains:search` |
| Public MCP | `/api/mcp/public` → `name_packages_search` | No key; same anonymous budget |
| Account MCP | `/api/mcp` → `name_packages_search` | Persisted account API key, `domains:search` |

Public deployment protection and third-party connector approval are separate from
these application contracts. A protected preview is not a publicly installable connector.

## Machine trust contract

The market-selection extension accepts optional `markets` such as
`["US", "SE", "DE"]`; omission selects the US and all EU27 countries. It adds
`market_coverage` to the v1 response, with a separate source-catalog version,
requested markets, no checked markets, and explicit manual company/trademark
review sources. A catalog source review date is not evidence about a candidate
name. All legal evidence remains `not_checked`; `country` remains null, and
`evidence_coverage_percent` remains a category metric rather than country-check
completion. Market selection adds no score points or provider calls. The dated
preview verification below predates this extension and does not verify it.

- `schema_version` versions the response structure; `methodology_version` identifies
  the shared deterministic scoring rules.
- `generated_at` describes response assembly, not source verification.
- Evidence retains individual source observation dates and an explicit freshness
  classification. Missing evidence remains unknown.
- `verified_at` and numeric confidence are null where no independent verification
  or calibrated confidence estimate exists. A high score is not a probability.
- `entity_id` identifies a canonical name label, not a registered legal company.
  Equal labels can refer to unrelated businesses. Package scores also depend on
  requested extensions, platforms, supplied naming scores and dated evidence.
- `canonical_url` is null until durable object retrieval is implemented. This
  response must not pretend that a package can be fetched by ID later.
- `evidence_id` names a stable signal slot, not an immutable stored observation.
  Keep its observation date with it; later responses can describe changed evidence.
- Derived scores and observed registry facts are separated. Company/trademark
  approval and social registration eligibility are not inferred from domain status.
- Unknown price is not zero. This capability does not assess budget; use the
  existing budget-aware `domains_suggest` separately and retain its exact-offer
  versus provisional-price distinction.

The method currently allocates 40 points to heuristic name/format fit, 30 to
current available domains, 20 to social clearance and 5 each to company and
trademark clearance. The last three receive zero until substantiated. Therefore
the current attainable ceiling is **70/100**, before profile-conflict deductions.
It does not assess semantic uniqueness, market demand, pronunciation or legal safety.

## Read → reason → act

The new tool searches once through the existing bounded domain engine. It does
not multiply provider calls to fill ten packages. Fewer packages and unchecked
selected extensions are explicit. No third-party AI, social-provider lookup,
company-register request, account creation, reservation or purchase is hidden
inside this operation.

Machine actions are limited to the existing `domains_check` tool; manual profile
links are labeled as manual review. Saving a domain remains a separate,
account-scoped `saved_domains_save` action. No automatic registration or purchase.
Supported automated rechecks are split into at most ten domains per call.
The existing `.se`/`.nu` DAS verification is disabled because its configured
transport is HTTP-only; selecting those endings does not guarantee a known status.

## Minimal machine-consumption telemetry

Successful package operations emit one best-effort structured completion event.
It contains requested/returned counts, domain evidence slots, fresh and unknown
domain counts, missing legal-check counts, method/schema versions and a server
trace ID. It contains no name, domain, query, brief, account ID or source payload.
The private REST response exposes the product trace in `X-Request-Id`; MCP puts
it in its existing result envelope. Logging failure cannot fail a completed search.
This is runtime instrumentation, not a unique-agent or conversion dashboard.

## Next increments, deliberately not claimed as implemented

1. Durable, owner-scoped package snapshots and retrieval/history with immutable
   evidence IDs and a retention/account-deletion policy.
2. Licensed corporate and trademark sources with jurisdiction, query coverage,
   source records and false-negative limitations.
3. Approved social-platform integrations; no 404-to-available inference.
4. Reproducible semantic/collision models with versioned features and measured
   calibration, rather than invented certainty.
5. Agent consumption metrics tied to meaningful outcomes. Request counts do not
   prove unique agent clients, citation attribution or successful user decisions.

## Sources and compatibility

The installed MCP SDK and transport compatibility remain the source of tested
protocol support. No protocol upgrade or platform-directory listing is implied.
Machine responses use declared output schemas and structured content with a
matching text representation, following the
[MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
Legal and platform-source boundaries are documented in [Name packages](NAME-PACKAGES.md).

## Verification

Verified 2026-09-13:

- 124 combined package/API/MCP/privacy/deployment regression tests passed.
  After completion telemetry was integrated, 32 targeted API/MCP/schema/metrics
  tests passed again, including five new privacy-safe logging tests.
- Application/node typechecking, Vercel API typechecking, targeted ESLint,
  schema-generation drift checks and UI contracts passed. Language contracts
  counted 80 English-reference dictionaries with no key/placeholder mismatch.
- Headless Edge fixture rerun passed 15 size/language combinations and 45
  layout checks with zero runtime errors or overflow. Synthetic scenarios cover
  stale/restored evidence, missing selected extensions, profile conflict/404,
  export and search recovery. The first attempt timed out while the local
  dependency optimizer was warming; no product or test timeout was relaxed.
- Vercel preview
  [sajda-6u5azg6ji-hypbit.vercel.app](https://sajda-6u5azg6ji-hypbit.vercel.app)
  is READY: `dpl_9Z3JNxAMev7waPywFtEPnANPjemu`. The actual Vercel build,
  function compilation, noindex SEO guard and Neon public-bundle policy passed.
- Actual preview OpenAPI and MCP initialization/discovery returned the new
  schema/catalogue. Direct REST `POST /api/v1/public/name-packages` returned
  HTTP 200 with real dated Verisign evidence; the queried example `software.com`
  was correctly marked **taken**, not a free-name claim. Trace:
  `req_J4cckthV52quJx_c`, 2026-09-13T02:43:58Z.
- Actual MCP `tools/call name_packages_search` returned HTTP 200, `ok:true`,
  matching structured/text content and preserved unknown social/legal evidence.
  Trace: `req_aS9DZNmsE1tZMTJb`, 2026-09-13T02:46:27Z.
- Private REST without a key returned HTTP 401 with no-store/noindex. No
  authenticated live account transaction, key issuance or persistence is claimed.
- Vercel runtime logs contained the expected count-only completion event and
  matching REST trace. A Loopia standard-price lookup timed out in the underlying
  engine; package analysis still succeeded without manufacturing a price.
  A dependency `url.parse()` deprecation warning was also observed.
- The combined CLI smoke harness did not complete within its child-process
  deadline even though Vercel recorded HTTP 200 for that REST request. It is
  **not** recorded as a passed script. Direct bounded CLI requests subsequently
  verified REST, MCP and the private guard. The script now preserves non-sensitive
  process error metadata to distinguish harness problems from HTTP failures.

No production promotion, separate public-connector-host update, purchase,
account registration, social check or Apple release was performed. The full
project suite was not rerun here and the broader
[launch audit](LAUNCH-AUDIT-2026-09-13.md) remains applicable. Company/trademark
providers, comprehensive social coverage and durable package history still need
implementation and verification.

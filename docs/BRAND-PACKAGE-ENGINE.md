# Brand-package discovery and candidate Brand Index

Implemented 2026-09-16. This extends the existing naming engine, not a second
availability database or a legal-clearance service.

## Coherent discovery

The browser's `POST /api/domain-search` accepts the boolean `namePackages` for
creative searches. The ordinary rules or consented contextual naming flow still
generates names. The package step selects up to ten distinct labels and expands
each label across **every selected ending**. It caps planned registry work at the
smaller of the requested domain count and 50, without the ordinary creative
availability reserve. All 11 endings therefore yield at most four complete
packages and 44 domain checks; the engine does not claim ten complete packages by
checking different endings for different names.

The response includes `namePackages.mode = same_label_matrix`, `candidateCount`,
`requestedTlds`, `maximumDomainChecks` and `plannedDomainChecks`. Actual `checked`
continues to count attempted registry checks. Provider failures and work-deadline
exhaustion remain unknown observations. Optional AI consent and advanced naming
criteria retain their existing behavior. Exact searches still use the existing
public maximum of 12 domains; the new boolean cannot expand them. Swipe and
package creative mode cannot be requested together.

REST/MCP `name_packages_search` has its existing strict input contract. It now
generates up to the requested ten lexical candidates and checks their full
label-by-ending matrix through the existing unforgeable connector reserve.
At most 110 candidates fit inside its existing 120-domain reserve. This is one
ordinary quota-charged engine request, not an unbounded series of requests. Public
per-IP and authenticated owner quotas, registry concurrency and provider deadlines
are unchanged. Authenticated callers cannot select another owner. Public callers
cannot supply the internal reserve, account identity, provider URL or fake scores.

Only requested matrix members enter package projection. An omitted engine result
is an explicit unknown row, never an available name. No FX, exact registrar quote,
company-register or trademark call is added by this discovery step.

## One candidate index across surfaces

`shared/brand-candidate-index.ts` exports:

- `getNamePackageBrandIndex(pkg, now?)`: a versioned candidate-mode descriptor
  recomputed from dated underlying observations, not saved score/status fields.
- `buildNamePackageDomainCheckPlan(pkg, options?)`: a pure exact-domain completion
  plan for the existing domain-check flow. Batches contain at most ten domains;
  unsupported endings remain explicit rather than being transformed or dropped.

Machine responses add `packages[].brand_index`; the existing `index` remains
unchanged. `schemaVersion` is `sajda.brand-index.candidate.v1` and
`methodologyVersion` is `sajda-brand-index-candidate-1.0.0`. Both projections use
the existing fit40/domain30/social20/company5/trademark5 weights. The currently
attainable score is **70/100**, because no social registration or legal clearance
points are available. A profile conflict reduces readiness. A successful profile
lookup without a profile increases evidence coverage, not availability or score.

The descriptor carries score parts, evidence coverage, domain/handle signals,
missing checks and prioritized next actions. `domains_ready` means only that all
included domain alternatives have current verified availability; it does not
mean the brand is clear to register. `ownershipVerified` and `legalClearance`
remain false. Existing-brand self-assessment and public-record lookup retain
their own distinct evidence models and are never silently converted into this
candidate index. No valuation or probability of commercial success is produced.

## Verification

### Name language (2026-09-17)

Brand-package discovery accepts `nameLanguage`: `en`, `sv`, `fr`, `es`, `de`,
`it`, or `pt`, defaulting to English. This is independent of interface `locale`
and review `markets`. Browser searches send it alongside `namePackages: true`;
REST and MCP use the same documented field. Exact-domain requests are never
translated. Existing non-package advanced language modes retain their contract.

Without AI consent, the rule engine uses curated language-specific topic roots,
modifiers, companion words and language-appropriate compound ordering. Topic
recognition accepts keywords in the supported languages. This is bounded naming
heuristics, not a general translator: unrecognised topics can yield broader
brand-name directions. Cross-language triggers use exact matching to prevent
false topic matches. With consent, the same explicit language is included in
the contextual naming constraints; interface language does not override it.
ASCII domain labels use unaccented/transliterated spelling. Quotas, availability
checks, pricing evidence and scoring are unchanged.

The focused engine suite passes 68 tests, including actual handler invocation
with fully offline provider fixtures. It checks coherent matrices, work caps,
same-label identity, unchanged exact limits and anonymous quota, opted-in AI,
strict API requests, API-owner scope, sanitized outputs, score recomputation,
social conflicts, aging, unknown evidence, compound-suffix handling and exact
completion batching. Focused lint passes. The checked-in name-package OpenAPI
schema is regenerated from the runtime Zod validator.

An additional 49 protocol/regression tests pass for public and authenticated MCP
SDK transport, OpenAPI synchronization, metrics, contextual naming and the
existing budget connector. The refreshed mounted package workspace suite passes
22 tests, including the three-package comparison cap, exact-name input, transient
navigation seeds, domain-only refresh without losing unrelated candidates,
access denial, duplicate clicks, cancellation and late-response isolation. Saving
and external network requests are stubbed in that UI suite; cloud persistence is
verified separately.

These are local implementation checks. They do not establish live availability,
social-handle registration, account persistence, production deployment, company
name rights or trademark clearance.

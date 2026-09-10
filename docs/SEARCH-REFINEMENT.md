# Contextual naming and explicit refinement

Implemented 11 September 2026 for the web/native product search. This is not a
claim of superior naming quality, trademark clearance, investment value or a
production launch. The [20-brief benchmark](NAMING-QUALITY-BENCHMARK.md) keeps
structural checks separate from the still-unperformed blind human evaluation.

## Customer flow

1. Describe the project, or enter exact domains for registry checks.
2. Creative search shows ten results first; **show more** reveals the existing
   batch without another request. The keyword extraction is an optional disclosure.
3. Choose explicit rejection reasons and/or up to five names to build on.
4. **Find new suggestions** starts a new bounded search using the original
   theme, brief, criteria, selected extensions and search mode, not unsent edits.
5. A failed, empty or entirely unverified follow-up cannot overwrite a prior
   verified shortlist. Feedback remains available for retry.

The introductory browser search remains available without an account. An
email-verified free account can continue under server limits without buying a
plan. This browser onboarding gate is not a durable paid entitlement or a claim
that the public endpoint is impossible to call independently.

## Generation boundaries

- With current explicit [AI permission](AI-PRIVACY.md), one Vercel AI Gateway
  request generates at most 24 distinct labels, across four naming directions.
  Google Gemini 2.5 Flash Lite is explicitly configured in Preview/Development.
  The initial 3.1 Flash Lite runtime request returned HTTP 403 from the
  Gateway/Vertex route; it is not treated as a successful model verification.
- Full visible search descriptions are no longer silently cut after 100
  characters. The product limit is 6,000 characters and the HTTP byte cap still
  applies. The stable v1/MCP contract keeps its own narrower published bounds.
- The strict model response accepts only labels and direction categories.
  Hard length/exclusion constraints and previously seen labels are filtered
  before registry checks; include-words are preferences, not mandatory words.
- Availability and registrar prices are independently checked. A missing
  provider response is `unknown`, never proof of availability or cheapness.
- With AI off, unavailable, invalid or allowance-limited, the rule generator
  remains usable and reports its source. Local feedback filters/reranks names;
  it does not understand tone like a language model or learn from an account.
- No synthetic economic valuation, promised result count, silent model retry,
  new paid plan, account data migration or registrar purchase is introduced.

Feedback, favorites and the original brief are page-memory state, not persistent
training history. The same label under a different extension is not a fresh idea.
Exact checks and Swipe never invoke this AI path. The versioned API/MCP schemas
do not expose refinement until a deliberate public contract is added.

## Verification and limitations

Unit and mounted-flow tests cover strict schemas, consent, independent registry
failures, original-context retention, account gates, double submission, cancellation,
retry and all five interface languages. Provider/runtime results must be recorded
separately; injected provider fixtures are not a real AI call.

The [runtime probe](../scripts/check-ai-gateway-runtime.mjs) offers a two-request
synthetic `refinement --allow-ai-sharing` check; run with `node --import tsx` and
the linked preview origin. It consumes existing quota and never resets it.

`.se` and `.nu` remain fail-closed. The [connector investigation](SE-NU-CONNECTOR.md)
lists the account, permitted-use agreement and authenticated verification needed.
No keyword heuristic, DNS absence or scraped contact service substitutes for it.

Mobbin's [Magnific feedback flow](https://mobbin.com/flows/ce7bcbdc-1f0a-4dcb-8599-e4082125367b)
was inspected as an interaction reference: feedback is attached to completed
output and next actions are explicit. This is pattern evidence, not usability
testing of Sajda, and no competitor layout or copy was cloned.

# Brand evidence release — 2026-10-07

## Scope and verdict

The evidence-ledger feature is implemented and verified for the protected
application preview and the existing isolated, read-only public connector.
This is **not approval to release the complete commercial application**.
The separate [external release gates](LAUNCH-EXTERNAL-EVIDENCE-2026-10-07.json)
remain unresolved; their earlier timestamps and `no_go` verdict are preserved.

Runtime implementation: `a6b880c1dbc6432c6e8b35890de4e2c0eb81268b`.
Application preview also includes the test-only follow-up
`f43a7f8f0e700de923a6a54f05f7e113e729759a`.
The later anonymous probe changes and this receipt do not change deployed
runtime code. No production account, payment, DNS or OAuth configuration was
changed in this feature release.

## What changed

- Shared `sajda.brand-evidence.v1` across candidate cards, existing-brand lookup,
  self-assessment, exported reports, REST and authenticated/public MCP.
- Four distinct states: current provider observation (`checked`), dated user
  report (`reported`), named-source assertion (`listed`), and `unknown`.
- Exact identity binding, safe provenance links, original observation times,
  age checks, strict counter validation and explicit unknown scope.
- Explicit selected-domain checks in the existing-brand worksheet, using the
  normal search allowance, bounded batches, cancellation and partial-result
  handling. Merely opening the worksheet does not trigger a lookup.
- Five-language UI distinguishes registration/profile checks from ownership,
  permission, legal clearance and active comprehensive monitoring.
- Candidate readiness remains a heuristic, not an ownership score. Existing
  brand lookup/self-assessment still has no independently verified brand score.

See [methodology and boundaries](BRAND-EVIDENCE.md) for exact meanings,
denominators, expiry periods and retained compatibility fields.

## Local verification actually performed

- `npm run check:ci`: exit 0 after repairing an obsolete copy assertion; includes
  lint, application/server/Vercel types, language contracts, SEO and Neon
  boundaries, the full automated suite, UI contracts and the Vercel build.
- The local runtime probe passed 71 HTTP checks. Its database was deliberately
  not configured; the 503 health response was an expected fail-closed test,
  **not a local database integration pass**. Opt-in database suites were not
  exercised by that full-suite invocation.
- `npm audit --omit=dev --audit-level=high`: exit 0, zero reported production
  dependency advisories at check time. Build output still reports five existing
  development-toolchain advisories; no forced dependency rewrite was attempted.
- `npm run build:native` with an explicit existing HTTPS preview backend: exit
  0, including native product-bundle boundaries. This is not an Xcode archive,
  signing, TestFlight, physical iPhone or App Store verification.
- Mounted UI tests cover controlled provider simulations, duplicate clicks,
  quota handling, abort/reset/unmount, stale evidence and original dates.
  Simulated providers are not described as live verification.
- Actual browser viewport checks at 320, 375, 390, 430, 768 and 1440 CSS pixels
  had no document-width overflow in the synthetic existing-brand worksheet.
  Mobile/desktop screenshots were visually inspected. This is browser layout
  testing, not physical iPhone/Safari or VoiceOver testing.
- A separate read-only review confirmed identity/freshness/counting repairs.
  It also found two false-positive risks in the new anonymous probe. Full
  shared Zod parsing and re-ageing at probe time fixed them; six offline
  contradictory, stale or future-dated fixtures were then rejected.

## Deployed application preview

[Protected test application](https://sajda-4j8sikc1q-hypbit.vercel.app/brand-index/assessment)
— deployment `dpl_DdW5CBpJWC3aCq5yNJuDgBXvrbRK`, build READY.
Vercel Authentication remains enabled; tests used the authorized official CLI.
No access-protection setting was relaxed.

Actual deployed results:

- `/api/health`: `ok: true`, `database: connected`, request
  `req_A_bylAJSB-FJk7Hh`. This establishes connectivity, not every database flow.
- `check-brand-index-preview.mjs`: PASS for synthetic REST/MCP self-reports,
  matching report entries, null independently verified score, and rejection
  of fabricated verification fields and malformed dates. No persistence or
  independent ownership audit was performed.
- `check-brand-evidence-preview.mjs`: PASS for an actual `example.com` registry
  read through Verisign RDAP, observed `2026-10-07T10:22:45.233Z`, request
  `req_472S4zTpZHA2J8QV`. The known registered domain remained registered, not
  owned by the entered brand. Subsequent bounded REST/MCP package reads passed
  the full shared schema. A pure local age projection made the original
  observation unknown without rewriting its source or time.
- `check-brand-lookup-preview.mjs`: PASS against actual Wikidata search/profile
  responses for `Q54078`; revision `2549013581`, source modification
  `2026-09-24T11:53:50Z`, retrieval `2026-10-07T10:23:42.258Z`. Thirteen database
  assertions were listed, not checked ownership. Verified brand score stayed
  null. REST/MCP results passed the evidence checks.
- Bounded `vercel logs --since 15m --level error --limit 10 --json` query after
  these probes returned no error records. This is not continuous monitoring.

## Isolated public connector

[Public connector](https://sajda-connector.vercel.app/)
— production deployment `dpl_7uXCjFexVVr1pJfk6AeyPh9St4Fs`, MCP 1.7.0.
It contains the same runtime contract, not the account/payment application.
Its earlier isolated preview was verified before this prebuilt deployment;
production used the existing production-purpose service configuration.

Actual anonymous SDK command:

```text
SAJDA_TEST_ORIGIN=https://sajda-connector.vercel.app
node --import tsx scripts/probe-public-mcp.mjs --isolated --evidence
```

Exit 0, with full shared result validation and observation re-ageing at the
probe's actual time:

- Discovery: six read-only tools, two prompts and two resources; consent
  required, no background chat access.
- One bounded actual `.com` package lookup: `gentlescheduling.com`, registry
  observation `2026-10-07T10:22:04.263Z`, Verisign RDAP source. Ledger: one
  checked signal and five unknowns out of six. This historical receipt is
  **not a continuing availability guarantee or a price/purchase check**.
- Actual `Q54078` source profile: thirteen listed assertions, four unknowns,
  zero independently checked signals, zero user reports, verified score null.
- Both results kept ownership verification, legal clearance and comprehensive
  continuous monitoring false.
- Root returned 200; `/api/auth`, `/api/account/membership` and private
  `/api/mcp` returned 404, without session cookies.
- Connector logos and the 33,215-byte install kit matched the public manifest
  and checksum. Documented host paths do not prove actual installation in
  ChatGPT, Claude, Grok or any other host; that verification list stays empty.
- The bounded 15-minute error-log query returned no error records.

## Not verified or activated

Independent legal/company/trademark clearance, identity ownership, global
brand coverage, comprehensive brand monitoring and an independently verified
global brand score have **not** been activated by this release. Neither a user
report nor a matching registered domain fills those gaps.

Final owned domain, transactional delivery, real social OAuth, complete Stripe
sandbox entitlement lifecycle, operator/legal approval and Apple enrollment
remain separate release gates. No purchase, real charge, customer account
change or legal-clearance assertion occurred in these tests.

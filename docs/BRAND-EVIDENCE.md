# Brand evidence: implemented trust boundary

The `sajda.brand-evidence.v1` report is a dated snapshot, not a promise to watch
everything about a brand. Website cards, existing-brand lookup, the explicit
self-assessment, HTML exports, REST and MCP use the same shared report builder.
The UI is available in English, Swedish, Spanish, French and Chinese.

## Four mutually exclusive evidence states

| State | Meaning | Never means |
| --- | --- | --- |
| `checked` | A current provider observation about registration status or whether a social profile was found | Ownership, handle registrability, company approval or legal clearance |
| `reported` | A dated account-holder/user claim | Independent verification, even if a source link was supplied |
| `listed` | A relationship listed in a named source such as Wikidata | That Sajda checked the real-world relationship |
| `unknown` | Missing, unsupported, expired, future-dated or inconclusive evidence | That a name is free, absent, safe or unused |

Each item carries a stable scoped ID, exact target, signal kind, origin,
statement, original observation time, freshness and a safe public source URL
when available. A newly generated report **does not renew the observation**.
Sources with credentials, queries, private hosts or unsafe fragments are not
displayed as evidence links. Links are provenance, not permission to fetch an
arbitrary URL.

The report always returns `ownership_verified: false`, `legal_clearance: false`
and `continuous_monitoring: false`. There is no claim of an active comprehensive
brand-monitoring service. Existing separate account alerts and domain checks
must not be used to imply that every signal in this report is being monitored.

## Scores and counts

Candidate readiness remains a derived heuristic, currently capped at 70/100;
it is not existing-brand strength, a market valuation or a verified control
score. Existing-brand self-assessment remains `SELF_ASSESSMENT`, with
`verified_score: null`. A public-source lookup also has no verified brand score.

Evidence summary counts are **signal items**, not unique names. A domain can
have one registration observation and a separate user's ownership claim. The
checked percentage is floor(100 × current checked items / all scoped items).
Company checks, trademark checks, ownership verification and continuous
monitoring remain explicit unknowns and contribute to this denominator.
The older candidate `evidenceCoverage` field is retained for API compatibility;
its original denominator is domain/social items plus company/trademark items,
not the newer all-signal ledger. Neither percentage is legal or ownership
coverage. Clients should use the new ledger for the four-state presentation.

Current provider observations and source-retrieval snapshots expire after
30 minutes; user reports expire after 30 days. Expired evidence stays visible
with its original source and date, but becomes unknown and no longer counts
as current. Candidate identity and exact domain/social targets are validated:
evidence for another name cannot be swapped into a result.

## Explicit checks, not background scraping

The existing-brand worksheet stays local and unsaved. Its registration-check
button sends only selected supported domains to the existing anonymous search
API, at most ten per request and twenty per scope. It uses the existing search
allowance and cancellation path. Unsupported extensions, partial results and
failures remain visible; completed checks survive cancellation of a later batch.
Only a current authoritative RDAP result from the audited registry source map
becomes checked in that worksheet. Registered is not owned by the entered brand.
Changing the scope discards old reports/checks after explicit confirmation.

`brand_index_assess` on REST/MCP remains a pure self-report calculator with no
external queries or storage. `name_packages_search`/`business_names_recommend`
attach actual engine observations. `brand_lookup` exposes sourced database
assertions, not inferred ownership. Public and authenticated interfaces share
the same model; authentication never improves factual confidence.

## Verification and release

Focused tests cover freshness, sources, identity binding, counter spoofing,
export ageing, cancellation, late responses, retry and user-report separation.
Mounted UI tests use explicit simulated providers; they are not live registry
verification. The preview probes distinguish actual external reads from these
tests:

- `check-brand-index-preview.mjs`: synthetic REST/MCP calculator parity.
- `check-brand-lookup-preview.mjs`: bounded real Wikidata search/profile.
- `check-brand-evidence-preview.mjs`: exact `example.com` registration check,
  then REST/MCP package projection from actual engine observations.

Each probe requires an explicit protected preview and authorized Vercel CLI.
Run the TypeScript-importing probe with `node --import tsx`. These checks make
no purchase, account change or ownership assertion. A successful probe does
not waive the separate commercial-production, OAuth, email, legal or App Store
release gates.

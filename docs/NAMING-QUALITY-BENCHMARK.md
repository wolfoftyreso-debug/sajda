# Naming quality benchmark

This is a repeatable **offline structural regression** and a preparation kit for a future blind human evaluation. It is not a completed customer study, semantic-quality benchmark, registrar check, valuation or competitor comparison. Read alongside [Search quality and verification](SEARCH-QUALITY.md); those historical live observations are a different evidence class.

## Dataset and execution

The fixture file contains 20 synthetic but realistic product briefs: ten English and ten Swedish, covering apps, SaaS, commerce, local services and creative businesses. They describe audience, tone, intended use and pitfalls. They are authored examples, not secretly collected customer ideas. Do not call them a representative sample of the market.

Each fixture contains the full brief for human review and a separate `theme` for the deterministic fallback. The existing pure `generateCandidates(tlds, count, theme, locale, criteria)` export receives only the explicit theme and structural constraints. This runner does **not** imply that the fallback understands the full brief. The new contextual AI path must be evaluated separately using recorded, consented outputs; it is not executed here.

From the repository root:

```sh
node --import tsx scripts/evaluate-naming-quality.mjs
node --import tsx --test tests/naming-quality-benchmark.test.ts
```

The default runner makes two deterministic calls per brief, asking for up to 30 candidates each. It does not invoke the HTTP handler, load environment files, make AI calls, query registries, fetch prices or write account data. It installs a throwing `fetch` guard around generation to catch accidental future network coupling. Pure generation is the architectural boundary; the guard is not a general network sandbox.

Output defaults to ignored `tmp/naming-quality-benchmark/`. Re-running replaces only this generated report set. Use `--out <directory>` for a separate run. The program exits non-zero if any structural gate fails, so it can be used in CI without asserting naming superiority. Existing `npm test` automatically includes the new test file.

## What is measured

| Measurement | Definition | Interpretation |
| --- | --- | --- |
| Validity | Lowercase ASCII label and single selected TLD | Format only; not registrability |
| Duplicate domains | Repeated fully qualified domain, case-normalized | Accidental repetition |
| Length compliance | Labels inside each fixture's explicit minimum and maximum | A hard request constraint, not a quality rating |
| Excluded words | Substring matches against explicit ASCII exclusion tokens | A hard filter, not trademark or meaning screening |
| Selected TLDs | Output ending belongs to the requested fixture list | No assertion that that registry is connected |
| Repeatability | Both fallback calls return identical ordered output | Deterministic baseline behavior only |
| Unique labels | Distinct names ignoring alternative endings | Avoids counting the same name under two TLDs as two ideas |
| Surface variation | Largest shared first-three/last-three-character bucket | Descriptive observation only; not semantic diversity |
| Naming-pattern distribution | Generator-reported pattern labels | Implementation diagnostic, not human assessment |

Empty output, overproduction, malformed output, duplicates, violated hard constraints and non-repeatability fail the structural gate. Surface-variation ratios are deliberately **not** gates or weighted scores. Related names can have different character prefixes, and a requested literal brand word can legitimately repeat. Do not optimize the engine to game these counts.

The report contains `semanticQuality: NOT_EVALUATED`, `availability: NOT_CHECKED`, `price: NOT_CHECKED` and zero completed human reviews. It intentionally excludes the engine's heuristic `namingScore` and `estimatedValue` from exported candidate lists. A green structural test does not mean the names are good.

## Blind-review files

- `structural-report.json`: coordinator diagnostics and original engine order. Do not give this to raters before their ratings are locked.
- `blind-review.csv` and `blind-review.json`: full brief, review questions and masked candidate labels. Every rating starts blank. CSV cells are quoted and formula-leading text is neutralized.
- `coordinator-key.private.json`: attribution and original ranks. Keep separate from participants; it is not application-secret material, but exposing it defeats the study design.
- `README.txt`: handling instructions.

The review takes the first ten **distinct labels** from each supplied system for each brief. Shared labels are pooled once per brief; attribution records every originating system. A seeded order masks original ranking, and neutral identifiers such as `B01-N03` are used. The seed is recorded in the coordinator key so presentation can be reproduced. With only the fallback system this is masked presentation, **not** a comparative blind study or proof that participants cannot infer the source from style.

To add independently collected comparison outputs without making network requests, pass a local JSON file:

```sh
node --import tsx scripts/evaluate-naming-quality.mjs --comparison tmp/recorded-naming-systems.json --seed study-round-01 --out tmp/naming-quality-round-01
```

The comparison file shape is:

```json
{
  "systems": [
    {
      "systemId": "coordinator-only-system-label",
      "results": [
        {
          "briefId": "en-01",
          "candidates": [{ "domain": "illustrative.com" }]
        }
      ]
    }
  ]
}
```

The abbreviated example must be expanded to exactly one candidate list for **each** of the 20 brief IDs. Empty lists are allowed when a system returned no names; missing cases are not. Candidate examples are unchecked strings, not availability claims. Use the same prompt, constraints, collection date policy and time budget across systems, and record model/product versions, settings, latency and failures separately. Do not cherry-pick ten successes from unlimited retries. The fallback's abbreviated theme input is a known limitation when comparing it to a full-brief model.

## Human review protocol

1. Recruit the intended project owner where possible and a reviewer fluent in the brief's language. Record familiarity with naming, any conflict of interest and whether they recognized a tool. Do not treat a model's output as a human review.
2. Show the brief before names. Hide source names, ranking, prices, availability and automated scores during the first naming pass. Offer no claim that these candidates are available.
3. For each candidate record relevance, pronunciation, spelling clarity and distinctiveness from 1 to 5: 1 poor, 3 workable, 5 strong. Leave a field blank when unjudged. Record whether it belongs on the shortlist (`yes`, `no`, `unsure`) and a short reason. Do not turn missing ratings into zeros.
4. Use a separate spoken recall/spelling exercise for candidates that survive. Showing the name and then asking whether it is spellable is not a genuine hear-and-spell test. Record negative meanings and potential name conflicts separately; a rater is not giving legal clearance.
5. Lock ratings before opening the attribution key. Report per-brief and per-language acceptance, reviewer disagreement, missing data and cases where alternatives win. The runner intentionally computes no aggregate semantic score or winner.
6. For a second round, collect explicit rejection reasons and offer each system the same feedback budget. Measure whether the project owner prefers the revised set. This refinement experiment is **not** performed by the offline runner.

Time to three accepted names, recalled spelling, preference after feedback and accepted-name rate are useful future outcomes. Actual availability, current registrar quotes and total cost require a separately authorized live validation stage. Keep elapsed generation time separate from the human decision time and provider-verification latency.

## Limits and honest reporting

Twenty briefs are enough to expose obvious regressions, not to establish population-wide superiority or willingness to pay. These public fixtures can become overfitted; retain separately authored, unexposed holdout briefs for prospective testing and periodically rotate that holdout without silently changing this regression dataset.

Do not claim that structurally valid names are original, memorable, linguistically safe, legally cleared, available or valuable. Translated UI text is not multilingual naming evidence. Nothing in these files tests live AI generation, user consent, registry accuracy, payment, retention or investment outcomes.

A first local execution on 11 September 2026 produced 20/20 structural passes, 600 candidates and 200 blank human-review rows with zero provider requests. These figures describe that run of the deterministic fallback, not an expected future count or a semantic-quality result. For example, the EN developer brief shared a three-character prefix across 60 percent of labels; that observation is worth inspecting but does not itself prove repetition of meaning. No humans or competing systems were evaluated in that run.

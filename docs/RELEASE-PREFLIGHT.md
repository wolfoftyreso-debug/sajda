# Release preflight

Run the release preflight separately from local CI, using the redacted evidence receipt for the actual release revision:

```sh
npm run check:release-ready -- --web /path/to/current-redacted-evidence.json
npm run check:release-ready -- --ios /path/to/current-redacted-evidence.json
```

The context is mandatory. `--web` requires all eight web release gates; `--ios` additionally requires the `app_store` gate. Both require a literal `go` verdict supported by valid evidence metadata, the actual current Git commit and named branch, and a clean working tree (including untracked files). Detached HEAD, a stale commit/branch receipt, failed/blocked/missing gates, `no_go`, and `go_with_conditions` fail closed. The preflight never stages, commits, pushes, deploys, changes configuration, or contacts providers.

Finish and commit the code first, leaving a clean checkout. Then generate the current release receipt for that final HEAD into an explicitly ignored path or outside the repository. Do not commit the current receipt before preflight: committing a receipt that names HEAD creates a different commit, so that receipt immediately names the wrong revision. A non-ignored untracked receipt inside the checkout also correctly makes it dirty. Historical tracked receipts remain retrospective records, not current release permission; do not rewrite them to make them match a new release.

`npm run check:launch-evidence -- <receipt.json>` remains a historical schema/redaction/consistency check. It can correctly accept a historical `no_go` receipt. It does not authorize a release. `npm run check:ci` verifies local implementation/build/runtime checks; it is likewise not production authorization and does not replace this explicit preflight.

## What a pass does not prove

Matching Git metadata does not prove that the deployed application, provider configuration, legal approvals, inbox delivery, payment lifecycle, or runtime currently match the receipt. The script validates the declaration and its evidence metadata, not the authenticity or contents of referenced receipts. The operator must inspect actual redacted provider/runtime evidence, verify the intended production context, and obtain appropriate release approval before deployment. No universal evidence expiry is imposed: freshness needs gate-specific policy, and a stable legal approval should not expire merely because a day passed.

The check is a read-only snapshot, not a Git lock or a deployment transaction. If source, branch, runtime, or configuration changes after verification, reverify the affected gates and rerun the preflight for the exact revision being released. Failures report internal reason codes only, never raw Git differences, filenames, evidence references, or secret values.

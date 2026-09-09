# Lost Domains: real source intake and policy review

Implemented and checked 2026-09-09. This is an operator workflow, not a public arbitrary-URL scanner. It replaces dependence on the synthetic `example.com` bootstrap without granting subscriptions, changing global switches, starting runs, or enabling cron.

## A real, bounded starting source

Two exact category pages from the awesome-selfhosted community were inspected:

| Source | Live HTML evidence | Bounded extraction before title/chrome refinement |
| --- | --- | --- |
| [Bookmarks and Link Sharing](https://awesome-selfhosted.net/tags/bookmarks-and-link-sharing.html) | HTTP 200; 131,801 bytes; 265 anchors; 2026-09-09 02:05:39 UTC | 14 external domains, 2 flagged sensitive |
| [Wikis](https://awesome-selfhosted.net/tags/wikis.html) | HTTP 200; 153,513 bytes; 300 anchors; 2026-09-09 02:05:40 UTC | 20 external domains, 1 flagged sensitive; capped at 20 |

The production `discoverSource` implementation made four requests total: each page and its `/robots.txt`. No discovered target, registry, registrar, database, paid provider or customer allowance was touched. Robots returned HTTP 200 and a comments-only policy. The publisher specifically requests non-aggressive access and points to its raw data; this supports a small pilot, not repeated bulk page scraping. Do not expand frequency or source count without another policy review. Large-scale reuse should evaluate the publisher's raw data workflow instead.

Later source-quality refinement, verified at 02:15:03 UTC, selects only the first `Website` link within each observed project section on these two exact category URLs. Definition links, source-code hosting, demos and navigation no longer consume the candidate budget. A repository URL labelled `Website` is still excluded unless it explicitly names the hosting service's own homepage. Other publishers retain the generic extraction behavior. A source-only recheck of Bookmarks returned **9 primary project domains** in 497 ms; first five were joinbetula.org, ladigitale.dev, faved.to, karakeep.app and linkace.org. This used two HTTP requests, no target inspection and no database or customer run. Those names are observations, not registration offers. Existing stored reports are not rewritten.

Both pages declare CC BY-SA 3.0 in their footer, linked to the [publisher's data license](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/LICENSE). Its [license summary](https://creativecommons.org/licenses/by-sa/3.0/) explains attribution and ShareAlike conditions. Keep the source URL, author attribution, license link and notice that Sajda selected links and adds its own analysis. Do not reproduce project descriptions. Source material is not an endorsement, project ownership evidence, trademark clearance, or evidence that any linked domain expired.

Recommended attribution beside applicable results:

> Källmaterial: awesome-selfhosted community (CC BY-SA 3.0). Utvalda länkar; analys av Sajda.

Link the source category and license. Do not apply proprietary reuse restrictions to redistributed licensed source material. Product descriptions, registered project names and copyrighted logos are not required by this integration.

The file `docs/lost-domains-sources-reviewed-draft.json` records the actual research and two exact candidate sources with a seven-day expiry. It is a **draft for release-owner review**, not evidence of database activation. Review attribution, source frequency and the target database before executing its write commands. Never silently extend its approval dates. These sources are public project-link discovery; they are not claimed to be domains lost by major companies.

## Operator commands

Run from the repository root with Node 22.12+ and installed dependencies. No provider API key is needed for public source HTML or Common Crawl metadata. Database actions require the intended environment's `DATABASE_URL_UNPOOLED`, obtained through the existing Vercel environment workflow; never paste its value in logs, a command argument, chat or a committed file.

```powershell
# Local validation: no network or database.
node --import tsx scripts/manage-lost-domains-sources.ts plan --manifest docs/lost-domains-sources-reviewed-draft.json

# Optional read-only live robots/HTML check; no discovered target investigation.
node --import tsx scripts/manage-lost-domains-sources.ts probe --manifest docs/lost-domains-sources-reviewed-draft.json --network

# Explicit operator write: disabled registration only.
node --import tsx scripts/manage-lost-domains-sources.ts register --manifest docs/lost-domains-sources-reviewed-draft.json --apply --database-host <exact-unpooled-neon-host> --shared-catalog

# Separate write: fresh in-process source/robots probe, then enable the exact matching IDs.
node --import tsx scripts/manage-lost-domains-sources.ts enable --manifest docs/lost-domains-sources-reviewed-draft.json --network --apply --database-host <exact-unpooled-neon-host> --shared-catalog
```

Replace the angle-bracket hostname before use. The CLI requires an exact unpooled `.neon.tech` hostname, verifies TLS, bounds its connection/transaction, and never prints credentials. Source catalog rows are shared by all environments attached to that same database; the explicit `--shared-catalog` acknowledgement matters. Environment separation elsewhere does not make this table environment-private.

Registration is insert-only and disabled by default. Repeating an identical registration is idempotent, including PostgreSQL subsecond timestamps. A UUID, URL or policy mismatch is a conflict, never an automatic overwrite. Enabling requires the exact existing source, current reviewed policy and a new live probe; caller-supplied probe receipts are not trusted. Re-reviewing an expired source or disabling an existing source remains an explicit scoped operator maintenance action; this CLI does not silently renew or delete rows.

Only after successful catalog registration/enable should the release owner decide whether to run a single existing campaign under its normal entitlement, quota, provider cooldown and kill-switch checks. These commands neither create campaigns nor bypass those gates. Remove the synthetic pilot from the active catalog separately after checking its exact ID and ongoing runs; no broad deletion is provided.

## Intake from Common Crawl

Common Crawl is useful for identifying historically indexed **source pages**. CDX metadata does not contain the verified current outgoing links. WAT archives contain link metadata but processing entire archives is not suitable for this bounded Vercel path. The [official index](https://index.commoncrawl.org/) asks users not to overload it; the [data guide](https://commoncrawl.org/get-started) describes formats, and the [CDX API documentation](https://github.com/webrecorder/pywb/wiki/CDX-Server-API) documents prefix matching and result limits.

```powershell
node --import tsx scripts/manage-lost-domains-sources.ts collections --network
node --import tsx scripts/manage-lost-domains-sources.ts index --host commoncrawl.org --prefix /blog/ --collection CC-MAIN-2026-34 --network
```

The second command is a recorded narrow example, not an approval to register the returned pages. It requests one exact hostname/path prefix in one collection, at most ten index rows, no pagination, archive download or target fetch. TLS/DNS pinning, redirects-disabled, 128 KiB response limit and existing timeouts apply. Sensitive paths, credentials, query strings, malformed dates and out-of-scope URLs are rejected. Rows retain index URL, capture time and observation time with `liveVerified: false`, `policyApproved: false`. Rate limits and failures are not reported as a successful empty result.

Live verification at 2026-09-09 02:08:58 UTC: collection lookup returned five collection IDs including `CC-MAIN-2026-34`; the single `/blog/` query returned seven deduplicated metadata hints. Exactly two index-provider requests, zero hinted-page downloads, zero registered sources. This verifies the metadata connector, not domain discovery or registrability.

The progression for a useful hint is:

1. Review the exact source page's owner permissions or published reuse terms. Record a real reference and reviewer; `robots.txt` alone is not a data license. The [Common Crawl terms](https://commoncrawl.org/terms-of-use) do not remove underlying publisher rights.
2. Select one narrow stable HTTPS page, not a wildcard or an entire company site. Exclude identity, authentication, mail, payment and software dependency material.
3. Add it to a small manifest with a fresh review and expiry no later than 30 days after review. Current draft uses seven days. Inspect the live source and publisher policy before granting approval.
4. Run local `plan`, then optionally `probe`. `register` inserts disabled; `enable` requires a fresh probe. Preserve provenance and attribution.
5. Use the existing gated workflow to inspect its actual outgoing links. A historical index hint itself never enters the candidate or confirmed list.

## Evidence and safety boundaries

- Existing production fetcher pins a validated public DNS address, requires HTTPS/443, rejects private/reserved addresses and credentials, and revalidates redirects. Robots failure blocks crawling; a genuine robots 404 remains allowed under the existing policy.
- Source operations have a 10-second total deadline, at most 256 KiB HTML and 1,000 inspected anchors. Trading v3 returns a meaning-led plus rotating 60-reference pool, then selects up to 25 per approved source using discovery/recheck quotas. New runs have ceilings of 24 reviewed sources and 600 first-pass candidates, followed by three bounded rounds of up to 30 checks each. Existing runs retain their persisted limits and original verification schedule. CLI manifests allow up to 24 sources; probes remain sequential and their evidence expires after 60 seconds. No scripts, cookies, frames, assets, forms or automatic pagination are loaded.
- Discovery now omits navigation/sidebar/footer links. A generic project anchor such as `Website` may retain its nearest local section heading plus the anchor, bounded to 160 characters. Project descriptions are discarded. Account-server/identity headings add sensitivity; existing path, query, dependency and mail checks remain in place.
- Dead HTTP, NXDOMAIN, RDAP not-found and registrar confirmation remain distinct. `registry_not_found` is only a review signal. This source work adds **no registrability adapter**, ownership claim, appraisal, backlink authority or purchase guarantee. Active mail and sensitive dependencies remain excluded.
- Unsupported registries and incomplete checks remain unknown. HTTP-only historic links are not promoted to HTTPS and guessed; they remain outside this safe-fetch implementation. Curated active projects may produce no qualified domain at all. Never invent 30 results or interpret catalog size as value.
- Operator research may conclude that a source is useful but not permissible or safe to automate; leave it disabled. No global crawl or billing activation was performed by this work.

## Durable v3 worker operations

V3 is a multi-invocation investigation, not one long HTTP request. The server stores the selected capacity, deadline, maximum confirmation rounds and minimum gaps when the run starts. A browser flag cannot enlarge them.

| Control | New v3 run |
| --- | --- |
| Discovery ceiling | 24 approved source pages; 600 first-pass candidates |
| Confirmation rounds | Up to 30 eligible candidates per round; at most three rounds |
| Minimum gaps | 20 minutes, then 2 hours, then 12 hours after the preceding completed observation |
| Maximum lifetime | 72 hours from run creation; no automatic extension |
| Lifetime attempts | 900 including sources, inspections, confirmations and retries; this does not reset after 24 hours |
| Per-item attempts | At most three; expired leases retain their charged attempts |
| Rolling daily attempts | 6,000 per namespace; 1,800 per account |
| New-run budget | Ten per namespace and two per account in a rolling 24-hour window; one active run per account |

The gaps are minimum separation, not promised execution times. Provider cooldowns, source approval, worker availability and remaining budgets can delay or prevent later observations. A full three-round path spans at least 14 hours and 20 minutes after its preceding first-pass observation, plus discovery and processing time. Elapsed time or the number of repeated requests alone is not evidence of a valuable or buyable domain.

Waiting is stored as `next_attempt_at`; no process sleeps for hours. The worker claims only due work and processes a bounded number of items sequentially. Claims retain the namespace-wide single live lease, ownership checks, fencing and completion idempotency. Rolling daily exhaustion defers queued work until the relevant allowance begins to reopen, without charging an attempt or shortening a later provider/confirmation delay. The persisted 900-attempt ceiling and original run deadline remain terminal boundaries.

Each confirmation is a new immutable assessment. Only a successful, technically eligible observation from the immediately preceding round can advance. Registered, active-dependency, sensitive, failed or contradictory results cannot be replaced with an older convenient negative to progress. Each round rechecks the source's current approval and matching source identity/URL; approval is never silently extended to accommodate a long investigation. Expired or revoked source permission can therefore stop the associated work.

The account response exposes the queued round, maximum rounds and next due time separately from completed-work counters. A waiting run is not a completed report. The previous completed nonempty report stays visible during a new investigation or after cancellation. A newer stored observation for one of its investigated domains suppresses that old report's current technical readiness, even when the newer run was cancelled; the original report evidence is not rewritten.

## V3 rollout gates — not activation evidence

Before enabling unattended production research:

1. Apply the reviewed migrations through `0011_trading_temporal_confirmation.sql` in the intended Neon environment. Migration 0011 adds the bounded schedule, preserves existing run deadlines, leaves v2 runs with at most their original immediate confirmation, and does not enable sources, accounts, providers or scheduling.
2. Run `node --import tsx scripts/check-lost-domains-store.mjs --run` against a reviewed, non-production Neon database with those migrations. The rollback harness requires an inactive development Lost Domains catalog; it creates only transaction-scoped fixtures and always rolls them back. It now exercises deferred confirmation scheduling, three immutable rounds, contradictory final observations, legacy deadlines and lifetime attempt accounting beyond 24 hours. Queue due times are fast-forwarded only inside the fixture: this is SQL/state verification, not a real 14-hour external-provider trial. Without `--run`, it opens no database and reports **SKIPPED**.
3. Verify an actual deployed Vercel worker, its authenticated cron secret and both research/scheduling feature switches. A cron handler and `maxDuration` configuration do not themselves establish a recurring schedule. Inspect the real scheduled trigger and runtime logs, then demonstrate progress continuing while the browser is closed. No claim of unattended operation is valid without that deployment test.
4. Recheck source approval, permitted frequency and attribution for the exact enabled catalog. More available worker capacity is not authorization to scrape more pages or providers. Do not reuse the dated draft manifest as automatic production approval.
5. Complete one controlled, entitled end-to-end run with actual providers, preserving observations across the configured waits. Check source revocation, provider cooldown, cancellation, restart, quota deferral and stale-result handling. Confirm that absent exact-domain registrar quotes and reviewed market/rights evidence still prevent a purchase-ready signal.

Local worker/store tests and syntax/type checks do not replace these gates. In this implementation pass, the expanded PostgreSQL rollback harness was syntax-checked but **not executed against Neon**, and no Vercel schedule, production run or deployment was activated or verified.

## Verification

`tests/lost-domains-source-catalog.test.ts` and `tests/lost-domains-source-index.test.ts`: 14 deterministic tests passed. Together with the updated engine tests: 33 passed, zero skipped. Coverage includes exact scopes, finite review expiry, impossible calendar dates, robots-vs-license distinction, disabled/idempotent registration, fresh probe activation, existing-row conflict, uncertain commit, explicit consent flags, database hostname confirmation, historical-only index output, provider errors, malicious URLs, result bounds, factual project title extraction and source-specific primary website selection without altering other publishers.

Focused ESLint, strict API TypeScript and standalone strict NodeNext compilation of the operator script/tests passed. Live source and index reads are separately described above. Database registration/activation, cron, paid entitlements and deployment are outside this subtask's verification; see the release owner's current production report for those states.

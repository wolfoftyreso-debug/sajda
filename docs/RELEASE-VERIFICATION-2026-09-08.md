# Sajda — release verification, 2026-09-08

## Verdict

**NO-GO for a full commercial production launch.** The public-search product
has been improved and tested. The subsequent Vercel/Neon connection pass created
a real preview and verified a database query from a Vercel Function. Real account
completion, email delivery and paid entitlements remain unpassed gates. No existing
production data, DNS or live payment state was modified.

**Latest infrastructure evidence:** see
[Vercel/Neon connection verification](VERCEL-NEON-CONNECTION-2026-09-08.md).
The local verification ledger below records the earlier pass; its logged-out,
unconfigured and not-deployed observations are historical, superseded by that
follow-up. They must not be interpreted as the current connection state.

Evidence labels: VERIFIED = repeatable local test; OBSERVED = this session's
browser/provider response; INFERRED = engineering judgment; UNKNOWN = no
available live configuration or evidence. A local handler is not a deployment.

## Product and scope

Sajda helps founders, independent makers and naming professionals discover
domain candidates, inspect registry evidence and compare available registrar
price information. The intended repeat-value path is saved candidates and an
account workspace. This is not a registrar checkout or a proven domain-valuation
service. Pricing/entitlement completion requires the intended commercial model;
the earlier request for one free search has not been silently replaced by
unlimited signed-in access.

Actual supported architecture: React/Vite, same-origin Vercel API handlers,
Neon Postgres and managed Neon Auth. Historical Supabase files are migration
input, not the active database, and are excluded from deployment upload.

Golden paths exercised: landing → search → registry results → review/filter →
registrar comparison; reload → restored result snapshot; second search → trial
gate → existing results; Swipe → keep/skip → local wishlist; developers → real
public API example. Account → verified email → durable saved domains → return
and all paid flows remain separate unpassed live gates.

## Significant changes

- Search: preserve spelling, honor language/length/exclusion criteria, prefer
  relevant reference words and diversify naming families. Registry failures,
  unsupported sources and throttling remain unknown, never guessed available.
  Bound upstream response sizes/deadlines and honor Retry-After cooldowns.
- Deep review: one shared API/local ranker, stronger spelling/length weight,
  bounded 0–100 components and deliberate family diversity. Repeated keyword
  wrappers no longer crowd out distinct shorter ideas in the tested sample.
- Commercial honesty: remove invented dollar valuations and show a labelled
  naming heuristic instead. Published standard-TLD prices are distinguished
  from an exact-domain checkout quote. `.se`/`.nu`/`.io` are not default discovery
  targets while the approved reliable secure connector is absent.
- Search UX: clear card headings and CTAs, advanced controls inside their
  disclosure, actual form/Enter submission, double-submit and cancellation
  guards, useful empty/error states, honest indeterminate loading, and a
  short-lived result-only snapshot surviving reload. Editing no longer erases
  the completed search. Failed/no-usable-result requests release the trial.
- Mobile: remove global 320px overflow, wrap constrained labels, improve
  filter layout and make short-screen Swipe details scroll with reachable
  Keep/Skip actions. Wishlist filters distinguish no match from no saved data.
- Neon: managed signup/signin/recovery/session lifecycle; JWT-verified,
  confirmed-email, owner-scoped saved-domain API with pagination, idempotent
  writes/deletes and database rate limiting. Explicit transactional migration
  runner with checksums and advisory locking; no migration was applied.
- Account-transition safety: pin paginated requests to the initiating account,
  cancel reads/writes on account change and discard delayed responses. A
  cross-account stale-result race found in the independent review was fixed.
- Unfinished features: unported authenticated history/owned-domain/daily-top10
  routes explicitly state unavailability instead of a false empty workspace.
  Marketplace remains a clearly identified local draft, not a live sale.
- Maintenance: reusable real-handler local QA server, risk-focused tests,
  UI contracts in five languages, HTTP smoke checks, current dependency fixes
  and deployment-upload exclusions. README and Neon/search guides reflect
  actual behavior instead of the former implementation claims.

## Verification ledger

| Area | Evidence | Result / boundary |
| --- | --- | --- |
| Static checks | ESLint, frontend/server TypeScript, API TypeScript, source policies, 17 Node syntax files | Passed after the final code changes |
| Automated tests | Auth/JWT, simulated owner isolation, cross-account cancellation/pagination, migrations, request validation, RDAP evidence, name generation, deep review, quota/retry and cache corruption | 53 passed, 0 failed; synthetic-provider tests do not prove external accounts work |
| UI contracts | Render actual components in five languages; advanced disclosure; truthful result/progress fields; basic/exact/advanced/Swipe request serialization and cancellation | Passed locally |
| Production build | `npm run build:vercel`, static SEO generation and Neon bundle policy | Passed locally; not deployed |
| HTTP runtime | `npm run check:runtime` on the real-handler QA server | 48 checks passed; database health correctly returned 503/not_configured |
| Registry probe | 35 domains through actual API handler with real providers | 29 registry answers, 6 unknown due to upstream throttling; no fabricated fallback |
| Browser search | Swedish `kafferosteri`, Enter submission and real network | 50 returned candidates with confirmed registry answers in that run |
| Browser review | Top10, filter to no matches/reset, provider expanders, direct HTTPS registrar links | Repeated after final build: top10 starts fikasaga.net, rostkopp.org and rostsy.dev instead of repeated kafferosteri wrappers; zero console errors observed |
| Browser return | Reload, edit, second-search gate, return to results | 50 results survived reload and gated retry; snapshot freshness warning shown |
| Browser public API | Developer console's Run live example | Real response: 3 checked, 2 available, 1 registered; 0 unknown in this observation |
| Browser status | OpenAPI, public OPTIONS and fact JSON validation | Reached and validated expected response shapes; not a database/payment health assertion |
| Browser account | Direct protected account URL with no Auth configuration | Explicit unavailable state and return route; no fake login success |
| Browser mobile | 320/375/390/768 widths and short-screen Swipe | Final 320px pass on nine public pages and Swedish advanced controls; real 100-domain Swipe at 390×568, Keep/Skip, wishlist filters and logo dialog; not real iOS/Safari authentication testing |
| Dependencies | `npm audit` and `npm audit --omit=dev` | Zero reported vulnerabilities after updates; not a complete security proof |
| Install | `npm ci --dry-run --ignore-scripts` | Passed; upstream unused Neon auth-ui peer warnings remain |
| Database migration | `npm run db:plan` | Two checksummed local migrations; no live connection/apply |
| Vercel | Current CLI whoami; existing project file; dashboard login; temporary dry-run | Logged out, no project IDs, expired temporary deployment; no preview created |

Provider prices and registry status are timestamped observations, not promises
of current availability or purchase price. The score is a deterministic
spelling/shape signal, not human brand validation, trademark clearance or a
valuation. See [SEARCH-QUALITY.md](SEARCH-QUALITY.md) for the precise live sample
and limitations, and [NEON-VERCEL.md](NEON-VERCEL.md) for Auth assumptions.

## Connector capability and usage

- Local source/runtime tools — CORE: inspected actual implementation and
  configuration, applied changes, built and exercised tests. No Git metadata
  exists in this checkout, so no commit/push was claimed.
- Browser automation — CORE: real rendered search, filters, reload/gate,
  developer example, mobile Swipe and Vercel login-state checks.
- Official web/documentation — USEFUL: verified current Neon JWT contract,
  Vercel deployment behavior and registry evidence/usage assumptions. Public
  registry and Loopia requests were bounded application/provider checks.
- Vercel/Neon/Stripe/Resend/Sentry/Mobbin/Semrush/Firecrawl connectors were not
  callable in this tool inventory. Their names in a prompt are not evidence
  of an available connection. Vercel CLI/browser alternatives were exercised.
- Apollo and creative/productivity tools were not used: obtaining contacts,
  producing artwork or mining unrelated email would not resolve the concrete
  search, identity, runtime and deployment failures. No outbound campaign,
  private mailbox mining or ceremonial connector activity was performed.
- Plugin-management skill guided capability discovery and safe fallbacks;
  it did not provision an external service or grant credentials.

## Remaining release risks

### P0

No known P0 was established in the exercised local scope. This is not a claim
that untested deployed infrastructure is secure or launch-ready.

### P1 — unresolved launch gates

1. Vercel is now authenticated and linked to the new `hypbit/sajda` project.
   A working preview exists. Production remains unconnected/unpromoted pending
   the account and commercial gates and confirmation of the production domain.
2. Neon database/Auth variables and the two schema migrations now exist.
   Managed Auth rejects the preview origin (`INVALID_ORIGIN`). Neon console
   account linking requires the operator's email confirmation before trusted
   origins can be configured. Two-user isolation, signup, verification/reset
   delivery, return/persistence, per-preview branch isolation and mobile cookie
   behavior still require real end-to-end verification.
3. One-free-search gating is browser-local, not durable server enforcement.
   Storage clearing/new browsers/direct public APIs are not billing protection.
   Paid plans, Stripe lifecycle/webhooks and entitlements are not implemented
   and tested end to end. Do not charge customers based on this state.
4. Persistent history/owned domains/developer API keys/marketplace and ongoing
   monitoring are incomplete. Local drafts/wishlists must not be sold as a
   synchronized, monitored workspace. Email delivery is unverified.

### P2 — important limits

- `.se`/`.nu` require approved secure availability infrastructure; `.io` is not
  in the reliable default set. Public registry quotas are not a commercial SLA.
- The generator still uses finite deterministic vocabulary. Human assessment
  across representative naming briefs is required before claims of superior
  naming quality; five UI translations do not prove five-language generation.
- No deployed Sentry/centralized analytics/payment/email incident trail was
  verified. Request IDs and safe errors are implemented in key API paths.
- SEO fundamentals/static pages were checked, but production canonical origin,
  Search Console, indexing and real keyword/ranking data remain unknown. No
  large speculative SEO expansion was performed.
- Managed Auth package is beta; unused transitive auth-ui peer warnings exist.
  Actual selected adapter is lazy and the public bundle has no active Supabase
  client. A reproducible deployed install remains a separate gate.
- Swipe's unsaved remainder is not restored after a reload once its trial was
  used; its kept local wishlist persists. This is distinct from main search's
  30-minute tab-local result snapshot.

### P3

Further bundle/font trimming, broader human naming evaluations, terminology
polish on secondary legacy screens, and real-device accessibility testing are
useful after the launch blockers above.

## Next five highest-value actions

1. Confirm the Neon console account-link email and owned production domain.
   Vercel project linking and initial Neon provisioning are complete.
2. Configure managed Auth trusted origins/sender, confirm environment branch
   isolation and test two independent accounts with the migrated schema.
3. Implement the confirmed business model's durable usage/entitlement boundary
   and test Stripe sandbox + webhook + retry/cancellation before enabling sales.
4. Deploy a preview and repeat the HTTP/browser golden paths, email links,
   mobile auth, persistence and logs against that real environment.
5. Complete or keep hidden the remaining workspace features; obtain approved
   national-registry capacity and human-evaluate representative naming briefs.

The next production push should be based on these passed gates, not on the
presence of code, a local screenshot, or this report.

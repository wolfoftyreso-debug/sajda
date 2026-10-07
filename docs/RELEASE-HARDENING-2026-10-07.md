# Release hardening — 7 October 2026

Commercial release verdict: **NO-GO until the external gates close**. Local
verification, real PostgreSQL checks and deployment evidence are distinct.

## Changes

- The developer public console owns a 35-second deadline, prevents rapid
  duplicate requests, aborts its browser request on navigation and supports an
  explicit retry after timeout or a non-JSON upstream failure. All five locales
  have user-safe failure text. This does not prove cancellation of provider work
  already running on the server.
- Daily Trading scheduling excludes older queued/running work before its
  bounded owner selection, deduplicates access grants and propagates unexpected
  storage failures. Only expected eligibility/quota deferrals count as skipped.
- Release evidence cannot claim observations later than its own recorded time.
- MCP SDK is pinned to 1.32.1. The installed version was covered by
  [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h).
  That advisory concerns the affected OAuth client flow; this pass did not
  establish an exploitable Sajda server flow.
- Build-only `source-map-js` was patched to 1.2.2 and
  `postcss-selector-parser` explicitly overridden to 7.1.6. Tailwind 3 remains.
  Native generated CSS is byte-identical before/after the parser change.
- Operator documentation now distinguishes standard-TLD prices, exact-domain
  offers and authenticated Trading checks. Historical database and deployment
  observations are no longer presented as the current schema state.

## Actually verified

- `npm run check:ci`: **1,853 tests; 1,845 passed, zero failed, eight opt-in
  PostgreSQL tests skipped**. Lint, types, 94 English-source language catalogues,
  SEO/Neon policies, the Vercel build and **71 local HTTP smoke checks** passed.
  The final run used filesystem permission required by esbuild on Windows;
  the earlier sandboxed ancestor-directory read failure was reproduced and
  resolved by the permitted run, not suppressed in the test.
- Three separately opted-in PostgreSQL suites passed on the isolated Preview
  database: account membership, account deletion and native commerce. Synthetic
  fixtures rolled back; no real email, Stripe or Apple provider call occurred.
- Read-only Preview and Production migration checks each returned **22 applied,
  zero pending**, with source checksums verified. No schema changes were made.
- Native bundle build passed using the documented HTTPS API origin as a
  process-only setting. No SEO/service worker entered the native bundle.
  Xcode, signing, TestFlight and physical iPhone operation were not verified.
- Current network-backed `npm audit --omit=dev --json`: **zero known production
  dependency advisories**. This is not a security certification.

## Deployed preview and source-control verification

Code commit `95ddbfc5cc2a5f611dd5f7ec11a86e43587cd2f7` was pushed to
`codex/launch-hardening`. GitHub's [Verify run 37553179938](https://github.com/wolfoftyreso-debug/sajda/actions/runs/37553179938)
completed successfully for that exact commit.

The new [protected preview](https://sajda-hqfc316q3-hypbit.vercel.app)
is READY: `dpl_84d5RHhVdm57hBGAa1RERVXbKBat`, project `hypbit/sajda`,
target Preview. CLI inspection confirmed the deployed account functions use
`fra1`; the build machine's `iad1` location is not the functions' region.

Official Vercel CLI requests crossed deployment protection with operator
authorization, but carried no Sajda session or account API key. These are not
anonymous-public-access or browser golden-path evidence:

| Request | Observed response |
| --- | --- |
| `GET /api/health` | 200; database connected |
| `GET /api/auth-providers` | 200; Google, X, GitHub and Apple all disabled |
| `GET /api/account/membership` | 401; authentication required |
| `GET /api/account/capabilities` | 401; authentication required |
| `GET /api/v1/account?resource=membership` | 401; valid API key required |
| `GET /api/mcp` | 401; valid API key required, structured JSON-RPC error |
| `GET /api/auth/get-session` | 200; null session |
| `GET /api/openapi` | OpenAPI 3.1.0; 14 paths, session/API-key security schemes |
| `POST /api/v1/public/domains` | 200; one exact `example.com` lookup, taken from authoritative Verisign RDAP |
| `POST /api/v1/public/business-names` | Valid `sajda.business-names.v1` response; requested 10, returned 5, explicit partial-result explanation |

The exact lookup finished at `2026-10-07T00:46:32.783Z`. Porkbun returned its
published `.com` registration/renewal standard price, USD 11.08; Loopia and
Cloudflare had no verified offer for this check. A standard-TLD price for a
taken name is not an available exact-domain offer. No name was purchased,
reserved or declared trademark-cleared. These observations do not verify all
TLDs, registrars or a ten-name budget shortlist.

The business-name request finished at `2026-10-07T00:51:08.620Z` for a synthetic
calm-planning-tool brief, English names, `.com`/`.dev`, and US/Swedish review
markets. The response headline was `Found 5 of 10 requested names.` It reported
five excluded candidates whose selected endings were observed registered,
`insufficient_fresh_available_domains`, missing count five, and concrete next
steps. Recommendation counts matched the returned list. This verifies honest
fulfilment reporting, not the ability to find ten names for every brief,
company-name availability, social registration or legal clearance.

The explicit unsupported `HEAD /api/health` request returned 405 with
`no-store`, `noindex, nofollow` and `nosniff`. A bounded error-level log query
for this deployment's recent 15-minute window returned no records; it is not
a claim about all runtime failures or future operation.

The browser tool could not open the prior preview under its current security
policy. No browser, physical iPhone, VoiceOver, full signup or paid Trading
golden path is claimed by this pass. Account/database and mounted-component
test evidence remains separate from that missing deployed UI verification.

## Isolated public connector release

The separately bounded [public connector](https://sajda-connector.vercel.app)
was released after preview and staged-production gates. Its production
deployment is `dpl_n9xKnTcaTkG9MBARTvNbqE5VrRDx`, dedicated project
`hypbit/sajda-connector`, source commit `95ddbfc5cc2a5f611dd5f7ec11a86e43587cd2f7`.
The stable alias was checked anonymously at `2026-10-07T00:51:08.070Z`.

Real SDK 1.32.1 initialized server 1.6.0 and discovered six read-only tools,
two prompts and two resources. One synthetic exact-domain read had authoritative
Verisign RDAP availability, Loopia/Porkbun standard pricing and an exact
Cloudflare USD 10.46 offer; tax treatment remained unknown. Private auth,
account, billing and account-MCP routes returned 404 without cookies; an
unauthenticated internal registrar-bridge request returned 401. The setup kit
matched its manifest. Standard deployment protection was unchanged, and no
purchase, reservation, user mutation or legal clearance occurred.

See [connector release evidence](AI-CONNECTOR.md) for the individual deployment
IDs, probes and rollback target. SDK/protocol/provider-read evidence does not
prove installation, model behavior or directory approval in ChatGPT, Claude,
Grok or other hosts. This pass did not run a ten-name exact-budget acceptance
test. The public connector release does not promote the commercial account app.

## Remaining build dependency advisory

Full `npm audit --json` still reports five high entries from the same unpatched
`braces` chain through Tailwind's build-time glob/watcher dependencies.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched braces version; the official registry still supplies 3.0.3.
The installed chain is development-only, uses repository-controlled globs and
was not found imported by the request-serving product code. Do not accept
untrusted build patterns or treat this as zero full-audit findings. Revisit a
patched upstream release or a separately tested Tailwind migration; do not use
`npm audit fix --force` to silently replace the design/build system.

## Configuration is not external verification

Vercel CLI 62.5.0 confirmed the existing `hypbit/sajda` project and its Node 24,
Vite, `npm ci`, `build:vercel` and `dist-vercel` settings. Read-only environment
metadata showed no complete Google, X, GitHub or Apple credential pair. Stripe
settings were present only in Preview; Resend settings were present in both
scopes. Their values, provider acceptance and actual delivery/payment lifecycle
were not established by metadata. No credentials are included in this record.

Subsequent targeted, read-only checks used fresh Vercel `env run` values in
memory, not the stale October 4 local files:

- Actual Stripe test API reads confirmed three distinct active monthly USD
  prices/products: **Basic 9, Premium 19, Trading 49**, with matching plan
  metadata. The active test customer portal permits all three prices after
  explicit expansion of its product list, along with payment-method changes,
  invoices and period-end cancellation. Basic/Premium checkout flags are false;
  Trading is true. No checkout, payment, customer or subscription was created.
- The only enabled test webhook still targets
  `https://sajda-k455asubf-hypbit.vercel.app/api/billing-webhook`, an older
  immutable preview. Its signing-secret match and real event delivery were not
  tested. Presence of a protected Secret does not prove matching configuration,
  and inability to retrieve it does not prove it is absent.
- Fresh configuration uses `https://sajda.dev` as canonical origin, while the
  current project's domain list contains only the verified
  `sajda-eight.vercel.app` hostname. The new preview has no aliases. Canonical
  configuration is not proof that a branded domain is assigned or serving the
  application. No domain, DNS, production origin or callback was changed.
- The production email sender targets `mail.sajda.com`; Preview's sender does
  not. At `2026-10-07T00:50:04Z`, both Google and Cloudflare DNS returned
  NXDOMAIN for the intended sender, its default DKIM name and return-path
  names. The root remains on AWS Route53 nameservers. No ownership/access was
  established. Resend's protected Secret was unavailable through official CLI
  retrieval, so provider domain approval, key validity and delivery remain
  unverified. No email was sent. Cached invalid credentials are not evidence of
  invalid live configuration; exact provider-generated records remain unknown.

The Stripe observations were completed at `2026-10-07T00:54:36Z`. Account-specific
provider configuration checks are read-only evidence, not the sandbox
transaction/webhook/entitlement release gate.

## Remaining ordered release actions

1. Confirm and connect the final owned web domain, then align the canonical,
   authentication and provider callback origins. Do not buy or reassign a domain
   merely because a cached configuration names it.
2. Obtain authorized DNS/provider access for the approved mail sender, apply the
   exact Resend records without replacing unrelated inbound MX, and verify
   real password-reset/contact delivery. Recovery links belong to the account
   owner; contact requests go to the configured support address.
3. Configure the four OAuth applications on that stable origin. Apple requires
   the operator's Developer enrollment. Keep unavailable sign-in methods hidden.
4. Update the test webhook only after choosing the stable test callback and
   confirming its secret/protection model. Exercise actual Stripe test checkout,
   webhook, entitlement, retries, portal and cancellation before enabling the
   other checkout flags or any live commerce.
5. Complete operator legal approval and browser/device golden paths. Promote
   the commercial app and enable indexing only when its web gates pass. Apple
   signing, StoreKit sandbox and TestFlight remain a separate app-release gate.

Final domain/callback alignment, verified email delivery, OAuth applications,
real Stripe sandbox lifecycle, legal approval, deployed golden paths and Apple
enrollment/signing remain separate release gates. The native bundle and public
connector are not evidence that the commercial product is ready to launch.

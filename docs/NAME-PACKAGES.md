# Name packages

Implemented 2026-09-13. This is a candidate-comparison workspace, **not a registration or legal-clearance service**. It makes no market-first/unique-competitor claim.

## User journey

Home → **Name packages** (`/name-packages`) → describe the project → choose domain extensions and social channels → run the existing real domain search → compare up to ten grouped names → inspect/check profiles → export an HTML report.

A saved, unarchived Name Project can explicitly prefill this form. The owner-validated router state is consumed and scrubbed; it never triggers a search or AI call by itself. English is the base language, with Swedish, Spanish, French and Chinese copy. The bundled native product uses the same page through More, its existing authenticated account bridge and native share sheet. No native SDK or StoreKit product was added.

## Evidence and score

- Actual domain results are grouped. Required extensions come from the completed search, not an edited form draft. A missing selected extension is added as an explicitly **unverified requested alternative** (no lookup, no naming score, no availability claim). It counts against completeness, so one available `.com` cannot imply that the selected `.se` was also checked.
- Current registry-backed `rdap`/`das`/`whois` results need `availabilityVerified` plus the individual domain observation's `checkedAt`. Cached evidence retains its original age; receipt time cannot refresh it. Restored results must be rechecked. DNS absence is not availability.
- Evidence expires after 30 minutes, including idle/focus changes and report export. Missing, malformed or future observation dates cannot establish current availability.
- Six channels are supported as candidate links: Instagram, TikTok, YouTube, GitHub, X and LinkedIn company pages. The formatter supports a deliberately conservative ASCII subset, not every legal handle format or every platform rule.
- Exact spelling plus `get…`, `try…` and `…hq` alternatives are suggestions only. IDN names are flagged; accents are not silently removed to fabricate an equivalent identity.
- Name fit uses 65% name/character heuristic and 35% exact-handle format coverage across selected channels. Where the existing naming score is available, it contributes 30% of that name/character component. Neither syntax nor shortness proves pronunciation, demand or registrability.
- Package score weights: name fit 40, verified available domain fraction 30, social clearance 20, company clearance 5, trademark clearance 5. **The last three parts currently earn zero. The maximum attainable score is 70/100.** Found-profile conflicts subtract up to 20. Missing checks never disappear from the denominator.
- Verification coverage is separate: current domain observations and completed non-unknown social lookups divided by actual domains + selected channels + company and trademark checks. A found profile increases coverage but is a conflict, not availability.

## What is live vs manual

`POST /api/account/name-package-social` performs up to five exact public GitHub lookups after verified-email authentication, same-account checks and a durable quota reservation. It rechecks authorization after the provider calls. The native account bridge allows this exact POST route with `saved:read` scope; no arbitrary URL fetch is exposed.

The provider uses GitHub's official `GET /users/{username}` endpoint: exact-login match, bounded JSON body (64 KiB), no redirects, fixed origin and a four-second operation timeout. Output contains only handle, platform, status, timestamp and source. A 404 is **no public profile found**, never available/reservable. Rate limits, malformed replies and timeouts become unknown.

Default quota is 15 requested handles/account/hour and 40 per database/hour, conservatively below GitHub's unauthenticated allowance. Failed calls are not refunded; already-exhausted accounts cannot consume the global budget. This is not a guarantee of the upstream egress-IP allowance when other services/databases share it.

Instagram, TikTok, YouTube, X and LinkedIn automatic lookups are **not configured**. Company and trademark clearance is **not automated**. The UI links to Swedish and EU official services with explicit jurisdiction and uncertainty; it does not imply worldwide clearance. Adding other providers requires permitted API access and an evidence model that preserves reserved, blocked, private and uncertain names.

## Privacy and persistence

- Package comparison, chosen handles and observations stay in page memory. No new package table, localStorage history or cross-account cache is created.
- Domain searching retains its existing quota, provider and versioned optional-AI permission controls. Descriptive briefs are sent for advanced searching only after explicit action; AI remains opt-in.
- Clicking a GitHub check discloses exact requested handles to GitHub through Sajda; the company brief and account email are not sent. No profile bio, avatar or contact fields are persisted or returned.
- Neon stores hashed quota identifiers in the existing `sajda.function_rate_limits`. Account deletion removes each environment-scoped owner hash. Opportunistic pruning attempts at most 100 records older than 30 days; this is not a guaranteed retention schedule. The aggregate budget is not an individual account record.
- Report export is script-free, escaped, CSP-restricted HTML without account IDs, secrets, private brief or remote resources. Downloaded/shared copies remain outside account deletion. Full cloud package persistence is **not implemented**; the existing saved project is a form preset, not a saved package report.
- `/name-packages` and its API are private/no-store/noindex. Search ideas are not added to sitemap or public URLs. The existing public SEO release gate is unchanged.

## Verification and limits

Execution evidence for this feature:

- 55 targeted engine, social-provider, account-client and mounted-UI/report tests passed together. An additional real route-guard test passed for guest search access while private routes stayed protected.
- The expanded account-deletion hash contract passed all 12 deletion unit tests after adding the three new namespace identifiers.
- Headless Edge fixtures passed 15 width/language combinations (320/390/1440, EN/SV/ES/FR/ZH), 45 layout measurements, no overflow and no page errors. This includes partial domain coverage, profile conflict/404, expiry, focus/edit recovery and actual report download. No external requests were made by these fixtures.
- One live `observeGithubHandle('octocat')` call returned `profile_found` from the official API on 2026-09-13. It verifies transport and normalization, not registration availability or a signed-in end-to-end Neon quota transaction.
- Vercel preview build passed the existing public-bundle/Neon and noindex SEO guards. The first deployed HTTP smoke confirmed page 200, unsupported API GET 405 and unauthenticated API POST 401, plus the actual lazy page asset. Preview protection was accessed using the authenticated Vercel CLI; it was not disabled.
- Native build stopped at the required `SAJDA_NATIVE_API_ORIGIN` configuration gate. No verified public native API origin was supplied and no signed iOS build or device test is claimed.
- The broad project check is **not green**: existing iOS command-harness tests hit process deadlines on this Windows host. Isolated rerun gave 6/7 passing; two unchanged helper probes timed out with `ETIMEDOUT`/`SIGKILL`. This is evidence of a harness/deadline failure, not proof of an iOS application defect or its OS cause. No timeout was weakened to obtain a pass.
- Final feature preview after correcting the guest route guard: [Name packages preview](https://sajda-65wydlfdr-hypbit.vercel.app/name-packages), deployment `dpl_6AH6PTvgEibzGrvsucgKnmXNkvAK`, Vercel READY, target preview (not production). The link can require Vercel sign-in; application guest access is a separate layer.
- Final preview HTTP rerun passed: `/name-packages` 200 with no-store/noindex and the deployed `NamePackages-DBYx4Cvo.js` asset; API GET 405 and unauthenticated POST 401. No authenticated application transaction or live Neon quota write was performed by this smoke check.
- Broad project run completed with **1,473 tests: 1,461 pass, 4 fail, 8 explicitly skipped**. One failure was the old deletion-counter test expectation, then corrected and all 12 deletion tests passed on rerun. The remaining failures were the three iOS process-harness cases described above; the isolated unchanged file still has one failure. Do not report the broad suite as passed. Separate final UI contracts passed; language contracts reported 79 English-reference dictionaries with zero key/placeholder mismatches; application/node/Vercel TypeScript checks passed.

Targeted tests cover deterministic grouping/scoring, false-availability prevention, expiration, malformed inputs, streaming requests, authentication and account/session races, client envelope validation, mounted UI interactions, localization and safe report export. Headless browser fixtures use synthetic names/accounts/provider replies and block external traffic; they do not establish live social availability.

No account registration, paid provider plan, social-handle reservation, company incorporation, trademark application or purchase is performed. No App Store archive, StoreKit transaction or public-production approval follows from this feature. See the separate [launch audit](LAUNCH-AUDIT-2026-09-13.md).

## Primary-source basis (checked 2026-09-13)

- [Bolagsverket via Verksamt: company-name similarity search](https://verksamt.se/bolagsverket/hjalp-att-valja-foretagsnamn): advisory search, individual registration review remains separate.
- [PRV: trademarks](https://www.prv.se/sv/varumarke/): company, domain and trademark rights are distinct checks.
- [GitHub: get a user](https://docs.github.com/en/rest/users/users#get-a-user), [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [username policy](https://docs.github.com/en/site-policy/other-site-policies/github-username-policy): public observation is not registration clearance.
- [YouTube channels.list](https://developers.google.com/youtube/v3/docs/channels/list): approved API access would be needed for automatic handle lookup.
- [X user lookup](https://docs.x.com/x-api/users/lookup/introduction), [TikTok Display API](https://developers.tiktok.com/doc/display-api-get-started/), [LinkedIn organization lookup](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api): authorization/product-access constraints prevent treating public page failures as availability.

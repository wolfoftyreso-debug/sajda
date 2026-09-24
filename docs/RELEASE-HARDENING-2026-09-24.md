# Release hardening — 24 September 2026

Application hardening commit: `23fbca1`; verification-harness correction: `eb3c712`. This is an evidence ledger, not a certification, legal opinion or unconditional launch approval.

## Implemented

- Frontend TypeScript now enforces `strict` and `noImplicitAny`; lint rejects warnings. Explicit session-expiry, URL and error-status narrowing replaces ambiguous types. No new type suppression was introduced.
- Auth and billing classify malformed Vercel JSON correctly, including both `SyntaxError` and Vercel's wrapped `Error(statusCode=400)`. Provider/stream failures remain distinguishable. Authentication bounds declared and actual request size.
- Database health checks the actual schema used by the application, enabled name-project fields and the current validated API-scope constraint. A reachable but obsolete database cannot advertise readiness.
- Verification CI builds the supported Vercel artifact and exercises actual HTTP handlers in a credential-isolated loopback process. Six public MCP tools are checked, not the obsolete two-tool inventory.
- GitHub Actions are pinned to verified commits. Dependency update PRs are bounded and require review; automatic merging is not enabled.
- Protected-preview HTTP verification preserves cookie presence while redacting cookie values and protection headers. It no longer makes a no-cookie assertion pass merely by discarding that evidence.
- Auth no longer describes privacy notices as blanket consent. Five-language rights/contact information and pricing-to-terms navigation are implemented.
- README and developer handoff describe the real Neon/Better Auth/API architecture, rather than obsolete setup assumptions. Required third-party licences and truthful first-party export disclosures remain.
- Native account requests now support Capacitor's opaque `null` origin without relaxing the relative-route or account-owner boundary. The pre-fix `ERR_INVALID_URL` was reproduced; 14 native/browser request regressions passed after repair.
- Native packaging explicitly copies all 13 connector logos and their licence alongside Sajda's three marks. The previous iPhone artifact had no connector assets. A rebuilt bundle loaded all 13 developer-page images without browser errors; website SEO/service-worker files remain excluded.
- Native schema initialization disables Zod's eval/JIT probe before importing application schemas. Validation remains active and the CSP still forbids `unsafe-eval`; a regression reproduces the original `Function()` attempt and verifies no attempt after the fix.

## Infrastructure changes actually made

- Connected Vercel project `hypbit/sajda` to `wolfoftyreso-debug/sajda`, production branch `main`; read back the link from Vercel.
- Added the production-only **GitHub Verify** Deployment Check after finding autoaliasing had no blocking CI requirement. Readback confirmed `externalCheckName=verify`, `blocks=deployment-alias`, `requires=none`, timeout 1,200 seconds, ID `chk_f206d48b-7ff2-4f4a-87d7-63cdef7aa3cc`. No new service/plan was purchased and existing checks/protection were left intact. This follows [Vercel's documented GitHub check mechanism](https://vercel.com/docs/deployment-checks); actual production aliasing is not yet tested because the email gate stops the build first.
- Verified the production Neon identity against current Vercel configuration and the previously reviewed production project. Before migration, every application table contained zero rows; only the nine-entry migration ledger was populated.
- Reviewed and applied pending migrations 0009–0020 in the existing transactional runner. Fresh readback: **21 applied, zero pending**, checksums verified, structural readiness true with name projects enabled. No accounts, entitlements, sources or purchases were seeded.
- These migrations are not described as universally reversible: some widen constraints, change a view or introduce future cascades. No speculative down migration was attempted. The preflight observed an empty application database; it did not verify a provider PITR restore.

## Executed verification

- Eight opt-in integration tests ran against the reviewed development Neon database, with **8 passes / 0 failures / 0 skips**. They covered membership, deletion, native commercial state, project concurrency, Trading scenarios, AI allowances and contact idempotency. Owned test records were removed or rolled back; no provider calls were made by those tests.
- The separate commerce-store harness passed **14 checks** against actual Postgres, including duplicate events, fencing, rollback, cancellation periods and namespace isolation. Its Stripe observations were synthetic, not payment evidence.
- Browser review of legal/pricing/auth/Brand Index passed **32 cases** across English/Swedish and 320/390/768/1440 px. No overflow, clipping, broken visible images or browser errors. Terms navigation was clicked. This isolated build correctly showed account authentication unavailable and did not test login.
- `npm audit --omit=dev` reported **zero known advisories**. This is not a claim of zero vulnerabilities.
- The known-secret scan found no matches or suspicious secret files among 957 tracked/proposed files before the final evidence document. Credentials, demo passwords, screenshots and temporary provider probes remain ignored.
- An initial full run overlapped the Vercel-body regression fix and reported one failing commerce test. The corrected stable auth/commerce subset passed 57 tests. The final local `check:ci` passed: **1,789 tests / 0 failures / 8 opt-in skips**, lint with no warnings, strict types, language/UI/SEO and provider-boundary checks, Vercel build and **71 credential-isolated HTTP checks**. The eight opt-in checks were executed separately against Neon as described above, not silently counted as default-suite passes.

## Stripe: real provider tests, limited scope

In the existing explicitly verified test sandbox:

- Read back the existing USD 49/month Trading Price and cancellation portal; created no duplicate catalog items.
- Executed a provider-only test-card payment for USD 49: succeeded.
- Repeated the request with the same idempotency key: the same PaymentIntent was returned.
- Executed a declined-card case: `card_declined`, no successful payment; canceled that exact test intent.
- Refunded the exact successful sandbox payment: refund succeeded.

No live funds moved, no customer was attached, no subscription or Sajda entitlement was created. These tests use Stripe's [documented sandbox PaymentMethods](https://docs.stripe.com/testing). They **do not** prove hosted checkout, webhook delivery, application reconciliation, subscription renewal or receipt delivery. The sandbox's `charges_enabled=false` metadata did not prevent these test-mode transactions; do not infer sandbox failure from that field alone.

## External boundaries still requiring completion

- **Email:** no Resend resource is installed for this Vercel team, and production lacks the email key/sender. Marketplace discovery offered paid plans beginning at USD 20/month, not a free plan. No plan was purchased. The owner's intended sender remains `mail.hypbit.com`; contact recipient remains `dev@hypbit.com`. Sending, delivery and recovery links are not externally verified.
- **Commercial release:** production has no Stripe configuration. Live onboarding, final offer/tax/consumer terms and the full checkout–webhook–entitlement lifecycle remain gates. Basic/Premium checkout is intentionally unavailable, not silently claimed complete.
- **Privacy/terms:** the controller must approve actual bases, retention, recipients/agreements, transfers and consumer offer details. See [the operator worksheet](LEGAL-RELEASE-DECISIONS.md); no legal commitments were invented.
- **Public web release:** a production artifact and its intended public canonical origin must be verified after configuration is complete. Preview protection is retained, not disabled to disguise a launch.
- **App Store:** distribution signing, Apple enrolment, StoreKit provider testing and physical-device/TestFlight checks remain separate from unsigned simulator compilation.

The anonymous connector is an independently deployed surface. Its availability does not establish readiness of the account/payment product.

## Final verification record

- Application preview **READY**, runtime code commit `23fbca1`: <https://sajda-lyt96tbcv-hypbit.vercel.app>, deployment `dpl_8SyUQFefRsLprvxZRqtD8DQYcSNM`. Forty-two functions compiled. The operator's scoped share link is kept out of source control; deployment protection remains enabled.
- Deployed browser sign-in and refresh passed for the controlled Trading demo account. Four widths (320, 390, 768, 1440 px) had no horizontal overflow; all 13 connector logos loaded; no browser exceptions were recorded. The demo grant expires 1 October 2026 and is not a paid subscription.
- Deployed private-account verification passed **31 checks**: browser/REST/MCP ownership and data parity, 21-tool discovery, denied anonymous access, denied read-only-key writes, key revocation and rejection after revocation. The temporary key was revoked. No paid research was started. The full deployed HTTP smoke passed **71 checks**, with database health `200 / connected`, and passed again after the cookie-evidence parser was hardened.
- GitHub's preview-environment run exposed three fixture defects: tests incorrectly assumed a development API-key namespace. The fix keeps production authorization unchanged, binds fixtures to the validated test environment and explicitly tests rejection across environments. Both preview and development focused runs passed. The corrected [GitHub Verify run for `eb3c712`](https://github.com/wolfoftyreso-debug/sajda/actions/runs/35947355340) completed **SUCCESS**, including **1,791 passing tests / 0 failures / 8 opt-in skips**, `check:ci` and the production-dependency audit.
- The first [iPhone workflow](https://github.com/wolfoftyreso-debug/sajda/actions/runs/35946554238) passed compilation/process launch but its screenshot was blank. That was not accepted as UI verification. Commit `b8f3b4c` replaced the fixed ten-second screenshot delay with a bounded Debug-simulator DOM probe: five visible navigation links, a heading, enabled search input and no captured JS/CSP errors. The [diagnostic run](https://github.com/wolfoftyreso-debug/sajda/actions/runs/35947766864) rendered the full UI but correctly **failed** on `CSP: script-src eval`; the captured Zod probe was then repaired. The earlier blank frame's timing alone is not proof of an application crash. Final simulator evidence after this fix is still required; none of these artifacts is a signed App Store binary or a physical-device/payment test.
- The automatic main-branch production deployment `dpl_7GGtzimiKhxh8qn7ArjHLCsBZTAg` was inspected. It failed deliberately at the configuration gate: `production_email_key_required`, `production_email_sender_required`. The former `unused_function` failure is not the current blocker. No release guard was bypassed and no preview environment was promoted to production.
- A bounded Vercel 5xx-log query for the new preview returned no matching logs; an unfiltered query confirmed recent health/API/native-boundary requests were present. This is not proof of complete telemetry or continuous monitoring.
- A further deployed browser login/Trading/developer-page pass recorded both uncaught exceptions and CSP-violation events: **zero of each**. The observed eval issue is native-specific; the web CSP was not weakened.

Remaining final check: native startup repair. No unconditional commercial launch approval is implied by this intermediate record.

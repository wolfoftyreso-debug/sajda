# Connector expansion and demo verification — 24 September 2026

Historical evidence for the connector rollout. The later [release-hardening record](RELEASE-HARDENING-2026-09-24.md) supersedes its application-preview, schema, verification and repository status; this record is retained for provenance.

## Delivered

- A shared, typed catalogue for 13 clients: ChatGPT, Claude, Grok, Perplexity, Cursor, Replit, Lovable, Codex, VS Code Copilot, Windsurf Cascade, Cline, Zed and Gemini CLI.
- Real locally bundled SVG logos with pinned provenance and licence notices, not monograms or invented graphics. See [asset evidence](connector-assets.md).
- Five-language application setup, grouped by assistant, builder and editor. Host-specific configuration uses the documented schema, and instructions explicitly preserve existing server settings.
- The public hub, downloadable kit and manifest use the same catalogue. Public configuration contains no account keys, and no setup link installs or authorizes itself.
- Authenticated account documentation distinguishes private scoped access from anonymous naming research. No claim of universal OAuth, directory approval or completed installation inside every client.
- Landvex AB particulars on the legal page, based on the owner's operator confirmation and company-published evidence. Remaining legal gates are in [the legal review](LAUNCH-LEGAL-2026-09-17.md).

## Deployed surfaces

- Public naming connector and setup directory: <https://sajda-connector.vercel.app/#setup>.
- Application preview: <https://sajda-op2sxjmea-hypbit.vercel.app>. Preview protection remains enabled; the operator receives a scoped expiring share link separately.
- Demo Trading grant for the user-requested account expires 1 October 2026. It is an operator-provisioned test entitlement, not a Stripe purchase or proof of email delivery. No password, share secret or API credential is stored in this document or committed source.

## Actual verification

- Full suite: **1,770 passed, 0 failed, 8 skipped** (1,778 total). Skipped provider/database opt-in checks are not counted as verified.
- TypeScript application/API checks, lint, five-language key/placeholder contracts, UI contracts, SEO policy, Neon boundary and Node syntax checks passed.
- Connector-focused tests passed: logos/provenance, all five languages, seven configuration formats, clipboard outcomes, unsafe URL rejection, package boundaries and public/private separation.
- Isolated browser fixture: 20 locale/viewport combinations (320, 390, 768, 1440 px), 260 loaded logos, 140 configuration-copy checks, 280 layout states; no overflow, browser errors or external/API requests.
- Deployed anonymous MCP discovery: six tools, two prompts, two resources. A real business-name request returned **5 of 10** with the registered-domain shortfall, checked status and next steps explicitly reported; no fabricated missing names or legal clearance.
- All 13 deployed logo paths returned SVG successfully. Public `/api/auth`, `/api/account/membership` and `/api/mcp` returned 404; no account cookies. Downloaded kit checksum matched the manifest.
- Preview browser sign-in succeeded. Live membership returned `trading`; refresh retained the session; Trading layout did not overflow at four widths; all 13 developer-page logos loaded without browser exceptions.
- Deployed authenticated account verification: 31 HTTP checks passed, including REST/MCP ownership, 21-tool discovery, matching saved domains/projects/Trading scenarios, Trading status/report reads, 403 for unauthorized writes, and 401 for anonymous/revoked access. A temporary read-only key was created for the controlled demo account, then revoked and verified unusable. No paid research was started.
- Runtime 5xx scans at the time of these checks returned no matching logs. This is a bounded observation, not continuous monitoring or a universal absence-of-errors claim.

## Release boundary

The public connector update is deployed; the whole commercial product is **not approved for unrestricted launch**. Production domain/canonical routing, real recovery/verification/deletion email delivery, complete consumer/privacy disclosures and billing evidence remain release gates. Apple enrolment, signed device/TestFlight checks and final App Store declarations are still outstanding. A protected preview does not become a public authenticated MCP service merely because a local contract test passes.

The initial GitHub push was rejected with `This repository was archived so it is read-only` (HTTP 403). After explicit owner approval, the repository was unarchived without changing visibility or its default branch. Both commits were pushed and remote `main` was verified at `c0dd2ee13233b3883c2aa5f17b770611b2940722`. Deployment remains separate from Git push.

## Production recheck after launch request

The owner's request was to launch unless a release objection remained. Read-only Vercel checks found concrete blockers:

- The main project's production target `dpl_9A7FYyV3geWBn6DXtfeXPHKacsUq` is an old failed deployment (`unused_function`), not the successfully verified latest preview. The configured `sajda-eight.vercel.app` production hostname returned HTTP 404. A new production build must use production settings, not simply promote the preview with its test-account/database context.
- Production environment inventory contains neither `RESEND_API_KEY` nor `SAJDA_EMAIL_FROM`. The implementation requires email verification for new password accounts, so this blocks activation, recovery and the related communication flows.
- Production environment inventory contains no `STRIPE_*` variables. Paid checkout/webhook/entitlement lifecycle is not verified for production, and paid offers remain unavailable in the application.
- Privacy/consumer disclosures and their operational evidence remain incomplete as described in the legal review. Apple distribution is a separate release gate and need not block a properly scoped web release.

Verdict: **NO-GO for unrestricted account/payment launch**. The isolated anonymous connector is already live and can remain available. No production deployment, environment mutation, DNS change or live payment activation was performed in this recheck.

See [account API](ACCOUNT-API.md), [mobile review](LAUNCH-MOBILE-2026-09-17.md), [SEO review](LAUNCH-SEO-2026-09-17.md) and [legal review](LAUNCH-LEGAL-2026-09-17.md) for the separate evidence and limitations. No live purchase, DNS change, account password reset, broad protection disablement or marketplace submission was performed.

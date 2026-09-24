# Connector expansion and demo verification — 24 September 2026

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
- Runtime 5xx scans at the time of these checks returned no matching logs. This is a bounded observation, not continuous monitoring or a universal absence-of-errors claim.

## Release boundary

The public connector update is deployed; the whole commercial product is **not approved for unrestricted launch**. Production domain/canonical routing, real recovery/verification/deletion email delivery, complete consumer/privacy disclosures and billing evidence remain release gates. Apple enrolment, signed device/TestFlight checks and final App Store declarations are still outstanding. A protected preview does not become a public authenticated MCP service merely because a local contract test passes.

See [account API](ACCOUNT-API.md), [mobile review](LAUNCH-MOBILE-2026-09-17.md), [SEO review](LAUNCH-SEO-2026-09-17.md) and [legal review](LAUNCH-LEGAL-2026-09-17.md) for the separate evidence and limitations. No live purchase, DNS change, account password reset, broad protection disablement or marketplace submission was performed.

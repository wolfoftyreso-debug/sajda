# Sajda connector distribution

Source release: 17 September 2026. Public MCP 1.6.0; authenticated MCP 1.5.0.

## Product contract

One public HTTPS connection serves six read-only tools to MCP-capable clients.
An optional host-side naming companion recognizes an appropriate moment for
an unnamed business/product/app, previews a minimal brief and asks once before
searching. Direct explicit Sajda requests do not need a second consent question.
No background chat reader, account scraper or remote intent-detection endpoint
exists. Installation, enabling contextual offers, and approving a search are
distinct decisions. Hosts retain control of invocation and permission policies.

`shared/connector-policy.ts` defines the canonical policy. It is exposed by both
MCP servers, the setup UI, plain-text download and generated client rules.
The focused portable skill mirrors its versioned workflow. Unknown checks and
shortfalls remain explicit: asking for ten never silently yields six.

## Distribution surfaces

- Public installation hub: `https://sajda-connector.vercel.app/#setup`.
- Anonymous endpoint: `https://sajda-connector.vercel.app/api/mcp/public`.
- Download: `/downloads/sajda-connector.zip` and accompanying SHA-256.
- Machine metadata: `/connector.json`, `/policy.json`, `/llms.txt`.
- Optional host instructions: `/host-instructions.txt`.
- App setup: `/developers#ai-assistants`, five UI languages, six host guides.
- Source: `integrations/sajda-connector/`, portable and Codex-compatible manifests,
  focused naming skill, Cursor config/rule, Replit and Lovable instructions.

Current official documentation describes custom MCP connections for ChatGPT,
Claude, Grok, Cursor, Replit and Lovable. Account/workspace gates vary. Client
documentation is not an actual installation test. Builder connectors assist
the development chat; they do not automatically become a published app feature.
See dated [assistant research](research/ASSISTANT-CONNECTOR-COMPATIBILITY-2026-09-17.md)
and [builder research](research/BUILDER-CONNECTOR-COMPATIBILITY-2026-09-17.md).

## Protocol metadata

`prompts/list` advertises `sajda-naming-companion` and `find-business-names`.
`prompts/get` accepts only an optional supported locale, not business context.
`resources/list` advertises `sajda://connector/guide` and
`sajda://connector/policy`. All are static: no search quota consumption or provider
calls. Existing request-rate guards still apply. No subscriptions, sampling or
elicitation are supported. Merely retrieving metadata does not enable a companion
or authorize a search. Private requests still require their existing scoped key.

## Build and safety

`node scripts/build-public-connector.mjs` produces a strict-allowlisted isolated
Vercel artifact. No database/account/payment dependencies or secret values enter
the bundle or ZIP. The package builder rejects unreviewed files, symlinks,
unexpanded policy markers and unfinished placeholders. ZIP entries are bounded,
path-validated, deterministic UTF-8 text. Downloading does not execute a script
or mutate host settings. Users merge configs rather than overwrite existing ones.

The separate connector project is `prj_ZyWiT77gZEULbBCF8Bale2nhEZyv`; main app is
`prj_UO900Jp4qJF1eS4hkOrebIzwMVlI`. Preserve deployment protection and project linkage.
Use `vercel curl` for protected preview checks, never disable protection.

## Verification boundaries

Automated protocol tests cover real SDK initialization, unchanged tool counts,
prompt/resource reads, rejected context arguments/unknown URIs, no search work
during metadata discovery, private authentication and rate limits. UI tests cover
six hosts, decoded installation payloads, opt-in, clipboard failures and five
languages. Package validators and independent scenario review cover installation
and policy consistency. [Scenario evaluation](research/CONNECTOR-COMPANION-EVALUATION-2026-09-17.md)
explicitly distinguishes expected assistant behavior from executed host behavior.

No end-to-end installation in third-party host accounts or public marketplace
approval is claimed. OpenAI/Claude directory submission requires an identified
publisher and platform review. Actual host model timing remains to be tested in
each installed client, including decline and prompt-injection scenarios.

## Release evidence — 17 September 2026

- Public production: `dpl_Aj5PUgXCbuKqz4aFhKDxJ9g4htsv`, stable alias
  `https://sajda-connector.vercel.app`, READY. Isolated artifact: 319 bundled
  inputs, zero private-service dependencies, no account/database/payment routes.
- Main preview: `https://sajda-otpkpd0qv-hypbit.vercel.app`,
  `dpl_7wDDgArq44vVhMuQb3YjmFFNbhzK`, READY. Main production not promoted.
- 70 focused API/protocol/count/UI tests and 7 package/distribution/isolation
  tests passed. App/API typechecks, focused lint and 92 English-source language
  dictionaries passed. Portable manifests were validated against their actual
  live Draft 2020-12 schemas, with negative controls; legacy and skill validators
  passed separately.
- Browser: five languages × widths 320/390/768/1440, 140 geometry checks,
  real host-tab/clipboard/opt-in interactions, no overflow or JS errors. Fixture
  deliberately blocked external requests. Public deployed hub also loaded in
  a real browser at those four widths without horizontal overflow.
- Anonymous deployed SDK probe passed initialization, six tools, two prompts,
  two resources, rejected transcript input, private-route 404s and ZIP checksum.
- Real French business-name request with Swedish explanation returned 5/10,
  with 5 known-taken exclusions explained before the recommendations. Every
  returned name had fresh authoritative available-domain evidence. This was a
  provider-backed SDK test, **not** proof of automatic invocation inside a host.
- Protected preview API smoke passed discovery/OpenAPI, the new prompts/policy,
  invalid input (400), unauthorized private access (401), and live REST/MCP
  naming calls. They returned 5/10 and 6/10 with explicit excluded-domain reasons.
- Production 5xx-filtered log query returned no matching logs. This is a bounded
  post-deploy check, not evidence of configured continuous monitoring.

Local visual evidence: `tmp/connector-qa/report.json` and its 20 screenshots;
public hub screenshots: `tmp/connector-hub-mobile.png`, `tmp/connector-hub-desktop.png`.

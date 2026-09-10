# AI data sharing and permission

Implemented 2026-09-10. This documents the actual transport and permission boundary, not a claim of legal or App Store approval.

## Data and recipients

Only two operations can currently call third-party AI:

| Action | Input sent | Purpose |
| --- | --- | --- |
| Advanced creative search | Normalized brief text and requested output language | Interpret themes and naming directions |
| Deep Review | Search theme, output language and deterministic Top 10 domain names | Write concise editorial notes; cannot alter ranking |

Both use Google Gemini through Vercel AI Gateway. Gateway inference is restricted to the `google` and `vertex` providers, so a provider fallback cannot silently add an undisclosed recipient. Credentials, account email, payment details and account IDs are not prompt fields. Users can nevertheless type personal or confidential data into a brief or theme; the disclosure says not to do so.

The existing gateway requests `store: false`, `disallowPromptTraining: true` and `zeroDataRetention: true`. These are configuration controls, not a verified assertion that no operational metadata is retained anywhere. No universal retention or deletion guarantee is displayed in the consent UI. Production provider agreements, actual routing settings and privacy declarations still need operator verification.

Exact availability checks, normal creative generation, Swipe, deterministic ranking, local logo SVGs and local marketplace descriptions do not call AI. Registry and registrar lookups still use external services. "AI off" never means all processing stays on the device.

## Consent contract

The product endpoints `/api/domain-search` (advanced creative briefs only) and `/api/deep-review` accept:

```json
{"aiConsent":{"version":"2026-09-10","accepted":true}}
```

Missing consent selects non-AI processing. Declined, malformed, extra-field or outdated supplied consent returns HTTP 400 with `code: ai_consent_invalid`. The gateway independently refuses credential lookup, AI allowance reservation and provider transport without this exact current permission. Exact domain checks never call AI, even with permission.

The UI is off by default. Consent is obtained with a deliberate button after visible recipient, input and purpose disclosure. The setting is saved as version plus boolean under `sajda.ai-permission`, separately in each browser/app origin on each device. It is not an account-wide consent ledger and is not inferred from sign-in, subscription or an API key. Updating the disclosure requires a version bump and therefore a fresh opt-in.

Users can revoke in the search/review controls, Account, or the signed-out Legal privacy section. The next request rereads the current value and removes any stale caller-cached consent. Storage events propagate revocation across tabs. Turning off cannot recall requests already dispatched. Changing a preference never starts a search, reruns a review, or spends credits. If browser storage is unavailable, the explicit setting lasts only for the current loaded session.

## API and MCP

The stable `/api/v1/public/domains`, `/api/v1/domains` and MCP `domains_search`/`domains_check` contracts do not accept advanced briefs and never invoke third-party AI. Their strict schemas reject `advanced`, `brief` and `aiConsent`. Do not invent AI support in these interfaces. A future AI tool must publish the same versioned disclosure and require explicit informed permission from the affected user; API-key possession alone is insufficient.

## Evidence and limits

Tests cover strict consent parsing; real endpoint rejection; local review with AI configured but no permission and zero external calls; gateway refusal before credential/quota access; five-language mounted opt-in/decline/revoke controls; persisted choice; cross-tab revocation; and actual web/native product-transport branches with mocked provider boundaries. No paid provider call, email or account mutation is needed for these tests.

The existing opt-in runtime probe `scripts/check-ai-gateway-runtime.mjs` now requires `--allow-ai-sharing` for AI modes. That flag permits sending only its documented synthetic fixtures to Google Gemini through Vercel and may consume paid allowance. The exact-domain probe defaults to no AI. This revision did not run an external provider probe.

Physical-device accessibility, production privacy-policy operator review and App Store privacy declarations remain release gates. Consent implementation is not a substitute for them.

Primary sources checked 2026-09-10:

- [Apple App Review Guidelines, 5.1.1 and 5.1.2](https://developer.apple.com/app-store/review/guidelines/) — disclosure, explicit permission and withdrawal.
- [Vercel provider routing](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options) — `only` restricts allowed inference providers.
- [Vercel Zero Data Retention routing](https://vercel.com/blog/zdr-on-ai-gateway) — provider-level routing controls; not a blanket claim about every service log.
- [Google Gemini zero data retention](https://ai.google.dev/gemini-api/docs/zdr?hl=en) — distinctions between training use and abuse-monitoring retention.

# AI data sharing and permission

Updated 2026-09-11. This documents the actual transport and permission boundary, not a claim of legal or App Store approval.

## Data and recipients

Only two operations can currently call third-party AI:

| Action | Input sent | Purpose |
| --- | --- | --- |
| Creative search and refinement | Theme, project brief, language, criteria, explicit rejection reasons and up to 50 previous names (including up to 5 favorites) | Generate candidate labels across descriptive, evocative, compound and invented naming directions |
| Deep Review | Search theme, output language and deterministic Top 10 domain names | Write concise editorial notes; cannot alter ranking |

Both use Google Gemini through Vercel AI Gateway. Gateway inference is restricted to the `google` and `vertex` providers, so a provider fallback cannot silently add an undisclosed recipient. Credentials, account email, payment details and account IDs are not prompt fields. Users can nevertheless type personal or confidential data into a brief or theme; the disclosure says not to do so.

The existing gateway requests `store: false`, `disallowPromptTraining: true` and `zeroDataRetention: true`. These are configuration controls, not a verified assertion that no operational metadata is retained anywhere. No universal retention or deletion guarantee is displayed in the consent UI. Production provider agreements, actual routing settings and privacy declarations still need operator verification.

Exact availability checks, Swipe, deterministic ranking, local logo SVGs and local marketplace descriptions do not call AI. Creative search without permission uses server-side rules. Registry and registrar lookups still use external services. "AI off" never means all processing stays on the device.

Creative generation makes at most one Gateway request per search, with an allowlisted model, 1,800 output tokens and a 6.5-second provider deadline inside the bounded search runtime. It accepts at most 24 distinct labels for independent registry verification. The model cannot supply availability, prices, ratings or valuations. Fewer returned names are not padded with rule-generated names and mislabelled as AI. Unusable or unavailable AI output falls back to local rules, with the source and fallback reason in the response.

Naming, refinement and review share a durable allowance: three requests per IP per UTC day, 50 requests per environment per UTC day by default (configurable up to 100), and at most two concurrent requests with 20-second leases. Completed requests can follow immediately; there is no per-minute wait. Failed attempts still consume quota. Database uncertainty fails closed, and signing in does not bypass these limits. This removes a delay, not a daily spending cap.

The original search and feedback remain in the active page's memory for refinement. The original brief and feedback are not added to persistent result storage or a new server learning database. Explicit refinement starts a new search; showing the next ten cached results does not. The previous list remains visible if refinement fails or returns no results. Favorites selected for refinement are style references, not saved account domains.

## Consent contract

The product endpoints `/api/domain-search` (creative searches only) and `/api/deep-review` accept:

```json
{"aiConsent":{"version":"2026-09-11","accepted":true}}
```

Missing consent selects non-AI processing. Declined, malformed, extra-field or outdated supplied consent returns HTTP 400 with `code: ai_consent_invalid`. The gateway independently refuses credential lookup, AI allowance reservation and provider transport without this exact current permission. Exact domain checks never call AI, even with permission.

The UI is off by default. Consent is obtained with a deliberate button after visible recipient, input and purpose disclosure. The setting is saved as version plus boolean under `sajda.ai-permission`, separately in each browser/app origin on each device. It is not an account-wide consent ledger and is not inferred from sign-in, subscription or an API key. Updating the disclosure requires a version bump and therefore a fresh opt-in.

Users can revoke in the search/review controls, Account, or the signed-out Legal privacy section. The next request rereads the current value and removes any stale caller-cached consent. Storage events propagate revocation across tabs. Turning off cannot recall requests already dispatched. Changing a preference never starts a search, reruns a review, or spends credits. If browser storage is unavailable, the explicit setting lasts only for the current loaded session.

## API and MCP

The stable `/api/v1/public/domains`, `/api/v1/domains` and MCP `domains_search`/`domains_check` contracts do not accept advanced briefs and never invoke third-party AI. Their strict schemas reject `advanced`, `brief`, `refinement` and `aiConsent`. The new refinement contract is for the web/native product transport, not an undocumented API/MCP feature. A future AI tool must publish the same versioned disclosure and require explicit informed permission from the affected user; API-key possession alone is insufficient.

## Evidence and limits

Tests cover strict consent parsing; real endpoint rejection; local review with AI configured but no permission and zero external calls; gateway refusal before credential/quota access; five-language mounted opt-in/decline/revoke controls; persisted choice; cross-tab revocation; and actual web/native product-transport branches with mocked provider boundaries. No paid provider call, email or account mutation is needed for these tests.

The opt-in runtime probe `scripts/check-ai-gateway-runtime.mjs` requires `--allow-ai-sharing` for AI modes. Run with `node --import tsx`. That flag permits sending only its documented synthetic fixtures to Google Gemini through Vercel and may consume paid allowance. The `refinement` mode performs two bounded naming requests and verifies that prior labels are excluded. The exact-domain probe defaults to no AI. Runtime evidence is recorded separately; the existence of this script does not prove a provider call succeeded.

Physical-device accessibility, production privacy-policy operator review and App Store privacy declarations remain release gates. Consent implementation is not a substitute for them.

Primary sources checked 2026-09-10:

- [Apple App Review Guidelines, 5.1.1 and 5.1.2](https://developer.apple.com/app-store/review/guidelines/) — disclosure, explicit permission and withdrawal.
- [Vercel provider routing](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options) — `only` restricts allowed inference providers.
- [Vercel Zero Data Retention routing](https://vercel.com/blog/zdr-on-ai-gateway) — provider-level routing controls; not a blanket claim about every service log.
- [Google Gemini zero data retention](https://ai.google.dev/gemini-api/docs/zdr?hl=en) — distinctions between training use and abuse-monitoring retention.

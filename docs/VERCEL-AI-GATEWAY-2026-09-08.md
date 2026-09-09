# Vercel AI Gateway — Sajda

## Implemented and deployed

Sajda's optional brief analysis and Deep Review editorial notes now use the
Vercel AI Gateway Responses endpoint. Direct OpenAI calls were removed from
the active APIs and legacy loopback server. No Supabase or external auth is
involved. Registry availability and registrar prices remain separate,
evidence-based server checks; AI cannot change review scores or their order.

Project: `hypbit/sajda` (`prj_UO900Jp4qJF1eS4hkOrebIzwMVlI`).

Latest tested preview: <https://sajda-kikr3swsm-hypbit.vercel.app>

Deployment: `dpl_9VH3oZFaQwiRVsZdNQT9zRsJxFUc`, READY, Preview, functions in
Frankfurt. This is **not a production promotion or whole-product launch approval**.

## Configuration

Only Preview was enabled:

| Variable | Configured value |
| --- | --- |
| `AI_GATEWAY_ENABLED` | `true` |
| `AI_GATEWAY_BRIEF_MODEL` | `google/gemini-2.5-flash-lite` |
| `AI_GATEWAY_REVIEW_MODEL` | `google/gemini-2.5-flash-lite` |
| `SAJDA_AI_DAILY_LIMIT` | `50` |

The existing Vercel project OIDC is enabled with a team issuer. The server
obtains a current token through `@vercel/oidc` 3.8.5 at request time; no Gateway
API key was created. The production DB, account secret and AI configuration
have not been provisioned by this change.

An explicit Gateway key is supported only for local/non-Vercel use. Deployed
Vercel functions ignore that variable and always use their own OIDC. Project Gateway
budgets apply to OIDC requests, not API-key requests; any local key needs its own
provider/key budget. Never expose it through a `VITE_` variable or browser code.

The server accepts only the two reviewed inexpensive model IDs listed in
`.env.example`. Changing the model allowlist requires review of cost, latency,
structured-output behavior and privacy compatibility.

## Cost, privacy and failure boundaries

- Existing Gateway credit balance was read successfully; no credits were bought.
- Set and re-read a **1 USD monthly project budget**. Vercel budgets are soft:
  an already-started request can cross the threshold. This is not a hard dollar
  guarantee or a change to Sajda's customer pricing.
- Applied additive, checksummed `0003_ai_allowance.sql` to the existing
  Preview/Development Neon resource. No existing product records were rewritten.
- Shared atomic PostgreSQL allowance: 50 requests/UTC day/environment by default,
  configurable to at most 100; three/IP/day, one/IP/rolling minute, two concurrent
  requests with 20-second leases. Brief and review consume the same allowance.
- Only Vercel's trusted forwarded-IP header is accepted in Vercel; local use
  requires an actual loopback socket. IPs are HMAC hashed; no prompts, candidate
  lists, output or customer/session tokens are stored in quota tables.
- Missing/failed quota storage, authentication, incompatible output, provider
  errors, expiry and exhausted allowance fall back to deterministic analysis.
  Failed provider attempts consume allowance conservatively; retries do not
  refund or reset it. This is an infrastructure safeguard, not a replacement
  for a future server-enforced paid entitlement/free-trial model.
- Requests use `store:false`, `disallowPromptTraining:true`, and per-request
  `zeroDataRetention:true`. Hypbit is Pro, so per-request ZDR is available without
  the team-wide ZDR add-on. No global team privacy/routing settings were changed.
- **BYOK limitation:** Vercel exempts BYOK from its training filter and can use
  keys explicitly marked ZDR-compliant by their owner. The team's BYOK inventory
  could not be inspected because browser access was unavailable. No guarantee
  about separately configured BYOK agreements is made.
- Input, output size, model, schema, output tokens (600/1,400) and deadlines
  (4s/5.5s) are server controlled. There is no direct-provider retry, external
  URL option, model tool access or browser credential forwarding.
- Logs contain generated request ID, task, model, outcome, HTTP status and
  duration only; no raw provider errors, prompts, responses or credentials.

## Actually verified

- `npm run check`: 117 passing automated tests, one opt-in database test skipped
  in the default run; lint, app/server TypeScript, SEO/bundle boundary policies,
  Node syntax and rendered UI contracts passed.
- The opt-in Postgres allowance test was separately executed: 22 checks,
  including simultaneous requests competing for the last daily slot,
  concurrency, IP limits, failed lease release and expiry. Eight synthetic
  Development reservations were consumed; exactly owned fixture records were
  cleaned. No inference and no Preview quota resets occurred in that test.
- First Gateway preview: real deployed Deep Review returned `analysisSource:ai`
  with three bounded notes for three synthetic test inputs. The same candidates
  and score sums were retained. These fixtures are not claims of real domain
  availability. Forty-eight HTTP/HTML/API smoke checks passed; database HTTP200.
- Initial deployed brief call reached Gateway HTTP200 but failed our output
  validation. A synthetic diagnostic showed the provider sometimes returned
  four directions despite schema `maxItems:3`. The parser now safely trims a
  small bounded surplus and the prompt explicitly asks for two directions.
  Invalid types, oversized fields, refusals and incomplete responses still fail.
- Second preview: real advanced brief returned `mode:ai`; its Gateway log showed
  HTTP200/completed in 1,366ms. Exact-domain search returned local analysis and
  used no AI. Exhausted-allowance review returned the complete deterministic
  shortlist without notes or an AI-success label. HTTP200 in all three cases.
- Final preview also passed all 48 HTTP/HTML/API checks with database HTTP200,
  plus exact-search and quota-denied-review checks. Its log confirms the denied
  review performed no provider HTTP call. Postgres showed three consumed Preview
  reservations and zero active leases. The three-per-IP daily allowance was
  intentionally not reset to force another successful model call.
- Final hardening forces OIDC on Vercel, checks text lengths after normalization,
  and aligns the review's 18s browser timeout with its 20s Vercel ceiling. Model
  timeouts remain 4s/5.5s. Added regression tests cover these parsing/auth choices.
- Two additional operator-only synthetic format probes exercised Gateway with
  OIDC and the same privacy settings; no customer data was used.
- Balance snapshots before/after this work: 4.99954246 / 4.99851856 USD. These are
  team balance observations, not an invoice or isolated per-request cost report.

## Reverification

Set `SAJDA_TEST_ORIGIN` to the linked preview and `SAJDA_VERCEL_CLI` to the
authenticated CLI path. `scripts/check-ai-gateway-runtime.mjs brief` or `review`
each may use one real billable AI request; `limit` expects the local quota
fallback and `exact` verifies exact searches do not request AI. Respect the
minute/day allowance instead of resetting it to make a test pass.

`scripts/probe-gateway-format.mjs` is an explicit operator diagnostic, not an
application route or normal test-suite step; it also uses existing credits.
Use `npm run serve:qa` for the actual Vercel handlers locally. The legacy full
loopback server intentionally has no external AI adapter.

## Remaining boundaries

No production activation, full browser flow, payment test or real email delivery
was performed in this Gateway slice. Account verification still needs a verified
sender domain/Resend configuration. Existing registry/source limitations and
commercial release gates remain documented in the account/release records.
The model gives editorial suggestions, not verified linguistic, trademark,
availability or price facts. Broader multilingual quality evaluation remains
worthwhile before increasing the public allowance.

## Primary documentation

- [Vercel OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc)
- [Responses and structured output](https://vercel.com/docs/ai-gateway/sdks-and-apis/responses/structured-outputs)
- [Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)
- [Per-request ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)
- [Prompt-training filter and BYOK caveat](https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training)

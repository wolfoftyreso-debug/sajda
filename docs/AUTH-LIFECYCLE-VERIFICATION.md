# Bounded account lifecycle verification

Social sign-in still requires the operator's Google, X, GitHub and Apple apps,
registered callbacks and real consent/account-lifecycle proof. Credentials are
not fabricated. Email delivery still requires the approved sending domain and
an actual received-message test. Neither gate is satisfied by this probe.

## Safe replacement for the retired runner

`scripts/check-account-runtime.ts` is deliberately disabled. Its former remote
`vercel curl` path put passwords and session cookies in process arguments. Do not
revive that transport. The replacement is:

```text
SAJDA_AUTH_LIFECYCLE_PREVIEW_TEST=1 node --import tsx scripts/check-auth-lifecycle-preview.mjs
  --preview-env=.vercel/.env.auth-lifecycle.preview.local
  --production-env=.vercel/.env.auth-lifecycle.production.local
  --development-env=.vercel/.env.auth-lifecycle.development.local
  --preview-host=EXACT_PREVIEW_NEON_HOST
  --preview-origin=https://sajda-IMMUTABLEID-hypbit.vercel.app
  --expected-commit=EXACT_40_CHARACTER_COMMIT
```

The environment files must be fresh official pulls from `hypbit/sajda`, with the
Preview pull scoped to the release branch. Files stay inside ignored `.vercel`.
The script rejects other teams/projects, Production aliases, source mismatches,
stale/wrong-project local OIDC access and Preview/Production Neon identities that
are equal after pooler normalization. The operator separately verifies the
immutable deployment's actual source SHA and project before running the probe.
It does not weaken deployment protection or create a public testing bypass.

Passwords, signed links, cookies and protection credentials stay in process
memory. Protected browser requests are proxied to the exact immutable origin
without redirects. No tracing, sensitive screenshots, CLI credential arguments
or raw provider exceptions are saved. The receipt contains public test metadata
only and is written to ignored `.vercel/auth-lifecycle-preview/result.json`.

## Evidence boundaries

Two unique `@example.test` accounts are created with the actual Better Auth
factory and actual Preview Neon, using local-only captured mail callbacks. The
signed verification links are consumed against that local factory. This proves
SDK account persistence and verification, **not deployed signup or inbox delivery**.

The compiled Preview auth UI then uses real password login and same-origin
cookie sessions, followed by persisted saved work, owner isolation, logout and
return login. A bounded fixture-only expiration change verifies that protected
account authorization does not refresh a session, while the normal session-read
route can renew it. Another fixture expires and must be denied, not resurrected.

A reset request is created by the local capture factory. Its real one-use
database token is consumed by the deployed reset endpoint. Replay, old-password
denial, new-password acceptance and revocation of pre-reset sessions are tested.
This is deployed password-change proof using a captured test token, **not proof
of the deployed reset-email request, email link routing or inbox delivery**.

Cleanup reconciles only the two allocated emails, then deletes each exact
identity/email pair and checks its cascaded credential/session/saved-work records.
Only account-specific saved-work counters and the local CLI's allocated reserved
test-net counters are removed. Shared deployed-IP auth buckets are not altered.
No existing/demo account password, production data or live provider is touched.
Test accounts are not assigned a paid plan; this is not payment/entitlement proof.

The responsive browser checks are web viewport checks at 320, 390, 768 and 1440
CSS pixels. They are not physical iPhone, Safari or VoiceOver verification.

## Run status

Verified on 2026-10-08, run `a916d79b-940b-4bd9-bb1e-5e877448551e`:

- Deployment: `dpl_G1Bdu3C94R6RaGpPCbBntPj5vmmC`.
- Origin: `https://sajda-8sj8ulqlx-hypbit.vercel.app`.
- Actual deployment and local source SHA:
  `a4b264ef1c820ddb2f5f1712c8bd60734de8abf8`.
- Official project/deployment inspection confirmed `hypbit/sajda`, Preview,
  READY and matching `releaseCommit`/`githubCommitSha` before the fixture run.
- Eight lifecycle boundaries above passed. The reset request and signed
  signup verification were local real-SDK captures; login, password change,
  session renewal/denial, saved work, isolation, logout and return were actual
  deployed routes. No auth hook or product response was mocked.
- Explicit API probes: fourteen HTTP 200, one expected 400 reset replay,
  four expected 401 auth/password/session denials and one expected 409 owner
  mismatch. These counts exclude ordinary compiled-UI asset/background requests.
- Auth viewport checks: 320/390/768/1440 CSS px; no horizontal overflow,
  email/password fields have associated labels. These are not full account-page
  or all-product accessibility checks.
- Zero runtime exceptions, transport failures, unexpected writes or active
  protected route handlers after browser closure.
- Exact two-owner cleanup verified: zero remaining fixtures, including
  credential/session/saved-work children. Shared deployed-IP auth rate-limit
  buckets were not altered.
- No emails, payments, existing-user changes or production writes.

Five secret-free automated configuration/transport tests also passed, including
explicit local Vercel/Git/environment exclusions from the deployment upload. The
redacted real-run receipt is ignored local evidence at
`.vercel/auth-lifecycle-preview/result.json`; no credential material is committed.
This receipt does not prove social login, deployed signup, received reset email,
Apple authentication or a production launch. Repeat against the final release
configuration when those independent gates become available.

## Final code Preview repeat

The same bounded probe passed on 2026-10-08 UTC, run
`4414eb38-aea1-4a74-8924-43bb83e7fa44`, against
`https://sajda-vf2wx0cxw-hypbit.vercel.app`, deployment
`dpl_ENJbyg1k94CZrhhNLTHpaao7XF7j`, code SHA
`707596e95daeb334876035d258349884679a8897`.

Before allocation, official CLI/API inspection confirmed READY, linked Sajda
project/team and matching release/source metadata. This deployment is a manual
CLI upload; its metadata is not proof that a Git integration deployed it.
Fresh official environment pulls, distinct Preview/Production Neon identities
and the matching local HEAD passed the target guards.

All eight lifecycle boundaries passed again. Explicit API status counts remained
200 × 14, expected 400 × 1, expected 401 × 4 and expected 409 × 1.
The 320/390/768/1440 CSS-pixel auth viewports had no horizontal overflow and both
input labels remained associated. Runtime exceptions, unexpected writes,
transport failures and active route handlers after closure were zero.
Exact cleanup left zero fixture accounts/children; no shared-IP auth rate-limit
buckets were altered. No mail sends, paid mutations, existing-user changes or
Production writes were part of this run. Ordinary backend configuration reads
are not asserted to be provider-free.

The earlier evidence boundaries still apply: signup, verification and the reset
request used the local actual SDK with captured mail callbacks. Actual deployed
password change and account routes were exercised; deployed signup, received
email, social consent, physical iPhone/Safari and VoiceOver were not.
The ignored local receipt now contains this newer run; the earlier run's public
facts remain recorded above rather than being relabeled as new evidence.

# Social sign-in activation — Sajda

Checked 2026-10-09. This is an activation runbook, not a claim that external
provider login works. Sajda uses Better Auth 1.7.7 and the existing Neon account
tables. Google, X, GitHub and Apple must all lead to the same Sajda account and
cookie session, not a separate Trading account.

## Actual configuration boundary

Official Vercel environment metadata for `hypbit/sajda` contains none of the
eight provider credential variables below, in any environment or branch. No
secret values were retrieved to establish that absence. The project has one
verified domain: `sajda-eight.vercel.app`. The inspected immutable Preview has
no alias. Provider apps, their owners, consent settings and callback registrations
could not be inspected: this session has no available browser surface or
provider-administration connector.

Do not mistake the connected GitHub repository app for Sajda's login OAuth app.
Repository access does not create an identity-provider client or client secret.
Do not reuse the Codex/Vercel CLI credentials as end-user OAuth credentials.

## Choose and pin the callback origin first

The existing project domain permits the following exact initial URLs. This is
not a decision that it is the final public/custom domain. If the operator chooses
another stable HTTPS domain, replace the origin consistently in provider apps,
`BETTER_AUTH_URL`, canonical configuration and the deployed release.

| Provider | Initial callback on the current project domain | Server-only Vercel variables |
| --- | --- | --- |
| Google | `https://sajda-eight.vercel.app/api/auth/callback/google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `https://sajda-eight.vercel.app/api/auth/callback/github` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| X | `https://sajda-eight.vercel.app/api/auth/callback/twitter` | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` |
| Apple | `https://sajda-eight.vercel.app/api/auth/callback/apple` | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` |

Use a separately registered, stable Preview HTTPS origin and separately scoped
test credentials for Preview verification. Do not register every temporary
deployment, reuse Production credentials in an arbitrary Preview, or weaken
project-wide deployment protection to make a callback test pass. The application
uses the actual trusted request origin for callbacks; it does not silently redirect
a Preview user through Production.

## Provider-owned steps

### Google

Open [Google Auth Platform](https://console.cloud.google.com/auth/clients) in
the product owner's Google Cloud project. Inspect existing clients before creating
another. Configure a **Web application** client, Sajda branding, support contact,
the actual published privacy/terms URLs and the exact callback above. Use only
basic identity scopes (`openid`, email, profile), not Gmail or Drive access.
During provider Testing mode, add only explicitly authorized test users. Verify
the provider audience/publishing requirements before offering it to everyone.
See [Google's server-side OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server).

### GitHub

Open [OAuth apps](https://github.com/settings/developers) in the intended owning
account/organization. Inspect existing Sajda registrations first. Use the Sajda
homepage and exact callback; no repository permissions or device-flow activation
are needed for this login. Store the generated client credentials only in Vercel.
See [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

### X

Open [X Developer Console](https://developer.x.com/) and inspect the intended
Sajda app. Enable OAuth 2.0 for a **Web App/confidential client**, the exact
`twitter` callback, homepage and real legal URLs. Sajda requests `users.read`
and `users.email`, not posting, DMs or offline access. Confirm email retrieval
and the provider's access/billing conditions before enabling the integration;
no plan or paid credits are purchased by this runbook.

The implementation requires a provider-confirmed email. It must not fabricate
an email or silently create a second placeholder account when X omits it.
See [X's OAuth/PKCE and scope reference](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
and [authenticated user lookup](https://docs.x.com/x-api/users/get-my-user).

### Apple

An active Apple Developer account is required. The repository's native bundle
identifier is `com.hypbit.sajda`; an App ID registration, an associated web
Service ID, a Sign in with Apple key and registered HTTPS return URLs remain
provider-owned steps. `APPLE_CLIENT_ID` is the web Service ID, not automatically
the native bundle ID. `APPLE_CLIENT_SECRET` is an ES256-signed client-secret JWT,
not the `.p8` private key. Its audience, issuer, subject, key ID and expiry must
match Apple's requirements; replace it before expiry (maximum six months).
Never commit the private key or put it in chat. Native direct ID-token login is
not enabled by this web activation.

Apple returns via cross-site form POST. Only its exact callback path can receive
the special SDK origin treatment; signed state-cookie binding and one-use state
validation still apply. Session cookies remain SameSite=Lax. Normal sign-in
actions do not trust Apple or arbitrary external origins.
See [Better Auth's Apple instructions](https://better-auth.com/docs/authentication/apple)
(current documentation inspected alongside the installed 1.7.7 SDK).

## Secret installation and verification

1. Put each ID/secret pair directly in
   [Sajda's Vercel environment settings](https://vercel.com/hypbit/sajda/settings/environment-variables).
   Secrets use Secret type, no `VITE_` prefix; Production and Preview are
   explicitly scoped. Do not send credentials in chat or shell arguments.
2. Redeploy the exact reviewed source to the matching environment. Existing
   deployments do not receive later environment changes automatically.
3. Check `/api/auth-providers`: only configured providers may become visible
   buttons. Credential presence proves configuration only, not consent/login.
4. On the exact deployed origin, exercise real provider consent with an
   authorized test account: new login, cancellation, return to `next`, logout,
   return login, expired/missing/foreign/replayed state, and existing-account
   linking. Confirm the Neon user/account/session relationship and encrypted
   OAuth tokens. Do not overwrite any existing user's password or entitlements.
5. Require the existing local account email to be verified before implicit
   same-email linking; a provider account must not take over an unverified
   local account. Different-email accounts are not implicitly merged.
6. Only record provider E2E PASS after actual consent, callback, persisted
   identity and session proof. Local SDK/stub tests, button rendering, metadata
   and a READY build are not external-provider success.

No provider client, secret, permission expansion, paid plan, DNS change, live
customer or Production deployment is created by this runbook.

## Implemented regressions and evidence boundary

`tests/social-auth-callback.test.ts` exercises the installed SDK, not a mocked
OAuth router. Its six local tests cover all four authorization URLs, exact
callbacks, minimal identity scopes, PKCE, unique state, Apple's signed state
cookie, one-use cancellation, foreign origins and recoverable errors. Database
verification state is in memory and provider/network requests are prohibited.
These are regression tests, not real consent or persisted-account tests.

The Apple origin exception is request-scoped to `POST /api/auth/callback/apple`;
generic origin checking remains explicitly enabled. Missing or rejected OAuth
state returns to Sajda's `/auth?oauth=failed` page rather than the SDK's
unexposed error endpoint. The existing UI handles that failure and removes
provider error parameters from the address bar.

An independent read-only code review confirmed these boundaries and the
activation instructions. External activation remains blocked by the missing
provider credentials and unverified provider-owned registrations above.

Local `npm run check:ci` passed after these corrections: lint, application and
server types, 104 language dictionaries, SEO/Neon policies, 44 Node syntax
checks, the complete automated test suite, UI contracts, Vercel build and 85
local HTTP checks. The credential-free local database status was intentionally
`503 / not_configured`; that is not a deployed Neon or provider-login test.

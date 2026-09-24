# Sajda account presentation

The sign-in, signup, recovery and account-unavailable screens share
`src/components/auth/AuthLayout.tsx`. The shell uses the existing Sajda logo and
mark, not a substitute icon. Its CSS is scoped under `.sajda-auth`; it does not
restyle forms elsewhere in the product.

Desktop has a quiet branded companion panel from 1024px. Below that width the
form takes priority; tablets from 600px use a centered, 560px-wide form rather
than a stretched phone layout. Auth has its own language/legal footer, without
the duplicate site-wide marketing footer. Inputs are 52px high with 16px text, password reveal
controls have accessible names, and arriving on the screen does not autofocus
an input/open the mobile keyboard. Safe-area spacing supports mobile browsers.

English is the source language. The shell uses the existing language provider
and complete EN/SV/ES/FR/ZH copy in `authPresentationCopy.ts`. It adds no new
language-selection policy. Terms and privacy links point to existing legal
sections. One account remains shared across Sajda plans; no new login method,
paid access, account store, email provider or authentication endpoint is added.

## Preserved boundaries

- `next` remains validated by `safeAccountPath`, including `/developers#access`.
- Screen switches, confirmation and reset requests preserve that destination.
- Recovery needs a server-issued one-use token; an ordinary session is not a
  substitute. The token is removed from visible navigation.
- Known error codes select translated copy. Raw provider messages are hidden.
- Existing-password sign-in and new-password length rules are unchanged.
- Password reveal starts hidden and resets when the auth mode changes.

## Verification

Run `node --import tsx --test tests/auth-presentation.test.ts` for isolated mounted
regressions. `scripts/check-auth-browser.mjs` runs installed Edge against the
real presentation with strictly local fixture services, checks five languages
at 320/390/1440px and records screenshots under `tmp/auth-browser`.
Set `SAJDA_PLAYWRIGHT_ROOT` to a directory containing Playwright's `node_modules`
if it is supplied outside the project. The fixture cannot create real accounts,
send email or grant access. Its success is **not** a live-auth or delivery test.

For a selected protected preview, set `SAJDA_TEST_ORIGIN` and
`SAJDA_VERCEL_CLI`, then run `node scripts/check-auth-preview.mjs`. This reads
auth routes, deployed modules, logo assets and the anonymous session endpoint
through the authorized Vercel CLI. It makes no account or email mutations and
does not claim a deployed browser login test.

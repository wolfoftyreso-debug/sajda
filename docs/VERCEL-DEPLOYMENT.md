# Public Vercel deployment

Current verification (2026-09-10): the reviewed release is the **protected**
[test preview](https://sajda-test-hypbit.vercel.app), runtime `99c045d`.
This document describes the public deployment architecture, not evidence that
anonymous visitors or external iPhones can bypass preview protection. Website
indexing remains deliberately disabled. See the [iOS/SEO revision](IOS-SEO-AUDIT-2026-09-10.md)
for the final deployed checks and explicit launch gates.

This is the fastest supported public deployment path for Sajda. It runs
the Vite app as static files and `api/domain-search.ts` as a Vercel Node
function. Search is public by default; persistent product workflows are being
ported behind same-origin Vercel APIs backed by Neon Postgres.

## Configure the Vercel project

1. Import this repository into Vercel and keep the included `vercel.json`.
   It runs `npm ci` then `npm run build:vercel`, which explicitly enables the
   self-contained public search mode.
2. Add the Neon integration through the Vercel Marketplace. It supplies a
   server-only pooled `DATABASE_URL` to Vercel Functions. Use a separate
   `DATABASE_URL_UNPOOLED` only for migrations. Neither value may be prefixed
   `VITE_` or exposed to the browser. Authentication runs through Better Auth
   in the same Vercel application, backed by these Postgres tables. Do not
   enable a second, managed Neon Auth service. Configure `BETTER_AUTH_SECRET`,
   a matching `BETTER_AUTH_URL`, and verified Resend delivery.
3. To enable price comparison beyond Loopia's published list, add **one**
   server-only variable named `TLDES_API_KEY` in **Project Settings →
   Environment Variables** (Production, and Preview if previews should show
   the feed). Do not add `VITE_TLDES_API_KEY`: anything prefixed `VITE_` is
   compiled into the browser bundle. Do not add `VITE_LOCAL_TEST_MODE` to a
   Vercel project.
4. Redeploy after adding or changing the key. The configuration builds `dist-vercel/`,
   gives the registry function up to 30 seconds, and sends client-side routes
   to `index.html`.

For a preview deployment after logging in to the intended Vercel account:

```sh
npm ci
npm run check
npm run build:vercel
npx vercel --scope hypbit
```

## What is live in this path

- `POST /api/v1/public/domains` is the stable no-key developer contract for a
  small, strict subset of anonymous domain search. It is CORS-enabled, returns
  request/rate-limit headers, and shares the product's conservative
  best-effort per-IP budget. It is not paid access, a durable quota, or a
  customer-key service. See [`API-V1.md`](./API-V1.md).
- `GET /api/openapi` and `GET /api/fact-signals` are public, read-only and
  CORS-enabled. Signed-in users can create, list, and revoke their own
  server-side `/api/v1/domains` key via `/api/developer/api-keys`. The raw key is
  returned once, and must never be placed in browser code.

- `.com`, `.net`, `.org`, `.app`, `.dev`, `.ai`, `.xyz`, `.info` and `.biz`
  are checked through audited HTTPS RDAP services. Only the relevant registry
  `404` availability response can produce **Available**.
- Internetstiftelsen's documented Free/DAS availability endpoint for `.se` and
  `.nu` is HTTP-only. The public Vercel function therefore fails closed and
  returns **Unknown** for those checks rather than treating an unauthenticated
  transport response as availability. Do not market public `.se`/`.nu`
  results as registry-verified until an approved HTTPS registry or registrar
  connector is configured.
- `.io` and all other unsupported TLDs remain **Unknown**. They are not
  offered in the public UI, and the API never reports them as available.
- A search can compare **20 public providers**: Loopia, Cloudflare Registrar,
  GoDaddy, Namecheap, Porkbun, Dynadot, Amazon Route 53, one.com, IONOS,
  OVHcloud, Squarespace Domains, Hostinger, Gandi, Hover, Spaceship, Name.com,
  NameSilo, Alibaba Cloud, InternetBS and Wix Domains. The response keeps
  the selected providers together on every domain result so the client can
  show a side-by-side comparison. Each selection has an official HTTPS
  provider page; unknown IDs and duplicate selections are rejected.
- Without `TLDES_API_KEY`, **Loopia** is the sole direct price connection. The
  function fetches Loopia's public detailed price list, accepts only the exact
  row for the relevant TLD, and shows first-year price (including and excluding
  VAT where supplied), renewal price, source link, and a check timestamp.
  Results without a fresh, parseable source row say *Not available*; they never
  show a guessed price. The other providers explicitly return no numeric price
  and `priceVerified: false`; their pages are linked so the buyer can check the
  current price and availability directly. Every offer also exposes a
  machine-readable `priceStatus`, `dataSource`, `connectorState` and
  `checkedAt` value so the UI can make the source state explicit.
- With `TLDES_API_KEY` configured, the function also asks the **TLDES price
  feed** for the selected providers' published standard prices for each
  selected TLD. The request and key stay inside the Vercel function; neither
  is sent to the browser. Results are cached server-side for up to one hour
  and include the feed's timestamp and `tldes_price_feed` source state. Loopia's
  direct public price-list result retains priority when it is available.
  TLDES prices are standard-TLD registration/renewal references only: they are
  **not** an availability check, an exact-domain quote, a premium-name quote,
  a promotion, a tax calculation, or a checkout total. If the feed has no
  valid current result, the card remains *Not available* or an official
  purchase link; it never falls back to a guessed price.
- Do not scrape retail search pages. Provider APIs such as Spaceship, Name.com,
  NameSilo, Alibaba Cloud and InternetBS require their own server-side account
  credentials and a reviewed adapter. Store those credentials only in Vercel
  Project Environment Variables; never prefix them with `VITE_`. Merely
  setting an adapter placeholder does not make a price live.
- A provider price is separate from the USD screening signal. It is not a
  checkout quote, appraisal, or purchase recommendation: campaign terms,
  premium names, VAT treatment, and the supplier's final availability check
  can change the final order price.

Account login, saved domains and developer keys use same-origin Better Auth
and Postgres APIs. They are not proof that the legacy history, watchlist or
marketplace mutations have been ported. New signup and password recovery require
real Resend delivery; see [RESEND-CONTACT.md](./RESEND-CONTACT.md).
A search asks for up to 50 displayed suggestions; the API checks a
reserve of candidates (up to 80 total) so registered names can be filtered out
without making the batch unexpectedly thin. It applies a best-effort per-IP
request limit. Add a Vercel WAF rate-limit rule before sharing the URL broadly
if abuse becomes a concern.

## Production isolation and release boundary (2026-09-09)

`hypbit/sajda` now has two distinct Neon Marketplace resources in Frankfurt:

- `sajda-postgres`: Development and Preview, including the explicitly synthetic
  Plus pilot account and its control run.
- `sajda-production`: Production only, on the free plan. No copy of pilot data
  or account credentials is used for production.

Both resources have migrations `0000`–`0008` applied. The production baseline was
verified empty before applying them, with zero accounts, customers and Plus grants
afterward. `vercel.json` selects `fra1` for Functions to match the Frankfurt
database; verify the deployment's actual regions after deploying. This placement
is not a claim of a measured latency improvement.

The verified Vercel project alias is `https://sajda-eight.vercel.app`. Production
auth and canonical configuration use that address until a custom domain is
explicitly selected and verified. Do not assume ownership of `sajda.dev` or
`sajda.com`. Search indexing remains off during launch validation.

A production build validates explicit canonical/auth origins, the selected
Neon project, pooled/direct connections, auth secret and email configuration.
It refuses missing prerequisites instead of silently deploying an unusable signup.
This is only a configuration check: preview E2E, real email receipt, Stripe
sandbox lifecycle, approved source evidence and final production smoke tests
are separate requirements. Billing and the crawler remain independently gated.

Never promote a preview simply to get a stable URL: its test database, grants,
Stripe mode and callbacks must not become the production state. Rebuild with
the verified Production environment after all critical gates pass.

# Vercel deployment architecture and release boundaries

This document describes the implementation and configuration, not a launch
approval or proof that a particular deployment is accessible. Consult the dated
[release evidence](LAUNCH-EXTERNAL-EVIDENCE-2026-10-06.json) for the verification
environment and unresolved gates. A protected preview is not a public release;
website indexing remains deliberately disabled during validation.

The Vite app is served as static files and `api/domain-search.ts` runs as a
Vercel Node function. Anonymous search and authenticated account workflows use
same-origin Vercel APIs. Persistent account data is backed by Neon Postgres.
Verify each workflow separately rather than inferring readiness from the build.

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
3. Loopia and Porkbun published standard-TLD prices need no provider credentials.
   To add the optional aggregated standard-price feed, configure the server-only
   `TLDES_API_KEY` in **Project Settings → Environment Variables** (Production,
   and Preview if previews should show the feed). Do not add `VITE_TLDES_API_KEY`:
   anything prefixed `VITE_` is compiled into the browser bundle. Do not add
   `VITE_LOCAL_TEST_MODE` to a Vercel project.
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
- Without `TLDES_API_KEY`, **Loopia and Porkbun** provide direct published
  standard-TLD prices without provider credentials. Loopia's public detailed
  price list supplies the matching TLD row, first-year price (including and
  excluding VAT where supplied), renewal price, source link and check timestamp.
  Porkbun's [official public pricing API](https://porkbun.com/api/json/v3/spec#/paths/~1pricing~1get)
  supplies standard registration and renewal amounts in USD for supported TLDs;
  tax treatment remains unknown. Both catalogues are cached for up to 15 minutes.
  These are TLD references, not exact-domain availability, premium-name prices
  or checkout totals. Missing, expired or unparseable prices are withheld rather
  than guessed. Other providers return official purchase links without a numeric
  price unless the optional feed or a configured reviewed bridge supplies valid
  evidence. Every offer also exposes a
  machine-readable `priceStatus`, `dataSource`, `connectorState` and
  `checkedAt` value so the UI can make the source state explicit.
- With `TLDES_API_KEY` configured, the function also asks the **TLDES price
  feed** for the selected providers' published standard prices for each
  selected TLD. The request and key stay inside the Vercel function; neither
  is sent to the browser. Results are cached server-side for up to one hour
  and include the feed's timestamp and `tldes_price_feed` source state. Direct
  provider observations retain priority when present; Porkbun can use this feed
  when its public catalogue has no usable price for the requested TLD.
  TLDES prices are standard-TLD registration/renewal references only: they are
  **not** an availability check, an exact-domain quote, a premium-name quote,
  a promotion, a tax calculation, or a checkout total. If the feed has no
  valid current result, the card remains *Not available* or an official
  purchase link; it never falls back to a guessed price.
- Cloudflare exact-domain standard offers use the isolated `sajda-connector`
  registrar bridge, independently of the standard-TLD catalogues and TLDES.
  Configure an independent server-only `SAJDA_REGISTRAR_BRIDGE_TOKEN` in both
  projects; keep `SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID` and
  `SAJDA_CONNECTOR_CLOUDFLARE_TOKEN` only in the connector project. See the
  [Cloudflare operator setup](AI-CONNECTOR.md#cloudflare-operator-setup--production-configured-not-public-user-authentication).
  Configuration alone does not verify access. Successful checks produce
  `priceScope: "exact_domain_offer"` for standard, available domains. Premium,
  unavailable or unverified names receive no numeric exact offer. Taxes remain
  unknown, and the five-minute evidence expiry does not lock the checkout price.
- Trading's exact-domain Porkbun observations require its separate opt-in
  `SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED=true`, server-only `PORKBUN_API_KEY`
  and `PORKBUN_SECRET_API_KEY`, plus the reviewed database/provider setup.
  Porkbun's public catalogue does not enable this authenticated check. These
  read-only observations retain missing costs, fees and tax treatment as unknown;
  they do not register, reserve or purchase a domain.
- Do not scrape retail search pages. Provider APIs such as Spaceship, Name.com,
  NameSilo, Alibaba Cloud and InternetBS require their own server-side account
  credentials and a reviewed adapter. Store those credentials only in Vercel
  Project Environment Variables; never prefix them with `VITE_`. Merely
  setting an adapter placeholder does not make a price live.
- A provider price is separate from the USD screening signal. It is not a
  checkout quote, appraisal, or purchase recommendation: campaign terms,
  premium names, VAT treatment, and the supplier's final availability check
  can change the final order price.

Account login uses same-origin Better Auth. Saved/watchlist snapshots use
`/api/account/saved-domains`; name projects, Trading research and developer keys
have separate authenticated Postgres APIs and server-side authorization.
Saved snapshots are not automatic monitoring, and these endpoints do not prove
that every historical-search or marketplace workflow works. New signup and
password recovery require real Resend delivery; see
[RESEND-CONTACT.md](./RESEND-CONTACT.md).
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

At this historical baseline, both resources had migrations `0000`–`0008` applied.
This is not the current schema ledger: run `scripts/migrate-neon.mjs --check`
against each intended environment before release. The production baseline was
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

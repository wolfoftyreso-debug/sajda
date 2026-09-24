# Sajda

Sajda helps people and agents find and assess names, compare domain evidence,
build naming projects, and research domain opportunities. The website, account
API and MCP tools share the same server-side ownership and entitlement rules.
Availability, indicative prices, heuristic scores and legal clearance are
different claims; the product must not silently substitute one for another.

Start with the [developer handoff](docs/DEVELOPER-HANDOFF.md) and the dated
[24 September release evidence](docs/CONNECTOR-RELEASE-2026-09-24.md). A passing
repository check is not an unrestricted production-release approval. Historical
verification documents describe their observation date, not today's runtime.

## Supported architecture

```text
React / Vite website or Capacitor shell
  → same-origin Vercel API
    → Better Auth sessions + Neon Postgres
    → registry / registrar evidence and optional Vercel AI Gateway
    → Resend account/contact email; Stripe or native commerce when configured

External agents
  → anonymous research MCP / REST
  → authenticated account MCP / REST with explicitly scoped, revocable keys
```

The supported deployment path is **Vercel Functions + Neon Postgres**. Auth is
the same-origin Better Auth server, not managed Neon Auth or Supabase. Provider
and database credentials stay server-side. See the [Vercel deployment guide](docs/VERCEL-DEPLOYMENT.md)
and [Neon architecture](docs/NEON-VERCEL.md).

- **Public research:** domain checks, business-name recommendations, name-package
  research and Brand Index signals. Six public MCP tools cannot access accounts.
- **Private account:** saved domains, naming projects, API keys and Trading
  research use authenticated APIs, explicit permissions and current entitlements.
  See [account REST API](docs/ACCOUNT-API.md) and [MCP](docs/MCP.md).
- **Trading:** bounded research runs, dated observations and scenario records;
  scores are not financial advice, guaranteed returns or automatic purchases.
- **Native app:** a shared product UI in a separate Capacitor build. A successful
  web or simulator build does not establish signed-device, StoreKit or App Store
  approval. See the [mobile evidence](docs/LAUNCH-MOBILE-2026-09-17.md).

The isolated public connector artifact contains no account/payment handlers or
database credentials. The authenticated application and the connector are
separate deployments, not interchangeable URLs.

## Local development

Use **Node 24** and **npm 11.13.0**, matching CI and `packageManager`. The checked-in
`package-lock.json` is authoritative; do not regenerate dependencies with another
package manager. Copy `.env.example` to `.env.local` only if no local file exists.
Never commit that file or put server secrets in `VITE_*` variables.

```sh
npm ci --ignore-scripts
npm run dev
```

The Vite server is front-end development only. It is not a deployed function
runtime and does not prove login, database, email or payment behavior. For the
supported built surface and actual local handlers:

```sh
npm run build:vercel
npm run check:runtime:local
```

The smoke runner allocates a loopback port, starts the actual Vercel handlers,
checks read-only HTTP contracts, and stops the server. It deliberately excludes
inherited credentials and deployment flags. A 503 `not_configured` database
health response is expected here and is **not** evidence of a working database.
For interactive local QA, `npm run serve:qa` serves `dist-vercel` on port 8095;
this command does not load `.env.local` automatically.

## Verification

```sh
npm run check:ci
npm audit --omit=dev
```

`check:ci` runs lint, application/API types, language and security-boundary
contracts, automated tests, rendered UI contracts, the Vercel build and isolated
HTTP smoke. Test concurrency is capped for predictable local/CI resource use.
Build checks also inspect generated SEO files and prohibit legacy provider
endpoints or server secrets in browser output.

Live-provider, database, browser and deployment verification remain separate.
`npm run test:live-search` makes bounded real provider requests; do not add it to
untrusted pull-request CI. Migration planning is read-only (`npm run db:plan`);
applying migrations requires an explicitly selected database and release review.

## Data and evidence rules

- Registry failures, unsupported TLDs and ambiguous responses mean **unknown**,
  not available. DNS absence is not availability proof.
- Standard TLD prices are not exact-domain checkout quotes. Keep source,
  currency, observation time and quote scope visible.
- Naming and Brand Index scores are documented signals, not ownership proof,
  market valuations or legal trademark clearance.
- Requested versus returned candidate counts and any shortfall must be explicit.
- API key scopes never substitute for owner isolation or paid entitlement.

See [search quality](docs/SEARCH-QUALITY.md), [legal release gates](docs/LAUNCH-LEGAL-2026-09-17.md)
and [connector asset provenance](docs/connector-assets.md). Required third-party
licence notices are retained; no generator branding is needed in product output.

## Historical code

`supabase/`, `infra/`, `public/`, the old Bun lockfile and `build:local` retain
migration/reference material. They are not the supported production deployment.
`public-clean/` is the shipped static asset source. Legacy function tests are
explicitly named `test:legacy:supabase-functions`; do not interpret them as a
Vercel account or commerce sign-off.

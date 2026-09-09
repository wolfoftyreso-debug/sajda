# Sajda

Current verification and launch blockers: [release evidence, 2026-09-08](docs/RELEASE-VERIFICATION-2026-09-08.md).

Sajda is a domain-discovery application that can run locally or on Vercel. It uses
authoritative RDAP lookups for availability and a transparent, deterministic
screening algorithm for ranking candidates. It no longer relies on an external
LLM to run its core flow.

## Deployment

Sajda's supported product path is **Vercel Functions + Neon Postgres**. The
browser talks only to same-origin `/api/*` routes; database credentials remain
server-side. Managed Neon Auth and a verified-account saved-domain API are
implemented, but require live configuration and preview verification before
accounts are enabled. See [the Vercel guide](docs/VERCEL-DEPLOYMENT.md) and
[the Neon architecture guide](docs/NEON-VERCEL.md).

- **Public search:** anonymous domain discovery and comparison on Vercel.
- **Private workspace:** history, watchlists, API keys and marketplace records
  are being moved behind authenticated Vercel APIs backed by Neon.
- **Developer API:** `POST /api/v1/public/domains` is a small, no-key,
  CORS-enabled domain-search contract. Durable customer API keys are enabled
  only after the Neon account and entitlement migration is verified.
- **Marketplace:** local drafts remain available for product exploration.
  Persistent listings, offers, DNS control proofs and payments are not marked
  live until their Neon-backed flows have passed a preview deployment.

The old `supabase/` tree and self-host documentation are historical migration
input, not a supported deployment option.

## Start here

Use the Vercel/Neon guides before deploying. The database URL belongs only in
Vercel Function environments; do not expose it through a `VITE_*` variable.

For local front-end development only:

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Local front-end development does not require a database credential. Neon Auth
and persistent routes are deliberately unavailable until their server-side
configuration exists. Never put a database URL, server credential, job secret,
or third-party credential in a `VITE_*` variable.

## Verification commands

```sh
npm run lint
npm run typecheck
npm run check
npm run check:neon
npm run build:vercel
npm run serve:qa
# In another terminal, against that local server:
npm run check:runtime
npm audit --omit=dev
```

`npm run check` includes static checks, risk-focused automated tests and
rendered UI contracts. `serve:qa` runs the actual Vercel route implementations
with the production build locally; it does not emulate deployed infrastructure.
Set `SAJDA_TEST_ORIGIN` to a linked preview URL to repeat the HTTP smoke checks.
`npm run test:live-search` performs bounded real registry/price lookups and
should not run in every CI build. Use `npm run db:plan` for an offline migration
plan; applying migrations requires an explicitly configured isolated database.

## Algorithm contract

- Candidate generation is deterministic and versioned (`2.0.0`), making a
  scan reproducible for the same input and iteration.
- A domain is reported as `available` only from a definitive configured
  registry response. DNS is never positive availability evidence; timeouts,
  rate limits, unsupported TLDs, and unrecognised registry replies are
  `unknown`.
- No monetary valuation is invented. A separately labelled naming score is
  a transparent spelling/shape heuristic, not market value or a probability.
  The public/local search path shows a timestamped Loopia first-year and renewal price only
  when the exact TLD row can be read from Loopia's public price list; it is
  still not a locked checkout quote.
- Ranking combines input relevance, spelling quality and family diversity.
  See [the search quality contract and observed tests](docs/SEARCH-QUALITY.md).
- `.se`, `.nu` and `.io` are excluded from default discovery while no approved
  reliable secure provider is configured. Unsupported exact checks return
  `unknown`, never guessed availability.

The legacy registrar scraper is intentionally disabled until it is replaced by
an approved registrar API adapter. This avoids presenting an invented price as
a live quote.

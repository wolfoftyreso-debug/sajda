# Neon database layer

Sajda's production target is **Neon Postgres through Vercel Functions**:

```text
React/Vite browser → same-origin /api/* → Vercel Function → Neon Postgres
```

`DATABASE_URL` is server-only and is for short, pooled Vercel request work.
`DATABASE_URL_UNPOOLED` is reserved for migration and administrative tooling.
Neither value may use a `VITE_` prefix or be committed to this repository.

## Migration policy

The SQL under `supabase/migrations/` is historical input, not a Neon migration
source. It relies on Supabase Auth, PostgREST/RLS session helpers, Edge
Functions and Supabase scheduling. Do not apply it to Neon.

New, provider-neutral migrations belong here and must:

- use ordinary PostgreSQL tables, constraints, indexes and transactions;
- assume identity/authorization are checked in the calling Vercel Function;
- avoid browser-accessible database credentials;
- be applied by the migration tool, which records filename and checksum in `sajda.schema_migrations`;
- be exercised against a Neon preview branch before production.

`0000_neon_foundation.sql` creates the migration ledger, durable job-run ledger
and server-side rate-limit state. `0001_saved_domains.sql` adds the private
saved-domain snapshot table. The Vercel API checks a verified Neon identity
before issuing each ownership-scoped query. Other historical product tables
are not migrated by these two files.

Use `node scripts/migrate-neon.mjs --plan` for a local-only plan. Use `--check`
for read-only database status, and only an explicitly intended `--apply` to
write to the Neon branch named by `DATABASE_URL_UNPOOLED`. The runner uses
one transaction, an advisory lock and SHA-256 checksums. It refuses changed,
unknown or out-of-order applied migrations. Never silently baseline a legacy
ledger with missing checksums.

See [`../docs/NEON-VERCEL.md`](../docs/NEON-VERCEL.md) for setup and cutover.

# Operator Trading test access — 2026-09-09

User requested a working login for Trading testing. A new reserved `.test`
identity was created in the reviewed development Neon project with a seven-day
operator grant, expiring 2026-09-16 at 21:31 UTC. No existing account was changed.
Credentials were generated securely and handed to the requesting operator, not
stored in the repository. Re-running the bootstrap refuses an existing identity.

Dedicated preview: https://sajda-joou7ede7-hypbit.vercel.app/plus

- Vercel deployment READY; only this preview overrides
  `SAJDA_LOST_DOMAINS_ENABLED=true`.
- Deployment Protection remains enabled. Production was not promoted or changed.
- No payment, subscription, admin role, daily schedule or crawl was created.
- No source approvals or source data changed. Two approved test source pages
  currently exist; this is not evidence of a production investment feed.
- Real deployed browser checks passed: sign-in, Trading workspace and enabled
  start action, reload, sign-out hiding the workspace, sign-in again with access
  retained. The browser was left signed in, with Swedish selected.
- Deployed health endpoint returned database connected.
- Four bootstrap safety tests passed; ESLint passed for the added script/test.

Bootstrap: `scripts/create-trading-test-account.mjs`. Default invocation is a
secret-free, non-mutating plan. `--apply` is operator-only and validates the
reviewed non-production Neon target before any account or grant write. The
transaction verifies the effective preview grant and disables daily refresh.

Not tested in this login task: new research execution, result quality, payments,
mail delivery or production. Password reset cannot deliver to a reserved `.test`
mailbox. The account is for this bounded test environment only.

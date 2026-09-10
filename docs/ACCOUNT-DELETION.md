# Account deletion

This is account removal, not an operator support queue or temporary disablement.
The account screen uses the same `POST /api/account/deletion` product endpoint
from the website and through the authenticated native adapter. API keys and MCP
credentials cannot call this operation, including a forged native header.

## Confirmation contract

1. Signed-in owner sends `{action:"request",requestId:"<UUID>",language:"en"}`.
2. Resend receives an eight-digit code addressed only to the email stored on that
   account. No code is sent to support or embedded in a URL. Provider acceptance
   is not proof of inbox delivery.
3. The response contains `status:"confirmation_required"`, `deletionRequestId`,
   `expiresAt`, the initiating `accountId`, and an independent correlation
   `requestId`. Codes expire after 15 minutes. An account can request at most
   three deliveries per hour and try each challenge at most five times.
4. The owner explicitly submits `{action:"confirm",requestId:"<challenge UUID>",
   code:"12345678",confirmation:"DELETE"}`. GET never removes anything.
5. Success is returned only after the account deletion transaction commits:
   `status:"deleted"`, `deletionRequestId`, `accountId`, correlation `requestId`,
   and `billing:"none"|"canceled"`. The billing enum concerns Sajda Stripe
   customers only. It does **not** assert cancellation of Apple subscriptions.

The code is derived with a server HMAC bound to owner and random request UUID;
only a separate HMAC proof is persisted. Incorrect attempts commit independently
so a rejected proof cannot refund the guessing budget. Reusing a UUID does not
refresh expiry or attempts. New confirmation requests invalidate previous codes.
Database row locks serialize code changes and removal. A replay after deletion
fails authentication; it cannot recreate an account or repeat a purchase.

## Billing consequences

Before confirming, the UI must explain permanent loss of account data and access,
immediate termination of Sajda Stripe subscriptions, and that no automatic refund
is requested. The server validates stored Stripe customer IDs against their
environment and immutable owner metadata before deleting them. This prevents
future customer operations and immediately cancels their active subscriptions.
Stripe retains its own financial history; this implementation does not create a
new local personal-data archive or invent a legal retention duration.

Apple subscriptions are separate: deleting the Sajda account cannot cancel the
App Store subscription. The user must be told this and given the system manage-
subscription control. Immediate account deletion is still available. The native
commerce account mapping and subscriptions cascade from the deleted identity;
later signed notifications cannot create an account or restore access without an
existing immutable app-account-token mapping.

A billing operation with an active server lease must finish before deletion can
proceed. A provider outage returns a retryable error rather than claiming success.
If Stripe succeeds but the database transaction fails, the account/private data
remain and the response warns that billing may already have stopped. Retrying
recognizes a deleted Stripe customer and completes the remaining transaction.
The website must not globally clear cookies after a response: the user may have
switched to another account while the request was pending. Client cleanup must
remain fenced to the initiating owner and native credential generation.

## Data removed and boundaries

Migration `0015_account_deletion.sql` adds the expiring per-owner challenge and
an initially `NOT VALID` saved-domain foreign key. The foreign key protects all
new writes immediately without destroying or silently rewriting older unmatched
owners; deletion also explicitly removes saved rows for the current owner.

The auth-user deletion cascades passwords, web sessions, native credentials,
developer API keys, access grants, Trading campaigns/runs/work/evidence/quotes,
commercial snapshots and new account-owned tables with cascading foreign keys.
Owner-linked password-reset records and known account-based quota hashes are
explicitly removed. Shared public research sources are not deleted. Global and
IP-based abuse counters, anonymous contact-submission digests and previously sent
emails are not silently associated with an account or falsely reported erased.
Provider retention, mailbox retention, logs and backups need the operator's
documented privacy/retention policy; this code is not a legal-retention policy.

## Verification

- `npx tsx --test tests/account-deletion.test.ts tests/account-deletion-email.test.ts`
  exercises strict input/auth, scope exclusion, owner binding, code limits,
  expiry/replay, provider/DB recovery, sanitized errors and five email languages.
- `tests/account-deletion-postgres.test.ts` is opt-in and restricted to the reviewed
  development Neon project. It requires migration 0015 to exist; it never applies
  migrations. Synthetic identities and service transactions are enclosed in one
  outer rollback. Email and billing adapters are fakes even in this DB test.
- Enable that fixture with `SAJDA_DELETION_DB_TEST=1` and the reviewed development
  environment. Never run it against production. Check its output for zero actual
  provider calls and zero persisted fixtures.
- A real received confirmation email, physical-device flow, and real Stripe
  cancellation are separate verification levels. Unit tests do not prove them.

Primary references checked 2026-09-10:
[Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
and [Stripe customer deletion](https://docs.stripe.com/api/customers/delete).

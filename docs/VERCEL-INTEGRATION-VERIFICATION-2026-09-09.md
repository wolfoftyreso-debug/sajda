# Vercel integration follow-up — 2026-09-09

## Release boundary

The network/access limitations in the earlier Trading release report no longer
apply to this session. This record supersedes those infrastructure unknowns only
where verified below. It does **not** certify production commerce, inbox delivery,
multi-day unattended research, licensed valuation data or investment readiness.

Code commit `c42c734` was pushed to `wolfoftyreso-debug/sajda` on `main`.
Its GitHub Actions [Verify run](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34394633267)
completed successfully, independently of the local test run.
Two Vercel **preview**, not production, deployments were created:

- `https://sajda-bzlxy5g1g-hypbit.vercel.app` — READY; first runtime verification.
- `https://sajda-k455asubf-hypbit.vercel.app` — READY; includes the sandbox webhook
  secret added after the first build. Runtime re-verification is recorded below.

Both belong to the existing `hypbit/sajda` project, build using Node 24 / Vite,
and retain Vercel deployment protection. An unauthenticated browser can therefore
reach Vercel login instead of Sajda. These are not public production links.

## Database and authentication

- Verified distinct Neon development/preview and production targets.
- Applied reviewed migrations `0009` through `0012` **only to development**:
  ledger now 13 applied, zero pending. Production remains 9 applied, 4 pending;
  no production data or schema was changed in this follow-up.
- Actual PostgreSQL Trading rollback harness: **41 passed**, zero persistent
  fixtures, zero external provider calls. Existing source enablement was restored
  exactly. Its fixture driver now follows V3 confirmation rounds and uses
  internally consistent DNS/HTTP evidence.
- Actual PostgreSQL commerce rollback harness: **14 passed**, no Stripe calls.
- Better Auth + actual development Neon through local handlers: **27 passed**.
  Covers unverified signup, signed verification, login, cookie sessions, saved
  data, IDOR/CSRF denial, logout, relogin, one-use reset, session revocation and
  concurrent database rate limiting. Two unique synthetic users were cleaned up;
  no existing users changed. Email callbacks were captured, not delivered.

## Stripe

The user had accepted Vercel's Stripe integration terms. A single free test
sandbox, `sajda-stripe-sandbox`, was provisioned and connected **only to preview
and development**. The approved Trading price is exactly **USD 1,880/month**.
See [Stripe evidence](STRIPE-SANDBOX-VERIFICATION-2026-09-09.md) for catalog IDs,
real provider operations, and the SDK Decimal defect repaired in this pass.

An actual test Checkout was created, retrieved, recovered and explicitly expired.
A billing portal session was created. No payment/card was submitted, no paid
subscription was created and the unpaid customer had no entitlement.

The single sandbox webhook `we_1UDr8GAJ7seQoN51jemW10Qn` uses pinned API version
`2026-08-26.dahlia`, exactly the 17 documented events and the second preview's
`/api/billing-webhook` URL. Its signing secret went directly from provider memory
to Vercel's secret store through CLI stdin; it was not printed or checked in.

**External delivery is blocked by Vercel preview protection (HTTP 401).**
Protection was not disabled or bypassed for Stripe. Configuration is not delivery
evidence. `STRIPE_CHECKOUT_ENABLED=false` remains deliberate. No production Stripe
variables, live activation, real charge, tax policy or new subscription expense
was introduced. Bas/Premium purchases remain unimplemented/inactive.

## Resend

The operator chose `mail.hypbit.com` as the sender domain. Preview/development
sender configuration is `Sajda <noreply@mail.hypbit.com>`; the contact recipient
remains `dev@hypbit.com`. Verification/reset emails belong to the account holder,
not a support mailbox copy.

The operator accepted the Resend terms themselves; the browser confirmed
**Terms Accepted**. The retry selected the advertised free plan and `eu-west-1`,
but Vercel/Resend refused provisioning with HTTP 400,
`Billing plan is disabled: free`. A subsequent resource inventory confirmed that
no Resend resource was created. A paid plan was not substituted automatically;
the operator was asked to choose an existing account or approve Pro at USD20/month.
No Resend key, sender verification, test email or inbox-delivery proof exists yet.
DNS authority for `hypbit.com` is AWS. No DNS/MX/SPF records were changed.

## Tests and observed product behavior

- `npm run check`: **616 tests; 614 passed, 0 failed, 2 skipped**, plus lint,
  TypeScript, Vercel/Neon, SEO, Node and UI contracts. The separate actual DB
  harness counts above must not be confused with those two skipped suites.
- First preview: **55 authenticated CLI HTTP/HTML/API checks passed**;
  `/api/health` returned 200 and `database=connected`.
- Second preview re-verification: **55/55 HTTP checks**, **7/7 contact-negative
  checks**, health 200/connected. Invalid webhook signatures reached the handler
  through authenticated operator transport and were rejected with 400,
  `invalid_webhook_signature`, a request ID and `no-store`. This is not Stripe
  delivery. Sampled runtime logs had no observed 5xx; expected negative test
  responses and Node's `DEP0169` URL-parser warning were distinguished from
  actual failed application requests.
- Actual browser on the first preview: English-to-Swedish language change,
  keyword submission, loading-to-results transition, 50 returned names and
  completed Top 10 review with editorial notes. This confirms interaction, not
  independently verified commercial quality of every suggested name.
- At an explicit 375px test viewport, DOM bounds for the page and result headings
  stayed inside the viewport. Screenshot capture was inconsistent; this is not
  a claim of complete visual/mobile regression coverage.
- On the second preview, the pricing page showed USD0/9/29/1880 and accurately
  disabled unlaunched purchases. At 320px, 430px and 1280px, DOM bounds showed no
  horizontal document overflow and all visible H1/H2 headings stayed inside.
  Footer sign-in navigation worked. A synthetic nonexistent-account login was
  denied with recoverable `Invalid email or password` feedback.
- The search displayed no currently verified provider prices (0 published,
  2 checked, 18 purchase links). Unknown prices remained unknown; no quote or
  investment value was invented. Price-source follow-up remains separate.

## Next release gates

1. Resolve the rejected free Resend plan using an explicitly approved billing
   choice or existing account, then verify the chosen sending subdomain through
   the existing DNS owner, preserving mail DNS.
2. Test genuine verification/reset/contact delivery, action links and failures.
3. Establish a reviewed public webhook route, complete Stripe sandbox payment,
   delivery/replay and entitlement tests. Confirm tax/legal behavior before sales.
4. Apply and verify the pending production migrations only as part of the
   controlled production rollout. Keep production DB and test identities separate.
5. Validate price-source availability and paid research inputs; explicitly approve
   source catalog/scheduler settings before autonomous Trading operation.

No production deployment or Git-to-production automatic deployment was enabled.

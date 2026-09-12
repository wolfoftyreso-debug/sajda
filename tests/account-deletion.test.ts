import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createAccountDeletionService, deriveDeletionCode, type DeletionClient } from "../api/_shared/account-deletion.js";
import { createDeletionBilling, type DeletionStripeClient } from "../api/_shared/account-deletion-billing.js";
import accountDeletionHandler, { createAccountDeletionHandler } from "../api/account/deletion.js";
import { createDelegatedAccountHeaders } from "../api/_shared/delegated-account.js";
import { AccountAccessError } from "../api/_shared/account-error.js";

const secret = "delete-test-secret-not-a-credential-".repeat(2);
const account = { id: "deletion-owner", emailVerified: true };
function fixture(options: { failEmail?: boolean; failBilling?: boolean; failDelete?: boolean; busy?: boolean } = {}) {
  type Challenge = { id: string; hash: string; attempts: number; requests: number; valid: boolean };
  let state = { exists: true, challenge: undefined as Challenge | undefined, saved: true };
  let snapshot = structuredClone(state);
  const calls: string[] = [], rateSubjects: string[] = [], mails: { to: string; code: string; requestId: string }[] = [];
  let billingCalls = 0;
  const client: DeletionClient = {
    release() {},
    async query(sql, args = []) {
      calls.push(sql);
      if (sql === "BEGIN") snapshot = structuredClone(state);
      if (sql === "ROLLBACK") state = structuredClone(snapshot);
      if (sql.includes("deletion:owner")) return { rows: state.exists && args[0] === account.id ? [{ id: account.id, email: "owner@example.test" }] : [] };
      if (sql.includes("deletion:request")) {
        if ((state.challenge?.requests ?? 0) >= 3) return { rows: [] };
        const same = state.challenge?.id === args[1];
        state.challenge = { id: String(args[1]), hash: String(args[2]), attempts: same ? state.challenge!.attempts : 0,
          requests: (state.challenge?.requests ?? 0) + 1, valid: same ? state.challenge!.valid : true };
        return { rows: [{ expires_at: "2026-09-10T20:15:00.000Z", attempts: state.challenge.attempts, valid: state.challenge.valid }] };
      }
      if (sql.includes("deletion:attempt")) {
        const c = state.challenge;
        if (!c || c.id !== args[1] || !c.valid || c.attempts >= 5) return { rows: [] };
        c.attempts++; return { rows: [{ code_hash: c.hash }] };
      }
      if (sql.includes("deletion:recheck")) return { rows: state.challenge?.valid && state.challenge.id === args[1] && state.challenge.hash === args[2] ? [{ owner_id: account.id }] : [] };
      if (sql.includes("deletion:billing */")) return { rows: [{ namespace: "development", customer_id: "cus_DeletionFixture", livemode: false, busy: options.busy === true }] };
      if (sql.includes("deletion:saved")) state.saved = false;
      if (sql.includes("deletion:rates")) rateSubjects.push(...args[0] as string[]);
      if (sql.includes("deletion:delete-user")) {
        if (options.failDelete) throw new Error("connection postgres://private");
        state.exists = false; state.challenge = undefined; return { rows: [{ id: account.id }] };
      }
      return { rows: [] };
    },
  };
  const service = createAccountDeletionService({ pool: { connect: async () => client }, secret: () => secret,
    sendEmail: async message => { mails.push(message); if (options.failEmail) throw new Error("provider private"); },
    closeBilling: async () => { billingCalls++; if (options.failBilling) throw new Error("provider private"); return "canceled"; },
  });
  const id = randomUUID();
  const request = () => service.execute(account, { action: "request", requestId: id, language: "en" });
  const confirm = (code = deriveDeletionCode(secret, account.id, id)) => service.execute(account, { action: "confirm", requestId: id, code, confirmation: "DELETE" });
  return { options, service, id, request, confirm, mails, calls, rateSubjects, get state() { return state; }, get billingCalls() { return billingCalls; } };
}
const hasCode = (code: string) => (error: unknown) => error instanceof AccountAccessError && error.code === code;

test("deletion request only sends stored-owner code; authenticated confirmation actually removes account", async () => {
  const f = fixture();
  assert.deepEqual(await f.request(), { status: "confirmation_required", deletionRequestId: f.id, expiresAt: "2026-09-10T20:15:00.000Z" });
  assert.equal(f.state.exists, true); assert.equal(f.state.saved, true); assert.equal(f.billingCalls, 0);
  assert.equal(f.mails[0].to, "owner@example.test"); assert.match(f.mails[0].code, /^\d{8}$/u);
  assert.notEqual(f.state.challenge?.hash, f.mails[0].code);
  assert.deepEqual(await f.confirm(), { status: "deleted", deletionRequestId: f.id, billing: "canceled" });
  assert.equal(f.state.exists, false); assert.equal(f.state.saved, false); assert.equal(f.billingCalls, 1);
  assert.ok(f.calls.findIndex(sql => sql.includes("deletion:billing")) < f.calls.findIndex(sql => sql.includes("deletion:delete-user")));
  await assert.rejects(f.confirm, hasCode("invalid_session")); assert.equal(f.billingCalls, 1);
});

test("account deletion removes scenario rate identifiers in all namespaces and retains existing cleanup", async () => {
  const f = fixture(); await f.request();
  assert.deepEqual(f.rateSubjects, []);
  await f.confirm();
  const subjects = [
    ...["lost-domains", "saved-domains", "commerce"].map(scope => `${scope}:${account.id}`),
    ...["development", "preview", "production"].flatMap(namespace =>
      ["native", "account-membership", "trading-scenarios"].map(scope => `${scope}:${namespace}:${account.id}`)),
  ].map(subject => createHash("sha256").update(subject).digest("hex"));
  assert.deepEqual([...f.rateSubjects].sort(), subjects.sort());
  assert.equal(new Set(f.rateSubjects).size, 12);
  const removal = f.calls.findIndex(sql => sql.includes("deletion:rates"));
  assert.ok(removal >= 0 && removal < f.calls.findIndex(sql => sql.includes("deletion:delete-user")));
  assert.match(f.calls[removal], /WHERE subject_hash=ANY\(\$1::text\[\]\)/u);
});
test("wrong code attempts commit and cannot be reset by reusing a request UUID", async () => {
  const f = fixture(); await f.request();
  const bad = f.mails[0].code === "00000000" ? "11111111" : "00000000";
  for (let i = 0; i < 5; i++) await assert.rejects(() => f.confirm(bad), hasCode("deletion_code_invalid"));
  assert.equal(f.state.challenge?.attempts, 5);
  await assert.rejects(f.confirm, hasCode("deletion_code_invalid"));
  await assert.rejects(f.request, hasCode("deletion_code_invalid"));
  assert.equal(f.billingCalls, 0); assert.equal(f.state.exists, true);
});
test("request rate budget is shared across new challenge UUIDs and repeated delivery requests", async () => {
  const f = fixture(); await f.request(); await f.request(); await f.request();
  assert.equal(new Set(f.mails.map(message => message.code)).size, 1);
  await assert.rejects(f.request, hasCode("deletion_rate_limited"));
  await assert.rejects(() => f.service.execute(account, { action: "request", requestId: randomUUID(), language: "sv" }), hasCode("deletion_rate_limited"));
  assert.equal(f.mails.length, 3);
});
test("foreign, expired and superseded challenges cannot close billing or remove data", async () => {
  const f = fixture(); await f.request();
  await assert.rejects(() => f.service.execute({ id: "different-owner", emailVerified: true }, { action: "confirm", requestId: f.id, code: f.mails[0].code, confirmation: "DELETE" }), hasCode("invalid_session"));
  f.state.challenge!.valid = false;
  await assert.rejects(f.confirm, hasCode("deletion_code_invalid"));
  f.state.challenge!.valid = true;
  await f.service.execute(account, { action: "request", requestId: randomUUID(), language: "sv" });
  await assert.rejects(f.confirm, hasCode("deletion_code_invalid"));
  assert.equal(f.billingCalls, 0);
});
test("email outage never deletes and same immutable request can safely retry", async () => {
  const f = fixture({ failEmail: true });
  await assert.rejects(f.request, hasCode("deletion_email_unavailable"));
  assert.equal(f.state.exists, true); assert.equal(f.billingCalls, 0);
  f.options.failEmail = false; await f.request();
  assert.equal(f.mails[0].code, f.mails[1].code);
  await f.confirm(); assert.equal(f.state.exists, false);
});
test("active billing lease blocks deletion and provider/DB failures roll back private data", async () => {
  for (const problem of ["busy", "failBilling", "failDelete"] as const) {
    const f = fixture({ [problem]: true }); await f.request();
    await assert.rejects(f.confirm, hasCode(problem === "busy" ? "deletion_billing_busy" : "deletion_unavailable"));
    assert.equal(f.state.exists, true); assert.equal(f.state.saved, true);
    assert.equal(f.state.challenge?.attempts, 1, "failed provider call does not refund guess budget");
    f.options[problem] = false; await f.confirm(); assert.equal(f.state.exists, false);
  }
});

function response() {
  return { code: 0, body: {} as Record<string, unknown>, headers: new Map<string, string | number>(),
    setHeader(key: string, value: string | number) { this.headers.set(key.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body as Record<string, unknown>; } };
}
test("HTTP is POST-only, strict JSON, no query identity, and rejects all API-key delegation", async () => {
  let calls = 0;
  const handler = createAccountDeletionHandler(async () => account, { execute: async () => { calls++; return { status: "deleted", deletionRequestId: randomUUID(), billing: "none" }; } });
  const body = { action: "confirm", requestId: randomUUID(), code: "12345678", confirmation: "DELETE" };
  for (const method of ["GET", "DELETE", "PUT", "HEAD"]) {
    const res = response(); await handler({ method, headers: {}, body }, res); assert.equal(res.code, 405);
  }
  const delegated = createDelegatedAccountHeaders({ userId: account.id, credentialId: randomUUID(), source: "api-key",
    environment: process.env.VERCEL_ENV || "development", scopes: ["account:delete"] }, "account:delete", "POST");
  const denied = response(); await handler({ method: "POST", headers: delegated, body }, denied); assert.equal(denied.code, 403);
  for (const [request, expected] of [
    [{ headers: { "content-type": "text/plain" }, body }, 415],
    [{ headers: { "content-type": "application/json" }, body: { ...body, ownerId: "another" } }, 400],
    [{ headers: { "content-type": "application/json" }, body, query: { code: "12345678" } }, 400],
    [{ headers: { "content-type": "application/json" }, body: "x".repeat(1100) }, 413],
    [{ headers: { "content-type": "application/json" }, get body() { throw new Error("malformed secret"); } }, 400],
  ] as const) {
    const res = response(); await handler(Object.defineProperties({ method: "POST" }, Object.getOwnPropertyDescriptors(request)), res); assert.equal(res.code, expected);
  }
  assert.equal(calls, 0);
  const native = createDelegatedAccountHeaders({ userId: account.id, credentialId: randomUUID(), source: "native",
    environment: process.env.VERCEL_ENV || "development", scopes: ["account:delete"] }, "account:delete", "POST");
  const res = response(); await handler({ method: "POST", headers: native, body }, res);
  assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(res.body.accountId, account.id);
  assert.equal(res.headers.get("cache-control"), "private, no-store"); assert.equal(res.headers.has("set-cookie"), false);
});

test("Stripe deletion verifies owner and mode, tolerates deleted-customer retry, and never activates checkout", async () => {
  const customer = { namespace: "preview", customerId: "cus_Fixture", live: false };
  let deleted = false, wrongOwner = true, calls = 0;
  const close = createDeletionBilling({ environment: () => ({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}` }),
    client: () => ({ customers: {
      retrieve: async () => ({ id: customer.customerId, object: "customer", deleted: deleted || undefined, livemode: false,
        metadata: { sajda_namespace: "preview", sajda_owner_hash: wrongOwner ? "wrong" : createHash("sha256").update(`preview:${account.id}`).digest("hex") } }),
      del: async () => { calls++; deleted = true; return { id: customer.customerId, deleted: true, object: "customer" }; },
    } } as unknown as DeletionStripeClient),
  });
  await assert.rejects(() => close(account.id, [customer]), hasCode("deletion_billing_unavailable")); assert.equal(calls, 0);
  wrongOwner = false; assert.equal(await close(account.id, [customer]), "canceled"); assert.equal(calls, 1);
  assert.equal(await close(account.id, [customer]), "canceled"); assert.equal(calls, 1);
  assert.equal(await close(account.id, []), "none");
  await assert.rejects(() => close(account.id, [{ ...customer, live: true }]), hasCode("deletion_billing_unavailable"));
});

test("public callers cannot forge native delegation and no deletion endpoint accepts anonymous code possession", async () => {
  for (const headers of [{}, { authorization: "Bearer sj_test_fake" }, { "x-sajda-account": account.id, "x-sajda-source": "native" }]) {
    const res = response();
    await accountDeletionHandler({ method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: { action: "confirm", requestId: randomUUID(), code: "12345678", confirmation: "DELETE" } }, res);
    assert.equal(res.code, 401); assert.equal(res.body.code, "authentication_required");
  }
});
test("a native account-read delegation is not authority to delete and backend failures expose no secrets", async () => {
  const native = createDelegatedAccountHeaders({ userId: account.id, credentialId: randomUUID(), source: "native",
    environment: process.env.VERCEL_ENV || "development", scopes: ["account:read"] }, "account:read", "POST");
  let calls = 0;
  const handler = createAccountDeletionHandler(async () => account, { execute: async () => { calls++; throw new Error("postgres://private secret123"); } });
  const body = { action: "request", requestId: randomUUID(), language: "en" };
  const denied = response(); await handler({ method: "POST", headers: native, body }, denied);
  assert.equal(denied.code, 403); assert.equal(calls, 0);
  const log = console.error; const output: unknown[] = []; console.error = (...values) => { output.push(...values); };
  try {
    const failed = response(); await handler({ method: "POST", headers: { "content-type": "application/json" }, body }, failed);
    assert.equal(failed.code, 503); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify([failed.body, output]), /postgres|private|secret123|deletion-owner/u);
    assert.equal(typeof failed.body.requestId, "string");
  } finally { console.error = log; }
});

test("partial Stripe deletion retries only remaining customer and validates all ownership before mutation", async () => {
  const customers = ["development", "preview"].map((namespace, index) => ({ namespace, customerId: `cus_Partial${index}`, live: false }));
  const removed = new Set<string>(), calls: string[] = [];
  let wrongOwner = true, failOnce = true;
  const close = createDeletionBilling({ environment: () => ({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}` }),
    client: () => ({ customers: {
      retrieve: async (id: string) => {
        const item = customers.find(candidate => candidate.customerId === id)!;
        return { id, object: "customer", deleted: removed.has(id) || undefined, livemode: false,
          metadata: { sajda_namespace: item.namespace, sajda_owner_hash: wrongOwner && id.endsWith("1") ? "invalid"
            : createHash("sha256").update(`${item.namespace}:${account.id}`).digest("hex") } };
      },
      del: async (id: string) => {
        calls.push(id);
        if (id.endsWith("1") && failOnce) { failOnce = false; throw new Error("provider timeout with private body"); }
        removed.add(id); return { id, object: "customer", deleted: true };
      },
    } } as unknown as DeletionStripeClient),
  });
  await assert.rejects(() => close(account.id, customers), hasCode("deletion_billing_unavailable")); assert.equal(calls.length, 0);
  wrongOwner = false;
  await assert.rejects(() => close(account.id, customers), hasCode("deletion_billing_unavailable"));
  assert.deepEqual([...removed], [customers[0].customerId]);
  assert.equal(await close(account.id, customers), "canceled");
  assert.deepEqual(calls, [customers[0].customerId, customers[1].customerId, customers[1].customerId]);
  assert.equal(removed.size, 2);
});

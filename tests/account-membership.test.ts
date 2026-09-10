import assert from "node:assert/strict";
import test from "node:test";
import type { AccountMembership } from "../shared/account-membership";
import { AccountAccessError } from "../api/_shared/account-auth";
import { createAccountMembershipReader } from "../api/_shared/account-membership";
import membershipHandler, { createAccountMembershipHandler } from "../api/account/membership";

const account = { id: "membership-owner-a", emailVerified: true };
const now = Date.parse("2026-09-10T12:00:00Z");
const free: AccountMembership = { plan: "free", accessSource: "free", expiresAt: null,
  capabilities: { save_domains: true, swipe_undo: false, trading: false } };
type Grant = { owner: string; plan: "premium" | "trading"; source: "operator" | "subscription";
  starts: number; expires: number; revoked?: boolean; namespace?: string };

/** Deliberately labelled simulation: real PostgreSQL is exercised separately
 * in the rollback harness. This transport checks SQL and decoded boundaries.
 */
function membershipFixture(namespace = "preview") {
  const grants: Grant[] = [];
  const calls: { text: string; params: unknown[] }[] = [];
  const state = { count: 1, verified: true, corrupt: null as Record<string, unknown> | null };
  const read = createAccountMembershipReader({ environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }),
    query: async (text, params) => {
      calls.push({ text, params });
      assert.match(text, /FROM sajda\.lost_domain_effective_access a/u);
      assert.match(text, /a\.owner_id = \$2 AND a\.namespace = \$4 AND u\.verified = true/u);
      assert.match(text, /a\.revoked_at IS NULL AND a\.valid_from <= statement_timestamp\(\)/u);
      assert.match(text, /a\.expires_at > statement_timestamp\(\)/u);
      assert.match(text, /entitlement\.grant_source IN \('operator', 'billing'\)/u);
      assert.match(text, /operator_grant\.grant_source = 'operator'/u);
      assert.match(text, /ORDER BY tier DESC, expires_at DESC/u);
      assert.match(text, /request_count = sajda\.function_rate_limits\.request_count \+ 1/u);
      assert.doesNotMatch(text, /(?:INSERT INTO|UPDATE|DELETE FROM) sajda\.(?:account_entitlements|commerce_access|lost_domain_access)/u);
      assert.equal(params[2], 120);
      assert.equal(params[3], namespace);
      assert.match(String(params[0]), /^[a-f0-9]{64}$/u);
      assert.equal(text.includes(String(params[1])), false);
      const active = grants.filter(grant => grant.owner === params[1] && !grant.revoked
        && grant.starts <= now && grant.expires > now && state.verified && state.count <= 120
        && (grant.source === "operator" || grant.namespace === namespace));
      active.sort((a, b) => Number(b.plan === "trading") - Number(a.plan === "trading") || b.expires - a.expires);
      const top = active[0];
      return [state.corrupt ?? { request_count: state.count, account_id: params[1], verified: state.verified,
        namespace, checked_at: new Date(now), plan: top?.plan ?? null, access_source: top?.source ?? null,
        expires_at: top ? new Date(top.expires) : null }];
    } });
  return { grants, calls, state, read };
}

test("Trading includes Premium on the same verified account without writing a second grant", async () => {
  const fixture = membershipFixture();
  assert.deepEqual(await fixture.read(account), free);
  fixture.grants.push({ owner: account.id, plan: "trading", source: "operator", starts: now - 1, expires: now + 60_000 });
  assert.deepEqual(await fixture.read(account), { plan: "trading", accessSource: "operator",
    expiresAt: new Date(now + 60_000).toISOString(), capabilities: { save_domains: true, swipe_undo: true, trading: true } });
  assert.deepEqual(await fixture.read({ id: "membership-owner-b", emailVerified: true }), free);
  assert.notEqual(fixture.calls[1].params[0], fixture.calls[2].params[0]);
});

test("Trading downgrade uses only still-active Premium and eventually Free, with no copied permission", async () => {
  const fixture = membershipFixture();
  const premium: Grant = { owner: account.id, plan: "premium", source: "operator", starts: now - 1, expires: now + 120_000 };
  const trading: Grant = { ...premium, plan: "trading", expires: now + 60_000 };
  fixture.grants.push(premium, trading);
  assert.equal((await fixture.read(account)).plan, "trading", "Longer Premium never hides Trading");
  trading.revoked = true;
  const downgraded = await fixture.read(account);
  assert.equal(downgraded.plan, "premium");
  assert.equal(downgraded.expiresAt, new Date(premium.expires).toISOString());
  assert.deepEqual(downgraded.capabilities, { save_domains: true, swipe_undo: true, trading: false });
  premium.expires = now;
  assert.deepEqual(await fixture.read(account), free);
});

test("future, expired and revoked grants cannot produce a paid tier; active expiry is exact", async () => {
  const fixture = membershipFixture();
  for (const edge of [ { starts: now + 1, expires: now + 60_000 },
    { starts: now - 60_000, expires: now }, { starts: now - 60_000, expires: now - 1 },
    { starts: now - 1, expires: now + 60_000, revoked: true } ]) {
    fixture.grants.splice(0, Infinity, { owner: account.id, plan: "trading", source: "operator", ...edge });
    assert.deepEqual(await fixture.read(account), free);
  }
  fixture.grants.splice(0, Infinity,
    { owner: account.id, plan: "trading", source: "operator", starts: now, expires: now + 50_000 },
    { owner: account.id, plan: "trading", source: "subscription", namespace: "preview", starts: now - 1, expires: now + 60_000 },
    { owner: account.id, plan: "trading", source: "operator", starts: now - 1, expires: now + 200_000, revoked: true });
  const membership = await fixture.read(account);
  assert.equal(membership.expiresAt, new Date(now + 60_000).toISOString());
  assert.equal(membership.accessSource, "subscription");
});

test("commerce is isolated by deployment namespace, while explicit operator grants retain existing semantics", async () => {
  const preview = membershipFixture("preview"), production = membershipFixture("production"), development = membershipFixture("development");
  const paid: Grant = { owner: account.id, plan: "trading", source: "subscription", namespace: "preview", starts: now - 1, expires: now + 1_000 };
  for (const fixture of [preview, production, development]) fixture.grants.push(paid);
  assert.equal((await preview.read(account)).plan, "trading");
  assert.deepEqual(await production.read(account), free);
  assert.deepEqual(await development.read(account), free);
  assert.notEqual(preview.calls[0].params[0], production.calls[0].params[0]);
  paid.namespace = "production";
  assert.deepEqual(await preview.read(account), free);
  assert.equal((await production.read(account)).plan, "trading");
});

test("unknown deployment environment, invalid identity and unverified email fail before querying", async () => {
  let queries = 0;
  for (const env of [{ VERCEL: "1" }, { VERCEL: "1", VERCEL_ENV: "" }, { VERCEL: "1", VERCEL_ENV: "staging" }]) {
    const read = createAccountMembershipReader({ environment: () => env, query: async () => { queries++; return []; } });
    await assert.rejects(() => read(account), /Invalid membership environment/u);
  }
  const read = createAccountMembershipReader({ query: async () => { queries++; return []; } });
  for (const id of ["", " ", "a".repeat(201), null]) {
    await assert.rejects(() => read({ id: id as string, emailVerified: true }), error => error instanceof AccountAccessError && error.status === 401);
  }
  for (const emailVerified of [false, "true", 1]) {
    await assert.rejects(() => read({ ...account, emailVerified: emailVerified as boolean }), error => error instanceof AccountAccessError && error.code === "email_verification_required");
  }
  assert.equal(queries, 0);
});

test("local runtime never falls back to production and an empty grant table never invents Basic", async () => {
  const read = createAccountMembershipReader({ environment: () => ({ VERCEL_ENV: "production" }),
    query: async (_text, params) => {
      assert.equal(params[3], "development");
      return [{ request_count: 1, account_id: account.id, verified: true, namespace: "development",
        checked_at: new Date(now), plan: null, access_source: null, expires_at: null }];
    } });
  assert.deepEqual(await read(account), free);
});

test("malformed SQL rows, changed owner, revoked email and rate limiting never grant access", async () => {
  const fixture = membershipFixture();
  const valid = { request_count: 1, account_id: account.id, verified: true, namespace: "preview",
    checked_at: new Date(now), plan: "trading", access_source: "operator", expires_at: new Date(now + 60_000) };
  for (const invalid of [{ request_count: false }, { request_count: 0 }, { request_count: "1.2" },
    { account_id: "someone-else" }, { namespace: "production" }, { plan: "admin" }, { plan: "basic" },
    { plan: { toString: () => "trading" } }, { access_source: "browser" }, { expires_at: null },
    { expires_at: "infinity" }, { expires_at: new Date(now) }, { checked_at: "unknown" }]) {
    fixture.state.corrupt = { ...valid, ...invalid };
    await assert.rejects(() => fixture.read(account), /Invalid/u);
  }
  fixture.state.corrupt = { ...valid, verified: false };
  await assert.rejects(() => fixture.read(account), error => error instanceof AccountAccessError && error.status === 403);
  fixture.state.corrupt = { ...valid, request_count: 121 };
  await assert.rejects(() => fixture.read(account), error => error instanceof AccountAccessError && error.status === 429);
  for (const rows of [[], [valid, valid]]) {
    const read = createAccountMembershipReader({ query: async () => rows });
    await assert.rejects(() => read(account), /Invalid membership response/u);
  }
});

type Handler = ReturnType<typeof createAccountMembershipHandler>;
function responseRecorder() {
  return { code: 200, body: undefined as unknown, headers: new Map<string, string | number>(),
    setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; } };
}
async function perform(handler: Handler, request: Parameters<Handler>[0] = { method: "GET", headers: {} }) {
  const response = responseRecorder(); await handler(request, response); return response;
}

test("membership endpoint requires the same account session, verified email and GET only", async () => {
  assert.equal((await perform(membershipHandler)).code, 401);
  let reads = 0, authorizations = 0;
  const handler = createAccountMembershipHandler(async (_headers, options) => {
    authorizations++; assert.deepEqual(options, { verifiedEmail: true, method: "GET" }); return account;
  }, async owner => { reads++; assert.deepEqual(owner, account); return free; });
  for (const method of [undefined, "POST", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]) {
    const response = await perform(handler, { method });
    assert.equal(response.code, 405); assert.equal(response.headers.get("allow"), "GET");
  }
  assert.equal(authorizations, 0);
  const response = await perform(handler);
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { accountId: account.id, requestId: response.headers.get("x-request-id"), membership: free });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie, X-Sajda-Account");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.has("access-control-allow-origin"), false);
  assert.equal(reads, 1);
});

test("membership API errors contain correlation, never leak SQL/provider data or imply Free on failure", async () => {
  const before = console.error;
  const logs: string[] = []; console.error = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    for (const error of [new Error("postgres://private-user:secret@private-host/table"), new AccountAccessError("rate_limited", 429, "Wait before retrying.")]) {
      const handler = createAccountMembershipHandler(async () => account, async () => { throw error; });
      const response = await perform(handler);
      assert.equal(response.code, error instanceof AccountAccessError ? 429 : 503);
      assert.equal("membership" in (response.body as object), false);
      assert.match(String(response.headers.get("x-request-id")), /^req_[A-Za-z0-9_-]{16}$/u);
      if (response.code === 429) assert.equal(response.headers.get("retry-after"), 60);
      assert.doesNotMatch(JSON.stringify(response.body), /private-user|secret|private-host/u);
    }
    const bad = createAccountMembershipHandler(async () => account, async () => ({ ...free, capabilities: { ...free.capabilities, trading: true } }));
    assert.equal((await perform(bad)).code, 503);
    assert.doesNotMatch(logs.join("\n"), /private-user|secret|private-host|membership-owner-a/u);
  } finally { console.error = before; }
});

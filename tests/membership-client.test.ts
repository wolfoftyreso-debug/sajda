import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import type { AccountMembership } from "../shared/account-membership";
import type { MembershipErrorCode } from "../src/lib/membership";

const origin = "https://sajda.example.test", requestId = "req_0123456789abcdef";
function membership(plan: AccountMembership["plan"] = "premium"): AccountMembership {
  return { plan, accessSource: plan === "free" ? "free" : "subscription",
    expiresAt: plan === "free" ? null : new Date(Date.now() + 3_600_000).toISOString(),
    capabilities: { save_domains: true, swipe_undo: plan === "premium" || plan === "trading", trading: plan === "trading" } };
}

test("membership client trusts only current owner-scoped, strictly validated server snapshots", async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), originalFetch = globalThis.fetch;
  const requests: { url: URL; init: RequestInit }[] = [];
  let owner: string | null = "account-a", sessionExpiry = Date.now() + 60_000;
  let duringSession: (() => void) | undefined, duringResponse: (() => void) | undefined;
  const payload = (value: unknown = membership()) => ({ accountId: "account-a", requestId, membership: value });
  let reply = () => Response.json(payload());
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
  });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout,
    } });
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input)); requests.push({ url, init });
      if (url.pathname === "/api/auth/get-session") {
        const current = owner; duringSession?.();
        return Response.json(current ? {
          user: { id: current, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
          session: { id: "fixture-session", userId: current, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(sessionExpiry).toISOString() },
        } : null);
      }
      assert.equal(url.pathname, "/api/account/membership");
      duringResponse?.(); return reply();
    };
    const { getAccountMembership } = await vite.ssrLoadModule("/src/lib/membership.ts");
    const failed = (code: MembershipErrorCode) => (error: unknown) => error instanceof Error
      && error.name === "MembershipError" && (error as Error & { code: string }).code === code;
    const reads = () => requests.filter(row => row.url.pathname === "/api/account/membership");

    await t.test("all four server plans preserve exact capabilities and use safe GET requests", async () => {
      for (const plan of ["free", "basic", "premium", "trading"] as const) {
        const value = membership(plan); reply = () => Response.json(payload(value));
        assert.deepEqual(await getAccountMembership({ accountId: "account-a" }), value);
      }
      assert.equal(reads().length, 4, "Membership reads do not reuse a browser plan as authorization");
      for (const { url, init } of requests) {
        assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
        assert.equal(new Headers(init.headers).has("authorization"), false);
      }
      for (const { init } of reads()) {
        assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
        assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
        assert.equal(new Headers(init.headers).get("x-sajda-account"), "account-a");
      }
    });

    await t.test("malformed membership, contradictory capabilities and coercible values are rejected", async () => {
      const valid = membership();
      for (const value of [null, [], "premium", {}, { ...valid, plan: "admin" }, { ...valid, plan: ["premium"] },
        { ...valid, accessSource: ["operator"] }, { ...valid, accessSource: null }, { ...valid, accessSource: "free" },
        { ...valid, expiresAt: null }, { ...valid, expiresAt: "forever" }, { ...valid, expiresAt: "2030-01-01" },
        { ...valid, capabilities: null }, { ...valid, capabilities: [] },
        { ...valid, capabilities: { ...valid.capabilities, save_domains: "true" } },
        { ...valid, capabilities: { ...valid.capabilities, swipe_undo: "true" } },
        { ...valid, capabilities: { ...valid.capabilities, trading: true } },
        { ...membership("free"), expiresAt: valid.expiresAt }, { ...membership("free"), accessSource: "operator" },
        { ...membership("basic"), capabilities: { save_domains: true, swipe_undo: true, trading: false } },
      ]) {
        reply = () => Response.json(payload(value));
        await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("invalid_response"), JSON.stringify(value));
      }
    });

    await t.test("malformed or denied envelopes cannot be mistaken for a Free membership", async () => {
      const valid = payload();
      for (const value of [null, [], "premium", {}, { ...valid, accountId: undefined }, { ...valid, accountId: 12 },
        { ...valid, requestId: undefined }, { ...valid, requestId: "<script>" }, { ...valid, requestId: "req_short" },
        { ...valid, ok: false }, { ...valid, error: "denied" }, { ...valid, code: "not_allowed" }]) {
        reply = () => Response.json(value);
        await assert.rejects(getAccountMembership({ accountId: "account-a" }));
      }
      reply = () => Response.json({ ...valid, accountId: "account-b" });
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("account_changed"));
      reply = () => new Response("not-json");
      await assert.rejects(getAccountMembership({ accountId: "account-a" }));
    });

    await t.test("failures retain safe error categories instead of silently granting Free", async () => {
      for (const [status, code, expected] of [
        [401, "authentication_required", "unauthenticated"], [403, "email_verification_required", "email_verification_required"],
        [409, "account_changed", "account_changed"], [403, "invalid_origin", "unavailable"],
        [429, "rate_limited", "unavailable"], [503, "membership_unavailable", "unavailable"],
      ] as const) {
        reply = () => Response.json({ error: "private-provider-detail", code, requestId }, { status });
        await assert.rejects(getAccountMembership({ accountId: "account-a" }), error => {
          assert.ok(failed(expected)(error)); assert.doesNotMatch((error as Error).message, /private-provider/u);
          assert.equal((error as Error & { requestId: string }).requestId, requestId); return true;
        });
      }
      reply = () => { throw new Error("private connection string"); };
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("unavailable"));
    });

    await t.test("account switches, logout and expired sessions invalidate responses in flight", async () => {
      reply = () => Response.json(payload()); owner = "account-b";
      const before = reads().length;
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("account_changed"));
      assert.equal(reads().length, before);
      owner = "account-a"; duringResponse = () => { owner = "account-b"; };
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("account_changed"));
      owner = "account-a"; duringResponse = () => { owner = null; };
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("unauthenticated"));
      owner = "account-a"; duringResponse = () => { sessionExpiry = Date.now() - 1_000; };
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("unauthenticated"));
      duringResponse = undefined; sessionExpiry = Date.now() + 60_000;
    });

    await t.test("expired grants cannot survive an otherwise valid account session", async () => {
      reply = () => Response.json(payload({ ...membership(), expiresAt: new Date(Date.now() - 1_000).toISOString() }));
      await assert.rejects(getAccountMembership({ accountId: "account-a" }), failed("expired"));
    });

    await t.test("scope is immutable and aborted requests never return an access snapshot", async () => {
      reply = () => Response.json(payload());
      const options = { accountId: "account-a" };
      duringSession = () => { options.accountId = "account-b"; };
      assert.equal((await getAccountMembership(options)).plan, "premium");
      duringSession = undefined;
      assert.equal(new Headers(reads().at(-1)!.init.headers).get("x-sajda-account"), "account-a");
      const cancelled = new AbortController(); cancelled.abort(); const before = requests.length;
      await assert.rejects(getAccountMembership({ accountId: "account-a", signal: cancelled.signal }), { name: "AbortError" });
      assert.equal(requests.length, before);
      const late = new AbortController(); duringResponse = () => late.abort();
      await assert.rejects(getAccountMembership({ accountId: "account-a", signal: late.signal }), { name: "AbortError" });
      duringResponse = undefined;
      await assert.rejects(getAccountMembership({ accountId: "" }), failed("unauthenticated"));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    await vite.close();
  }
});

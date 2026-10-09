import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createAccountAuth } from "../api/_shared/account-server.js";
import { createAuthHandler } from "../api/auth.js";

const origin = "https://sajda.test";
const appleOrigin = "https://appleid.apple.com";
let originalFetch: typeof fetch;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("These SDK regressions must never contact an OAuth provider or send telemetry"); };
});
after(() => { globalThis.fetch = originalFetch; });

/** Real SDK routing/state checks, with all database and provider sockets removed. */
async function callbackFixture() {
  const pool = new Pool({ connectionString: "postgresql://fixture:fixture@fixture.invalid/fixture" });
  const migration = readFileSync(new URL("../db/migrations/0002_vercel_auth.sql", import.meta.url), "utf8");
  const columns = [...migration.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/gu)].flatMap(table =>
    table[2].split("\n").flatMap(line => {
      const column = /^\s*(?:"([^"]+)"|([a-z_]\w*))\s+(text|boolean|timestamptz|bigint|integer)\b/iu.exec(line);
      return column ? [{ column: column[1] ?? column[2], not_null: /NOT NULL|PRIMARY KEY/u.test(line), has_default: /DEFAULT/u.test(line),
        table: table[1], table_type: "r", schema: "public", type: ({ boolean: "bool", bigint: "int8", integer: "int4" } as Record<string, string>)[column[3]] ?? column[3],
        type_schema: "pg_catalog", column_description: null, auto_incrementing: null }] : [];
    }));
  Object.assign(pool, {
    async query(sql: string, args: unknown[]) {
      assert.match(sql, /account:auth-rate-limit/u, "No account/database query may leave the local fixture");
      const now = Date.now();
      return { rows: [{ key: args[1], count: 1, lastRequest: now, now_ms: now }] };
    },
    connect: async () => ({ release() {}, async query(sql: string) {
      if (sql.includes("current_schemas(true)")) return { rows: [{ schemas: ["pg_catalog", "public"] }] };
      if (sql.includes('"pg_catalog"."pg_attribute"')) return { rows: columns };
      assert.fail("Unexpected account/provider query in the no-network SDK fixture");
    } }),
  });
  const auth = createAccountAuth({ origin, secret: "fixture-only-secret-not-a-real-credential".repeat(2), pool,
    environment: {
      GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret",
      TWITTER_CLIENT_ID: "fixture-twitter-id", TWITTER_CLIENT_SECRET: "fixture-twitter-secret",
      GITHUB_CLIENT_ID: "fixture-github-id", GITHUB_CLIENT_SECRET: "fixture-github-secret",
      APPLE_CLIENT_ID: "fixture-service-id", APPLE_CLIENT_SECRET: "fixture-secret-jwt",
    },
    sendEmail: async () => { assert.fail("OAuth cancellation must not send mail"); },
  });
  const context = await auth.$context;
  type Verification = Awaited<ReturnType<typeof context.internalAdapter.createVerificationValue>>;
  const states = new Map<string, Verification>();
  context.internalAdapter.createVerificationValue = async data => {
    const now = new Date();
    const value = { ...data, id: `fixture-${states.size}`, createdAt: now, updatedAt: now };
    states.set(value.identifier, value);
    return value;
  };
  context.internalAdapter.findVerificationValue = async identifier => states.get(identifier) ?? null;
  context.internalAdapter.deleteVerificationByIdentifier = async identifier => { states.delete(identifier); };
  return { auth, pool, states };
}

async function startApple(auth: Awaited<ReturnType<typeof callbackFixture>>["auth"]) {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ provider: "apple", callbackURL: `${origin}/account`, errorCallbackURL: `${origin}/auth?mode=signin` }),
  }));
  assert.equal(response.status, 200);
  const url = new URL((await response.json() as { url: string }).url);
  assert.equal(url.origin, appleOrigin);
  assert.equal(url.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/apple`);
  assert.equal(url.searchParams.get("response_mode"), "form_post");
  const state = url.searchParams.get("state");
  assert.ok(state);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /HttpOnly/iu);
  assert.match(cookies[0], /Secure/iu);
  assert.match(cookies[0], /SameSite=None/iu);
  return { state, cookie: cookies[0].split(";", 1)[0] };
}

test("real Better Auth accepts Apple's cross-site form post with its state cookie", async () => {
  const { auth, pool, states } = await callbackFixture();
  try {
    const { state, cookie } = await startApple(auth);
    const response = await auth.handler(new Request(`${origin}/api/auth/callback/apple`, { method: "POST",
      headers: { origin: appleOrigin, cookie, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "cross-site" },
      body: new URLSearchParams({ state, error: "access_denied" }).toString(),
    }));
    assert.equal(response.status, 302, "Apple's return must reach the SDK callback, not fail its generic origin check");
    const location = response.headers.get("location");
    assert.ok(location);
    assert.equal(new URL(location).pathname, "/api/auth/callback/apple");
    assert.equal(states.size, 1, "The POST redirect does not consume state prematurely");
    const cancelled = await auth.handler(new Request(location, { headers: { cookie } }));
    assert.equal(cancelled.status, 302);
    const cancelledUrl = new URL(cancelled.headers.get("location")!);
    assert.equal(cancelledUrl.origin, origin);
    assert.equal(cancelledUrl.pathname, "/auth");
    assert.equal(cancelledUrl.searchParams.get("mode"), "signin", "Preserve the origin-validated per-flow error destination");
    assert.equal(cancelledUrl.searchParams.get("error"), "access_denied");
    assert.equal(states.size, 0, "A completed callback consumes the one-use verification");
    const replay = await auth.handler(new Request(location, { headers: { cookie } }));
    const replayUrl = new URL(replay.headers.get("location")!);
    assert.equal(replayUrl.pathname, "/auth");
    assert.equal(replayUrl.searchParams.get("oauth"), "failed");
    assert.equal(replayUrl.searchParams.get("error"), "state_mismatch");
  } finally { await pool.end(); }
});

test("Apple callback exception preserves the real SDK state-cookie binding", async () => {
  const { auth, pool, states } = await callbackFixture();
  try {
    const { state, cookie } = await startApple(auth);
    const url = `${origin}/api/auth/callback/apple?${new URLSearchParams({ state, error: "access_denied" })}`;
    for (const suppliedCookie of [undefined, `${cookie}tampered`]) {
      const rejected = await auth.handler(new Request(url, { headers: suppliedCookie ? { cookie: suppliedCookie } : {} }));
      assert.equal(rejected.status, 302);
      assert.equal(new URL(rejected.headers.get("location")!).searchParams.get("error"), "state_mismatch");
      assert.equal(states.size, 1, "A foreign browser must not consume the legitimate browser's state");
    }
    const randomState = await auth.handler(new Request(`${origin}/api/auth/callback/apple?state=foreign&error=access_denied`, { headers: { cookie } }));
    assert.equal(new URL(randomState.headers.get("location")!).searchParams.get("error"), "state_mismatch");
    assert.equal(states.size, 1);
  } finally { await pool.end(); }
});

test("missing or unknown OAuth state returns to Sajda's recoverable Auth page without provider details", async () => {
  const { auth, pool } = await callbackFixture();
  try {
    for (const provider of ["google", "twitter", "github", "apple"]) {
      for (const [state, error] of [[undefined, "state_not_found"], ["foreign", "state_mismatch"]]) {
        const params = new URLSearchParams({ error: "access_denied", error_description: "fixture-private-provider-detail" });
        if (state) params.set("state", state);
        const response = await auth.handler(new Request(`${origin}/api/auth/callback/${provider}?${params}`));
        assert.equal(response.status, 302);
        const destination = new URL(response.headers.get("location")!);
        assert.equal(destination.origin, origin);
        assert.equal(destination.pathname, "/auth", "Never redirect to the unexposed /api/auth/error endpoint");
        assert.equal(destination.searchParams.get("oauth"), "failed");
        assert.equal(destination.searchParams.get("error"), error);
        assert.equal(destination.searchParams.has("error_description"), false);
        assert.doesNotMatch(destination.toString(), /fixture-private-provider-detail/u);
      }
    }
  } finally { await pool.end(); }
});

test("real SDK builds all four authorization URLs with exact callbacks, state and PKCE", async () => {
  const { auth, pool, states } = await callbackFixture();
  try {
    const providers = [
      ["google", "https://accounts.google.com", ["email", "openid", "profile"]],
      ["twitter", "https://x.com", ["users.email", "users.read"]],
      ["github", "https://github.com", ["read:user", "user:email"]],
      ["apple", appleOrigin, ["email", "name"]],
    ] as const;
    const seenStates = new Set<string>();
    for (const [provider, providerOrigin, scopes] of providers) {
      const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: `${origin}/account`, errorCallbackURL: `${origin}/auth` }),
      }));
      assert.equal(response.status, 200, provider);
      const body = await response.json() as { url: string; redirect: boolean };
      assert.equal(body.redirect, true);
      const url = new URL(body.url);
      assert.equal(url.origin, providerOrigin);
      assert.equal(url.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/${provider}`);
      assert.deepEqual(url.searchParams.get("scope")?.split(" ").sort(), [...scopes].sort());
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.match(url.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/u);
      const state = url.searchParams.get("state")!;
      assert.match(state, /^[A-Za-z0-9_-]{32}$/u);
      assert.ok(!seenStates.has(state));
      seenStates.add(state);
      assert.ok(states.has(`auth-state:${state}`));
      assert.ok(!/fixture-(?:google|twitter|github)-secret|fixture-secret-jwt/u.test(body.url));

      const foreignCallback = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: "https://foreign.invalid/account" }),
      }));
      assert.equal(foreignCallback.status, 403);
      assert.equal((await foreignCallback.json() as { code: string }).code, "INVALID_CALLBACK_URL");
      assert.equal(states.size, seenStates.size, "Untrusted redirect destinations must not create OAuth state");
    }
  } finally { await pool.end(); }
});

test("Apple callback exception does not trust Apple for any sign-in action or other provider", async () => {
  const { auth, pool } = await callbackFixture();
  try {
    const trustedOrigins = auth.options.trustedOrigins;
    assert.equal(typeof trustedOrigins, "function");
    assert.deepEqual(await trustedOrigins(new Request(`${origin}/api/auth/callback/apple`, { method: "POST" })), [origin, appleOrigin]);
    for (const [method, path] of [["GET", "callback/apple"], ["POST", "callback/appleevil"],
      ["POST", "callback/apple/extra"], ["POST", "callback/apple/"], ["POST", "prefix/callback/apple"],
      ["POST", "sign-in/social"], ["POST", "callback/github"]]) {
      assert.deepEqual(await trustedOrigins(new Request(`${origin}/api/auth/${path}`, { method })), [origin], `${method} ${path}`);
    }
    const { cookie } = await startApple(auth);
    const attacker = await auth.handler(new Request(`${origin}/api/auth/callback/apple`, { method: "POST",
      headers: { origin: "https://attacker.invalid", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: "state=foreign&error=access_denied",
    }));
    assert.equal(attacker.status, 403, "The exact callback may trust Apple's origin, never an arbitrary origin");
    assert.equal((await attacker.json() as { code: string }).code, "INVALID_ORIGIN");
    for (const path of ["sign-in/email", "sign-in/social", "callback/github", "callback/appleevil"]) {
      const response = await auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST",
        headers: { origin: appleOrigin, cookie, "content-type": "application/json" },
        body: JSON.stringify(path === "sign-in/email" ? { email: "fixture@example.test", password: "fixture-password" }
          : path === "sign-in/social" ? { provider: "apple", callbackURL: `${origin}/account` } : { state: "fixture", error: "access_denied" }),
      }));
      assert.equal(response.status, 403, path);
      assert.equal((await response.json() as { code: string }).code, "INVALID_ORIGIN", path);
    }
  } finally { await pool.end(); }
});

test("Sajda wrapper still rejects cross-site sign-in before calling the real SDK", async () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = origin;
  try {
    let calls = 0;
    const handler = createAuthHandler(() => { calls++; throw new Error("Foreign sign-in must not reach the SDK"); });
    const response = { code: 0, body: undefined as unknown,
      setHeader() {}, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; }, end() {},
    };
    await handler({ method: "POST", url: "/api/auth/sign-in/social", body: { provider: "apple" },
      headers: { host: "sajda.test", origin: appleOrigin, "sec-fetch-site": "cross-site", "content-type": "application/json" } }, response);
    assert.equal(response.code, 403);
    assert.equal((response.body as { code: string }).code, "invalid_origin");
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = previous;
  }
});

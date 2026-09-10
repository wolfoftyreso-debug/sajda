import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { AccountAccessError } from "../api/_shared/account-error.js";
import {
  createNativeSessionsService, parseAppSessionCursor, parseAppSessionId,
  APP_SESSION_PAGE_SIZE, APP_SESSION_MANAGEMENT_LIMIT, type NativeSessionsQuery,
} from "../api/_shared/native-sessions.js";

const account = { id: "session-owner", emailVerified: true };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const created = "2026-09-10T10:00:00.123456Z", expiry = "2026-09-17T10:00:00.123Z";
function row(n: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: id(n), user_id: account.id, environment: "preview", created_at: created, expires_at: expiry,
    token_hash: "private-token-hash", session_id: "private-browser-session", ...overrides };
}
function fixture(options: { rows?: Record<string, unknown>[]; count?: unknown; failQuota?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let count: unknown = Object.hasOwn(options, "count") ? options.count : 0;
  const query: NativeSessionsQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("app-sessions:quota")) {
      if (options.failQuota) throw new Error("database connection with sensitive details");
      if (typeof count === "number") count = Math.min(count + 1, 21);
      return [{ request_count: count }];
    }
    if (sql.includes("app-sessions:list")) return options.rows ?? [];
    if (sql.includes("app-sessions:revoke")) return [];
    throw new Error("Unexpected query");
  };
  return { calls, query, service: createNativeSessionsService({ query, environment: () => "preview" }) };
}

test("app-session listing returns only public metadata and an exact microsecond keyset", async () => {
  const f = fixture({ rows: Array.from({ length: 26 }, (_, n) => row(100 - n)) });
  const page = await f.service.list(account);
  assert.equal(page.items.length, APP_SESSION_PAGE_SIZE);
  assert.deepEqual(page.items[0], { id: id(100), createdAt: "2026-09-10T10:00:00.123Z", expiresAt: expiry });
  assert.ok(page.nextCursor);
  assert.deepEqual(parseAppSessionCursor(page.nextCursor), { createdAt: created, id: id(76) });
  assert.doesNotMatch(JSON.stringify(page), /private|token_hash|session_id|user_id|environment/u);
  const query = f.calls.find(call => call.sql.includes("app-sessions:list"))!;
  assert.deepEqual(query.params, [account.id, "preview", null, null, 26]);
  assert.match(query.sql, /n\.user_id=\$1 AND n\.environment=\$2 AND n\.revoked_at IS NULL/u);
  assert.match(query.sql, /s\."userId"=n\.user_id/u);
  assert.match(query.sql, /n\.expires_at>statement_timestamp\(\) AND s\."expiresAt">statement_timestamp\(\) AND u\."emailVerified"=true/u);
  assert.match(query.sql, /LEAST\(n\.expires_at,s\."expiresAt"\)/u);
  assert.match(query.sql, /\(n\.created_at,n\.id\)<\(\$3::timestamptz,\$4::uuid\)/u);
  assert.match(query.sql, /ORDER BY n\.created_at DESC,n\.id DESC LIMIT \$5/u);
  await f.service.list(account, page.nextCursor);
  assert.deepEqual(f.calls.at(-1)?.params, [account.id, "preview", created, id(76), 26]);
});

test("app-session pagination is complete at zero, one, or exactly 25 rows", async () => {
  for (const length of [0, 1, 25]) {
    const { service } = fixture({ rows: Array.from({ length }, (_, n) => row(n + 1)) });
    const result = await service.list(account);
    assert.equal(result.items.length, length);
    assert.equal(result.nextCursor, null);
  }
});

test("app-session cursor accepts only canonical bounded timestamp/UUID tuples", () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  assert.equal(parseAppSessionCursor(undefined), null);
  assert.deepEqual(parseAppSessionCursor(encode([created, id(1)])), { createdAt: created, id: id(1) });
  for (const value of [null, "", [], ["a", "b"], "a".repeat(201), "not-json", "e30=", encode({ createdAt: created, id: id(1) }),
    encode([created, id(1), "extra"]), encode(["2026-02-30T10:00:00.123456Z", id(1)]),
    encode(["2026-09-10T10:00:00.123Z", id(1)]), encode([created, "not-a-uuid"]), encode([created, id(1)]) + "="]) {
    assert.throws(() => parseAppSessionCursor(value), (error: AccountAccessError) => error.code === "invalid_cursor");
  }
  assert.equal(parseAppSessionId(id(1)), id(1));
  for (const value of [undefined, 1, [id(1)], id(1) + "' OR true", "  " + id(1)]) {
    assert.throws(() => parseAppSessionId(value), (error: AccountAccessError) => error.status === 400);
  }
});

test("list rejects foreign environment, owner, malformed metadata and pagination overflow", async () => {
  for (const bad of [row(1, { user_id: "other-owner" }), row(1, { environment: "production" }),
    row(1, { id: "bad" }), row(1, { created_at: "bad" }), row(1, { expires_at: "bad" }),
    row(1, { expires_at: "2026-09-01T00:00:00Z" })]) {
    const { service } = fixture({ rows: [bad] });
    await assert.rejects(service.list(account), (error: AccountAccessError) => error.code === "app_sessions_unavailable");
  }
  const { service } = fixture({ rows: Array.from({ length: 27 }, (_, n) => row(n + 1)) });
  await assert.rejects(service.list(account), (error: AccountAccessError) => error.status === 503);
});

test("revoke is owner/environment bound and idempotent without other mutation targets", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.revoke(account, id(5)), { ok: true });
  assert.deepEqual(await f.service.revoke(account, id(5)), { ok: true });
  for (const call of f.calls.filter(call => call.sql.includes("app-sessions:revoke"))) {
    assert.deepEqual(call.params, [id(5), account.id, "preview"]);
    assert.match(call.sql, /UPDATE sajda\.native_sessions n SET revoked_at=COALESCE\(n\.revoked_at,statement_timestamp\(\)\)/u);
    assert.match(call.sql, /n\.id=\$1::uuid AND n\.user_id=\$2 AND n\.environment=\$3/u);
    assert.match(call.sql, /u\.id=\$2 AND u\."emailVerified"=true/u);
    assert.doesNotMatch(call.sql, /DELETE|UPDATE public\.sajda_auth|commerce|saved_domains/u);
  }
});

test("management quota is atomic, saturating, durable, and shared by reads/revokes", async () => {
  const f = fixture();
  for (let n = 0; n < APP_SESSION_MANAGEMENT_LIMIT; n++) {
    if (n % 2) await f.service.list(account);
    else await f.service.revoke(account, id(n + 1));
  }
  const before = f.calls.filter(call => !call.sql.includes("app-sessions:quota")).length;
  await assert.rejects(f.service.list(account), (error: AccountAccessError) => error.status === 429);
  await assert.rejects(f.service.revoke(account, id(1)), (error: AccountAccessError) => error.status === 429);
  assert.equal(f.calls.filter(call => !call.sql.includes("app-sessions:quota")).length, before);
  const quota = f.calls[0];
  assert.deepEqual(quota.params, ["preview", createHash("sha256").update(`app-session-management:${account.id}`).digest("hex"), 20]);
  assert.match(quota.sql, /ON CONFLICT\(namespace,subject_hash,bucket\) DO UPDATE/u);
  assert.match(quota.sql, /THEN 1 ELSE LEAST\(sajda\.developer_api_quotas\.request_count\+1,\$3\+1\) END/u);
  assert.doesNotMatch(quota.sql, /session-owner/u);
});

test("malformed quota or database failure fails closed before listing or revocation", async () => {
  for (const options of [{ count: "oops" }, { count: null }, { count: Infinity }, { failQuota: true }]) {
    const f = fixture(options);
    await assert.rejects(f.service.revoke(account, id(1)));
    assert.ok(f.calls.every(call => call.sql.includes("app-sessions:quota")));
  }
});

test("invalid owner, unverified account, invalid cursor and invalid environment never reach SQL", async () => {
  const f = fixture();
  for (const accountValue of [{ id: "", emailVerified: true }, { id: "x", emailVerified: false }, { id: "x ", emailVerified: true }]) {
    await assert.rejects(f.service.list(accountValue));
    await assert.rejects(f.service.revoke(accountValue, id(1)));
  }
  await assert.rejects(f.service.list(account, ["duplicate"]));
  await assert.rejects(f.service.revoke(account, "invalid-id"));
  const invalid = createNativeSessionsService({ query: f.query, environment: () => "unknown" });
  await assert.rejects(invalid.list(account));
  assert.equal(f.calls.length, 0);
});

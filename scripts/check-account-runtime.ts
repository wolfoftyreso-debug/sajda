/** Explicit QA against the selected preview database. Creates only uniquely named
 * test users, verifies through captured test-mail links, and removes those same
 * fixtures. Never claims inbox delivery. Credentials stay in this process. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAccountAuth, createAccountPool } from "../api/_shared/account-server.js";
import { createAuthHandler } from "../api/auth.js";
import savedDomains from "../api/account/saved-domains.js";

if (process.env.SAJDA_CONFIRM_ACCOUNT_QA !== "1" || process.env.NEON_PROJECT_ID !== "spring-paper-89655503"
  || process.env.VERCEL_ENV === "production") throw new Error("Explicit Sajda preview QA database confirmation required.");
const run = randomUUID();
const emails = [`sajda-qa-${run}-a@example.test`, `sajda-qa-${run}-b@example.test`];
const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
const secret = randomBytes(48).toString("base64url");
const remote = process.env.SAJDA_TEST_ORIGIN;
if (remote && (!process.env.SAJDA_VERCEL_CLI || !/^https:\/\/sajda-[a-z0-9-]+-hypbit\.vercel\.app$/u.test(remote))) throw new Error("Use an explicitly selected Sajda preview deployment.");
const origin = "http://127.0.0.1:8097";
process.env.BETTER_AUTH_URL = origin;
process.env.BETTER_AUTH_SECRET = secret;
delete process.env.VERCEL;
const pool = createAccountPool(process.env.DATABASE_URL!);
const messages: { kind: string; to: string; url: string }[] = [];
const users: string[] = [];
const checks: string[] = [];
const testIp = `192.0.2.${1 + randomBytes(1)[0] % 250}`;
let ipSuffix = 0;
const auth = createAccountAuth({ origin, secret, pool, sendEmail: async message => { messages.push(message); } });
const handler = createAuthHandler(() => ({ handler: async (request: Request) => {
  request.headers.set("x-vercel-forwarded-for", ipSuffix ? `198.51.100.${ipSuffix}` : testIp);
  return auth.handler(request);
} }), () => true);

async function local(path: string, method = "GET", body?: unknown, cookie = "", accountId?: string, requestOrigin = origin) {
  let status = 200;
  let output: unknown;
  const headers = new Headers();
  const response = {
    setHeader(name: string, value: string | string[] | number) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item); else headers.set(name, String(value));
    },
    status(code: number) { status = code; return this; }, json(value: unknown) { output = value; },
    end(value?: string) { output = value; },
  };
  const request = { method, url: path, body, headers: { host: new URL(origin).host, origin: requestOrigin,
    "content-type": "application/json", cookie, "x-sajda-account": accountId }, query: Object.fromEntries(new URL(path, origin).searchParams) };
  if (path.startsWith("/api/auth/")) await handler(request, response);
  else await savedDomains(request, response);
  return new Response(output === undefined ? null : typeof output === "string" ? output : JSON.stringify(output), { status, headers });
}

const execute = promisify(execFile);
async function deployed(path: string, method = "GET", body?: unknown, cookie = "", accountId?: string, requestOrigin = remote!) {
  const args = [process.env.SAJDA_VERCEL_CLI!, "curl", path, "--deployment", remote!, "--", "--silent", "--show-error", "--include", "--max-time", "35", "--request", method,
    "--header", "content-type: application/json", "--header", `origin: ${requestOrigin}`];
  if (cookie) args.push("--header", `cookie: ${cookie}`);
  if (accountId) args.push("--header", `x-sajda-account: ${accountId}`);
  if (body !== undefined) args.push("--data-binary", JSON.stringify(body));
  let raw: string;
  try { raw = (await execute(process.execPath, args, { timeout: 45_000, maxBuffer: 1_000_000, windowsHide: true })).stdout; }
  catch { throw new Error("Preview account request failed; command details intentionally suppressed."); }
  let status = 0;
  let headers = new Headers();
  do {
    const boundary = raw.search(/\r?\n\r?\n/u);
    if (boundary < 0) throw new Error("Missing preview response headers.");
    const lines = raw.slice(0, boundary).split(/\r?\n/u);
    raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]);
    headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0 && !line.slice(0, colon).toLowerCase().includes("bypass")) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
  } while (raw.startsWith("HTTP/"));
  return new Response([204, 304].includes(status) ? null : raw, { status, headers });
}

function cookieOf(response: Response) {
  const cookie = response.headers.getSetCookie().filter(value => /^(?:__Secure-)?sajda\.session_token=/u.test(value));
  assert.equal(cookie.length, 1, "Expected one account session cookie");
  assert.match(cookie[0], /HttpOnly/iu);
  assert.match(cookie[0], /SameSite=Lax/iu);
  assert.doesNotMatch(cookie[0], /Domain=/iu);
  if (remote) assert.match(cookie[0], /Secure/iu);
  return cookie[0].split(";")[0];
}
const expect = async (response: Promise<Response>, status: number, label: string) => {
  const result = await response;
  assert.equal(result.status, status, `${label}: unexpected HTTP status`);
  checks.push(label);
  return result;
};

try {
  assert.equal((await pool.query("SELECT current_schema() AS schema")).rows[0].schema, "public");
  await pool.query("SELECT 1 FROM sajda_auth_user LIMIT 1");
  for (const email of emails) {
    await expect(local("/api/auth/sign-up/email", "POST", { email, password, name: "Sajda isolated QA", callbackURL: `${origin}/auth` }), 200, "signup stores unverified account");
    const row = (await pool.query('SELECT id, "emailVerified" FROM sajda_auth_user WHERE email=$1', [email])).rows[0];
    assert.ok(row && !row.emailVerified);
    users.push(row.id);
    const message = messages.find(item => item.to === email && item.kind === "verify");
    assert.ok(message, "Verification callback must receive an actual signed link");
    const link = new URL(message.url);
    await expect(local(link.pathname + link.search), 302, "signed email verification link");
    assert.equal((await pool.query('SELECT "emailVerified" FROM sajda_auth_user WHERE id=$1', [row.id])).rows[0].emailVerified, true);
  }
  const request = remote ? deployed : local;
  await expect(request("/api/account/saved-domains"), 401, "anonymous saved domains denied");
  const first = await expect(request("/api/auth/sign-in/email", "POST", { email: emails[0], password }), 200, "verified account signs in");
  const cookieA = cookieOf(first);
  assert.equal("token" in await first.json(), false);
  const second = await expect(request("/api/auth/sign-in/email", "POST", { email: emails[1], password }), 200, "second account signs in");
  const cookieB = cookieOf(second);
  const session = await expect(request("/api/auth/get-session", "GET", undefined, cookieA), 200, "session restored from cookie");
  const sessionBody = await session.json();
  assert.equal(sessionBody.user.id, users[0]);
  assert.equal("token" in sessionBody.session, false);
  await expect(request("/api/account/saved-domains", "POST", { domain: "sajda-qa-example.test" }, cookieA, users[0]), 200, "save persists in Postgres");
  await expect(request("/api/account/saved-domains", "POST", { domain: "sajda-qa-example.test" }, cookieA, users[0]), 200, "duplicate save is idempotent");
  const own = await expect(request("/api/account/saved-domains", "GET", undefined, cookieA, users[0]), 200, "saved domains survive refresh");
  assert.equal((await own.json()).items.length, 1);
  const foreign = await expect(request("/api/account/saved-domains", "GET", undefined, cookieB, users[1]), 200, "cross-user read isolated");
  assert.equal((await foreign.json()).items.length, 0);
  await expect(request("/api/account/saved-domains", "POST", { domain: "sajda-qa-example.test" }, cookieA, users[1]), 409, "stale initiating account denied");
  await expect(request("/api/account/saved-domains", "POST", { domain: "sajda-qa-example.test", user_id: users[1] }, cookieA, users[0]), 400, "forged ownership denied");
  await expect(request("/api/account/saved-domains", "DELETE", { domain: "sajda-qa-example.test" }, cookieB, users[1]), 200, "cross-user delete cannot affect owner");
  assert.equal(Number((await pool.query("SELECT count(*) FROM sajda.saved_domains WHERE user_id=$1", [users[0]])).rows[0].count), 1);
  await expect(request("/api/account/saved-domains", "POST", { domain: "sajda-qa-other.test" }, cookieA, users[0], "https://attacker.test"), 403, "cross-origin mutation denied");
  await expect(request("/api/auth/sign-out", "POST", {}, cookieA), 200, "logout revokes session");
  await expect(request("/api/account/saved-domains", "GET", undefined, cookieA, users[0]), 401, "replayed logged-out cookie denied");
  const returning = await expect(request("/api/auth/sign-in/email", "POST", { email: emails[0], password }), 200, "returning user signs in again");
  const returnCookie = cookieOf(returning);
  await expect(request("/api/account/saved-domains", "GET", undefined, returnCookie, users[0]), 200, "saved state retained after relogin");

  // Email is captured only by this CLI factory, never by a public route.
  await expect(local("/api/auth/request-password-reset", "POST", { email: emails[0], redirectTo: `${origin}/auth?mode=update-password` }), 200, "password reset creates one-use link");
  const reset = new URL(messages.findLast(item => item.kind === "reset")!.url);
  const token = reset.pathname.split("/").at(-1);
  await expect(local("/api/auth/reset-password", "POST", { token, newPassword }), 200, "reset changes password");
  await expect(local("/api/auth/reset-password", "POST", { token, newPassword }), 400, "password reset replay denied");
  await expect(request("/api/account/saved-domains", "GET", undefined, returnCookie, users[0]), 401, "password reset revokes all sessions");
  await expect(request("/api/auth/sign-in/email", "POST", { email: emails[0], password }), 401, "old password denied");
  await expect(request("/api/auth/sign-in/email", "POST", { email: emails[0], password: newPassword }), 200, "new password accepted");

  // Separate reserved test-net IP: exercises shared database limiter atomically.
  ipSuffix = 1 + randomBytes(1)[0] % 250;
  const attempts = await Promise.all(Array.from({ length: 7 }, () => local("/api/auth/sign-in/email", "POST", { email: emails[1], password: "incorrect-password-123" })));
  assert.equal(attempts.filter(response => response.status === 429).length, 2);
  assert.ok(attempts.filter(response => response.status === 429).every(response => Number(response.headers.get("retry-after")) > 0));
  checks.push("concurrent login rate limit enforced in Postgres");
  console.log(JSON.stringify({ environment: remote ? "Vercel preview + real Postgres" : "local handlers + real Postgres", checksPassed: checks.length, checks,
    email: "Signed verification/reset links captured in CLI memory. No inbox delivery claimed." }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ accountQa: "FAILED", completedChecks: checks,
    error: error instanceof assert.AssertionError ? error.message : "Account flow failed; credentials and provider payloads withheld." }));
  process.exitCode = 1;
} finally {
  // Only fixtures named by this invocation; no broad user/domain deletion.
  const owned = (await pool.query("SELECT id FROM sajda_auth_user WHERE email = ANY($1::text[])", [emails])).rows.map(row => String(row.id));
  if (owned.length) {
    await pool.query("DELETE FROM sajda.saved_domains WHERE user_id = ANY($1::text[])", [owned]);
    await pool.query("DELETE FROM sajda.function_rate_limits WHERE scope='saved-domains' AND subject_hash = ANY($1::text[])", [owned.map(id => createHash("sha256").update(`saved-domains:${id}`).digest("hex"))]);
    await pool.query("DELETE FROM sajda_auth_verification WHERE value = ANY($1::text[]) OR identifier = ANY($2::text[])", [owned, emails]);
    await pool.query("DELETE FROM sajda_auth_user WHERE id = ANY($1::text[]) AND email = ANY($2::text[])", [owned, emails]);
  }
  const authPaths = ["/sign-in/email", "/sign-up/email", "/verify-email", "/get-session", "/sign-out", "/request-password-reset", "/reset-password"];
  await pool.query("DELETE FROM sajda_auth_rate_limit WHERE key = ANY($1::text[])", [[testIp, ...(ipSuffix ? [`198.51.100.${ipSuffix}`] : [])].flatMap(ip => authPaths.map(path => `${ip}|${path}`))]);
  await pool.end();
  console.log(JSON.stringify({ qaFixturesRemoved: owned.length, existingUsersModified: 0 }));
}

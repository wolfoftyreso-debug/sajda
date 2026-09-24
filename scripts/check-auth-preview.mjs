/** Read-only Sajda preview checks. No account, recovery email or payment is created. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select a Sajda preview and Vercel CLI explicitly.");
const execute = promisify(execFile);
async function request(path) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  let raw;
  try {
    raw = (await execute(process.execPath, [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include", "--max-time", "40"],
      { windowsHide: true, timeout: 60000, maxBuffer: 5000000, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout;
  } catch (error) { throw new Error(`Read-only auth preview check failed (code ${String(error.code ?? "unknown")}).`); }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u); assert.ok(boundary >= 0, "Missing HTTP headers");
    const lines = raw.slice(0, boundary).split(/\r?\n/u); raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]); headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
  } while (raw.startsWith("HTTP/"));
  assert.equal(status, 200, path);
  console.log(JSON.stringify({ path, status }));
  return { body: raw, headers };
}
const page = await request("/auth?next=%2Fdevelopers%23access");
assert.match(page.headers.get("content-type") ?? "", /text\/html/u);
assert.match(page.headers.get("x-robots-tag") ?? "", /noindex/u);
for (const mode of ["signup", "reset", "update-password"]) await request(`/auth?mode=${mode}&next=%2Fdevelopers%23access`);
for (const name of ["sajda-logo", "sajda-mark"]) {
  const asset = await request(`/${name}.svg`);
  assert.match(asset.headers.get("content-type") ?? "", /image\/svg\+xml/u);
  assert.match(asset.body, /<svg\s/u);
}
const entry = page.body.match(/<script\b[^>]*src="(\/assets\/index-[\w-]+\.js)"/u)?.[1];
assert.ok(entry, "Deployed entry module");
const bundle = await request(entry);
const authModule = bundle.body.match(/(?:assets\/)?(Auth-[\w-]+\.js)/u)?.[1];
const authStyles = bundle.body.match(/(?:assets\/)?(Auth-[\w-]+\.css)/u)?.[1];
assert.ok(authModule, "Lazy-loaded auth module"); assert.ok(authStyles, "Scoped auth CSS");
const auth = await request(`/assets/${authModule}`);
assert.match(auth.body, /sajda-auth-logo/u);
assert.match(auth.body, /sajda-logo\.svg/u);
assert.match(auth.body, /data-auth-password-toggle/u);
assert.match(auth.body, /\/legal#privacy/u);
const css = await request(`/assets/${authStyles}`);
assert.match(css.body, /sajda-auth-brand/u);
assert.match(css.body, /52px/u);
const session = await request("/api/auth/get-session");
assert.equal(JSON.parse(session.body), null, "Unauthenticated session must not return an account");
console.log(JSON.stringify({ verdict: "PASS", origin, branded_assets: true, auth_routes: true, anonymous_session: true,
  account_mutations: false, email_sent: false, browser_flow_test: false }));

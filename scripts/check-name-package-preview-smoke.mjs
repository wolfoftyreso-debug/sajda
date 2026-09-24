/** Read-only HTTP checks of an explicitly selected, protected Sajda preview.
 * Does not sign in as an application user or consume any social/provider quota. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select the Sajda preview and CLI explicitly.");
const execute = promisify(execFile);
async function read(path, method = "GET") {
  let raw;
  try {
    raw = (await execute(process.execPath, [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include", "--max-time", "40", "--request", method],
      { windowsHide: true, timeout: 60000, maxBuffer: 2000000, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout;
  } catch { throw new Error(`Preview request failed: ${method} ${path}`); }
  let status, headers;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u);
    assert.ok(boundary >= 0, `Missing headers: ${path}`);
    const lines = raw.slice(0, boundary).split(/\r?\n/u);
    raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]);
    headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
  } while (raw.startsWith("HTTP/"));
  return { path, method, status, headers, body: raw };
}

const checks = await Promise.all([read("/name-packages"), read("/api/account/name-package-social"), read("/api/account/name-package-social", "POST")]);
for (const [index, result] of checks.entries()) {
  assert.equal(result.status, [200, 405, 401][index], `${result.method} ${result.path}`);
  assert.match(result.headers.get("x-robots-tag") ?? "", /noindex/u);
  assert.match(result.headers.get("cache-control") ?? "", /no-store/u);
}
assert.match(checks[0].headers.get("content-type") ?? "", /text\/html/u);
const entry = checks[0].body.match(/<script[^>]+src="(\/assets\/index-[^"]+\.js)"/u)?.[1];
assert.ok(entry, "The app route must serve the current Vite entry");
const bundle = await read(entry);
assert.equal(bundle.status, 200);
const packageChunk = bundle.body.match(/(?:\.\/|assets\/)(NamePackages-[a-zA-Z0-9_-]+\.js)/u)?.[1];
assert.ok(packageChunk, "The deployed app must actually link its name-package page");
const page = await read(`/assets/${packageChunk}`);
assert.equal(page.status, 200);
assert.match(page.body, /package-results-title/u);
assert.match(page.body, /data-package-result-summary/u);
console.log(JSON.stringify({ event: "name_package_preview_http_verified", origin,
  checks: checks.map(({ path, method, status }) => ({ path, method, status })), packageChunk,
  authenticatedAppSession: false, providerCalls: 0, databaseMutations: 0 }));

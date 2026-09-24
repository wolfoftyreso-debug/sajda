/** Read-only checks of an explicitly selected protected Vercel preview. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN;
const cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select the Sajda preview URL and Vercel CLI explicitly.");
const execute = promisify(execFile);
async function read(path) {
  let raw;
  try { raw = (await execute(process.execPath, [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include", "--max-time", "35"], { windowsHide: true, timeout: 45000, maxBuffer: 2000000, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout; }
  catch { throw new Error(`Preview request failed: ${path}`); }
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
  return { path, status, headers, body: raw };
}
const results = await Promise.all(["/", "/pricing", "/projects", "/api/account/name-projects", "/api/native/account", "/missing-project-preview-smoke"].map(read));
for (const result of results) {
  // The native proxy is POST-only; a GET must fail at its method boundary.
  const expected = result.path === "/api/native/account" ? 405 : result.path.startsWith("/api/") ? 401 : result.path.startsWith("/missing-") ? 404 : 200;
  assert.equal(result.status, expected, result.path);
  if (expected === 200) {
    assert.match(result.headers.get("content-type") ?? "", /text\/html/u);
    assert.match(result.body, /id="root"/u);
    assert.match(result.headers.get("x-robots-tag") ?? "", /noindex/u);
  }
  if (result.path === "/projects" || result.path === "/api/account/name-projects") assert.match(result.headers.get("cache-control") ?? "", /no-store/u);
}
console.log(JSON.stringify({ event: "project_preview_http_smoke_verified", origin, checks: results.map(({ path, status }) => ({ path, status })), mutations: 0, authenticatedBrowser: false }));

/** Read-only deployed artifact checks; layout geometry is tested separately in the browser harness. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const origin = process.env.SAJDA_TEST_ORIGIN, cli = process.env.SAJDA_VERCEL_CLI;
if (!cli || !/^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u.test(origin ?? "")) throw new Error("Select a Sajda preview and Vercel CLI explicitly.");
const execute = promisify(execFile);
let checks = 0;
async function read(path) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  let raw;
  try {
    raw = (await execute(process.execPath, [cli, "curl", path, "--deployment", origin, "--", "--silent", "--show-error", "--include", "--max-time", "40"],
      { windowsHide: true, timeout: 60000, maxBuffer: 5000000, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } })).stdout;
  } catch { throw new Error(`Read-only responsive preview check failed: ${path}`); }
  let status;
  do {
    const boundary = raw.search(/\r?\n\r?\n/u); assert.ok(boundary >= 0, "Missing HTTP headers");
    status = Number(raw.slice(0, boundary).match(/^HTTP\/\S+ (\d{3})/u)?.[1]);
    raw = raw.slice(boundary).replace(/^\r?\n\r?\n/u, "");
  } while (raw.startsWith("HTTP/"));
  assert.equal(status, 200, path);
  checks++; console.log(JSON.stringify({ path, status }));
  return raw;
}

const home = await read("/");
for (const route of ["/auth", "/swipe", "/developers", "/how-it-works", "/plus"]) {
  const page = await read(route); assert.match(page, /<div id="root"/u, "Actual app document, not a login/challenge page");
}
const entryPath = home.match(/<script\b[^>]*src="(\/assets\/index-[\w-]+\.js)"/u)?.[1];
const stylesheet = home.match(/href="(\/assets\/index-[\w-]+\.css)"/u)?.[1];
assert.ok(entryPath); assert.ok(stylesheet);
const entry = await read(entryPath);
const css = await read(stylesheet);
assert.ok(css.includes("sajda-search-title") && css.includes("clamp("), "Fluid search headline CSS is deployed");
const module = async name => {
  assert.match(name, /^[A-Za-z]+$/u);
  const filename = entry.match(new RegExp(`(?:assets/)?(${name}-[\\w-]+\\.js)`, "u"))?.[1];
  assert.ok(filename, `${name} lazy module exists`);
  return read(`/assets/${filename}`);
};
const index = await module("Index");
assert.ok(index.includes("sajda-search-title") && index.includes("xl:grid-cols-[auto_auto_minmax(0,1fr)]"), "Responsive search navigation is deployed");
const swipe = await module("Swipe");
assert.ok(swipe.includes("flex shrink-0 flex-wrap") && swipe.includes("h-11 w-11 shrink-0"), "Swipe controls wrap without shrinking");
assert.ok(swipe.includes("max-h-none") && swipe.includes("overscroll-contain"), "Full-height scrollable wishlist is deployed");
const developers = await module("Developers");
assert.ok(developers.includes("min-h-11 w-full whitespace-normal"), "Translated developer CTA can wrap");
const how = await module("HowItWorks");
assert.ok(how.includes("min-h-11 w-full whitespace-normal"), "Translated documentation CTA can wrap");
const authFile = entry.match(/(?:assets\/)?(Auth-[\w-]+\.css)/u)?.[1];
assert.ok(authFile);
const authCss = await read(`/assets/${authFile}`);
assert.ok(authCss.includes("1023px") && authCss.includes("560px"), "Tablet account layout is deployed");
console.log(JSON.stringify({ verdict: "PASS", origin, checks, deployedResponsiveArtifacts: true,
  browserGeometryTest: false, accountMutations: false, providerCalls: false }));

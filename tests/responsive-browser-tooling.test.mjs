import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Source guards protect the fixture boundary; they are not browser or provider
// verification and do not replace the separately executed local UI checks.
const harness = await readFile(new URL("../scripts/check-responsive-browser.mjs", import.meta.url), "utf8");
const fixture = await readFile(new URL("./fixtures/responsive.vite.ts", import.meta.url), "utf8");
test("responsive interaction mode fulfills only the allowlisted same-loopback public lookup", () => {
  assert.match(harness, /interactions && url\.origin === origin && url\.pathname === "\/api\/v1\/public\/brand-lookup" && request\.method\(\) === "POST"/u);
  assert.match(harness, /url\.origin !== origin \|\| url\.pathname\.startsWith\("\/api\/"\) \|\| request\.method\(\) !== "GET"/u);
  assert.match(harness, /route\.abort\("blockedbyclient"\)/u);
  assert.match(harness, /syntheticFixturesOnly: true/u);
});
test("responsive fixture stays serve-only, loopback-only and denies real APIs and dotenv configuration", () => {
  assert.match(fixture, /config\.command !== "serve"/u); assert.match(fixture, /config\.server\.host !== "127\.0\.0\.1"/u);
  assert.match(fixture, /config\.server\.port !== 8195/u); assert.match(fixture, /envDir: false/u);
  assert.match(fixture, /response\.statusCode = 403/u); assert.match(fixture, /builds and deployment are prohibited/u);
  assert.match(fixture, /response\.end\(renderConnectorHub\(/u);
  assert.doesNotMatch(fixture, /buildConnectorKit|build-public-connector|STRIPE_SECRET_KEY|RESEND_API_KEY|DATABASE_URL/u);
});

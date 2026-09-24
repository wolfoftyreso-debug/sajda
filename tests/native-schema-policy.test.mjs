import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function probe(policy) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    let evalAttempts = 0;
    globalThis.Function = function () { evalAttempts++; throw new EvalError("Native CSP forbids eval"); };
    ${policy ? 'await import("./src/app/nativeSchemaPolicy.ts");' : ""}
    const { z } = await import("zod/v4");
    const schema = z.object({ name: z.string().min(1), count: z.number().int().positive() });
    assert.deepEqual(schema.parse({ name: "Sajda", count: 10 }), { name: "Sajda", count: 10 });
    assert.equal(schema.safeParse({ name: "", count: -1 }).success, false);
    console.log(JSON.stringify({ evalAttempts }));
  `], { encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("native Zod policy prevents the real eval capability probe without weakening validation", () => {
  assert.ok(probe(false).evalAttempts > 0, "Default schema setup reproduces the CSP violation observed in WebKit");
  assert.equal(probe(true).evalAttempts, 0);
});

test("native schema policy executes before application imports and CSP still forbids eval", () => {
  const entry = readFileSync(new URL("../src/main.native.tsx", import.meta.url), "utf8");
  assert.match(entry, /^import "\.\/app\/nativeSchemaPolicy";/u);
  const html = readFileSync(new URL("../native.html", import.meta.url), "utf8");
  assert.match(html, /script-src 'self';/u);
  assert.doesNotMatch(html, /unsafe-eval/u);
});

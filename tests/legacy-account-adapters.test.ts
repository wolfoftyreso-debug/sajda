import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

test("historical registrar and portfolio adapters fail closed without provider calls or invented values", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Unexpected external request"); });
  t.mock.method(console, "error", () => undefined);
  const vite = await createServer({
    configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const portfolio = await vite.ssrLoadModule("/src/lib/userDomainsService.ts");
    const registrars = await vite.ssrLoadModule("/src/lib/registrarService.ts");
    await assert.rejects(portfolio.getUserDomains(), /not available/u);
    await assert.rejects(portfolio.valuateDomains([]), /not available/u);
    await assert.rejects(portfolio.valuateDomains([{ domain: "example.com", purchase_price: 0 }]), /not available/u);
    await assert.rejects(registrars.getRegistrarSettings(), /not available/u);
    assert.equal(calls, 0);
  } finally {
    await vite.close();
  }
});

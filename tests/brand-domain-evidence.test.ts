import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import type { PackageDomainInput } from "../shared/name-packages";

test("brand domain evidence is bounded, dated and never an ownership score", async () => {
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "no-provider-request", enforce: "pre", load(id) { if (id.replaceAll("\\", "/").endsWith("/src/lib/localTestSearch.ts")) return "export async function runAnonymousSearch(){throw new Error('No external request in pure evidence tests');}"; } }],
  });
  try {
    const { buildBrandDomainCheckPlan: plan, projectBrandDomainEvidence: project } = await vite.ssrLoadModule("/src/lib/brandDomainEvidence.ts") as typeof import("../src/lib/brandDomainEvidence");
    const now = Date.parse("2026-10-07T12:00:00.000Z"), domains = ["examplebrand.com", "examplebrand.net", "examplebrand.co.uk"];
    assert.deepEqual(plan(domains), { supported: domains.slice(0, 2), unsupported: [domains[2]], batches: [domains.slice(0, 2)] });
    assert.deepEqual(plan(Array.from({ length: 20 }, (_, i) => `example${i}.com`)).batches.map(batch => batch.length), [10, 10]);
    assert.throws(() => plan([])); assert.throws(() => plan(["test.com", "test.com"])); assert.throws(() => plan(Array(21).fill("test.com")));
    const row: PackageDomainInput = { domain: domains[0], status: "taken", availabilityVerified: true, checkMethod: "rdap", source: "verisign-rdap", checkedAt: new Date(now).toISOString() };
    const result = project(domains, [row], now);
    assert.equal(result.summary.checked, 1); assert.equal(result.summary.unknown, 2); assert.equal(result.summary.total, 3);
    assert.equal(result.entries[0].statement, "domain_registered"); assert.equal(result.entries[0].source_url, "https://rdap.verisign.com/com/v1/domain/examplebrand.com");
    assert.equal(result.ownership_verified, false); assert.equal(result.legal_clearance, false); assert.equal(result.continuous_monitoring, false);
    for (const overrides of [{ checkedAt: null }, { checkedAt: "not-a-time" }, { checkedAt: new Date(now + 1).toISOString() },
      { checkedAt: new Date(now - 30 * 60_000 - 1).toISOString() }, { source: "https://untrusted.example/" }, { checkMethod: "dns" },
      { status: "unknown" as const }, { availabilityVerified: false }]) {
      const unverified = project(domains, [{ ...row, ...overrides }], now);
      assert.equal(unverified.summary.checked, 0, JSON.stringify(overrides)); assert.equal(unverified.summary.unknown, 3);
    }
    assert.equal(project(domains, [row], now + 30 * 60_000 + 1).entries[0].observed_at, row.checkedAt);
    assert.throws(() => project(domains, [{ ...row, domain: "other.com" }], now)); assert.throws(() => project(domains, [row, row], now));
  } finally { await vite.close(); }
});

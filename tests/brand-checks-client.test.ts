import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { brandRegistrySourceUrl } from "../shared/brand-evidence";
import { BRAND_CHECK_METHODOLOGY_VERSION, type BrandCheckRun, type BrandChecksStartInput } from "../shared/brand-checks";

const reportId = "abcdaaaa-0000-4000-8000-000000000001", requestKey = "abcdaaaa-0000-4000-8000-000000000002", requestId = "req_0123456789abcdef", owner = "account-a", at = "2026-10-07T12:00:00.000Z";
const input: BrandChecksStartInput = { reportId, expectedVersion: 1, requestKey };
function run(): BrandCheckRun { return { id: requestKey, reportId, reportVersion: 1, status: "completed", requestedAt: at, completedAt: at, methodologyVersion: BRAND_CHECK_METHODOLOGY_VERSION, failureCode: null, entries: [{ id: "check:domain:example.com", target: "example.com", kind: "domain", origin: "provider_observation", state: "checked", freshness: "current", statement: "domain_registered", source_url: brandRegistrySourceUrl("example.com", "verisign-rdap"), observed_at: at }] }; }

test("saved-check client validates scoped history and exact immutable mutation receipts", async t => {
  const key = "__BRAND_CHECK_CLIENT__";
  type Request = { accountId: string; method?: string; body?: BrandChecksStartInput; signal?: AbortSignal };
  const requests: { path: string; options: Request }[] = [];
  const fixture = { owner, verified: true, expires: Date.now() / 1000 + 3600, reply: async (_path: string, _request: Request): Promise<unknown> => ({ accountId: owner, requestId, run: run() }),
    request: async (path: string, options: Request) => { requests.push({ path, options }); return fixture.reply(path, options); }, session: async () => ({ user: { id: fixture.owner, email_verified: fixture.verified }, expires_at: fixture.expires }) };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: "check-account-boundary", enforce: "pre", load(id) {
    if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);export const readAccountSession=()=>globalThis.${key}.session();`;
  } }] });
  try {
    const client = await vite.ssrLoadModule("/src/lib/brandChecksClient.ts");
    const code = (expected: string) => (error: { code?: string }) => { assert.equal(error.code, expected); return true; };
    const reset = () => { requests.length = 0; fixture.owner = owner; fixture.verified = true; fixture.expires = Date.now() / 1000 + 3600; fixture.reply = async () => ({ accountId: owner, requestId, run: run() }); };
    await t.test("invalid claims, selectors and cancellation cannot reach transport", async () => {
      reset(); for (const raw of [{ ...input, entries: run().entries }, { ...input, expectedVersion: 0 }, { ...input, reportId: "bad" }]) await assert.rejects(client.startBrandCheck({ accountId: owner }, raw), code("invalid"));
      for (const selector of [undefined, { reportId, offset: 100 }, { reportId, limit: 21 }, { reportId, version: 0 }]) await assert.rejects(client.getBrandChecks({ accountId: owner }, selector), code("invalid"));
      const controller = new AbortController(); controller.abort(); await assert.rejects(client.startBrandCheck({ accountId: owner, signal: controller.signal }, input)); assert.equal(requests.length, 0);
    });
    await t.test("history GET is version-scoped, bounded and never sends a start payload", async () => {
      reset(); fixture.reply = async () => ({ accountId: owner, requestId, runs: [run()], total: 1, offset: 0, limit: 20, hasMore: false });
      const value = await client.getBrandChecks({ accountId: owner }, { reportId, version: 1, offset: 0, limit: 20 });
      assert.equal(value.runs[0].entries[0].observed_at, at); assert.equal(requests[0].path, `/api/account/brand-checks?reportId=${reportId}&version=1&offset=0&limit=20`);
      assert.equal(requests[0].options.method, undefined); assert.equal(requests[0].options.body, undefined);
      for (const reply of [{ accountId: "account-b", requestId, runs: [], total: 0, offset: 0, limit: 20, hasMore: false }, { accountId: owner, requestId, runs: [{ ...run(), reportVersion: 2 }], total: 1, offset: 0, limit: 20, hasMore: false }, { accountId: owner, requestId, runs: [run()], total: 2, offset: 0, limit: 20, hasMore: false }]) {
        fixture.reply = async () => reply; await assert.rejects(client.getBrandChecks({ accountId: owner }, { reportId, version: 1, offset: 0, limit: 20 }), code(reply.accountId !== owner ? "account_changed" : "invalid_response"));
      }
    });
    await t.test("start payload is cloned before IO and mismatched or fabricated receipts stay uncertain", async () => {
      reset(); let finish!: (value: unknown) => void; fixture.reply = async () => new Promise(resolve => { finish = resolve; });
      const raw = { ...input }, scope = { accountId: owner }; const pending = client.startBrandCheck(scope, raw); raw.requestKey = reportId; scope.accountId = "account-b";
      assert.deepEqual(requests[0].options.body, input); finish({ accountId: owner, requestId, run: run() }); assert.equal((await pending).run.id, requestKey);
      for (const value of [{ ...run(), reportVersion: 2 }, { ...run(), id: reportId }, { ...run(), entries: [{ ...run().entries[0], source_url: "https://example.com/claimed" }] }]) {
        fixture.reply = async () => ({ accountId: owner, requestId, run: value }); let error: unknown; try { await client.startBrandCheck({ accountId: owner }, input); } catch (caught) { error = caught; }
        assert.equal((error as { code: string }).code, "invalid_response"); assert.equal(client.brandCheckFailureIsUncertain(error), true);
      }
    });
    await t.test("late session replacement and failed verification cannot confirm another account’s check", async () => {
      reset(); fixture.owner = "account-b"; await assert.rejects(client.startBrandCheck({ accountId: owner }, input), code("account_changed"));
      reset(); fixture.verified = false; let error: unknown; try { await client.startBrandCheck({ accountId: owner }, input); } catch (caught) { error = caught; }
      assert.equal((error as { code: string }).code, "verification_required"); assert.equal(client.brandCheckFailureIsUncertain(error), true);
      reset(); fixture.expires = 1; await assert.rejects(client.startBrandCheck({ accountId: owner }, input), code("unauthenticated"));
    });
    await t.test("known admission rejections stay distinct from provider timeout with the same retry key", async () => {
      reset(); fixture.reply = async () => { throw { status: 503, code: "brand_checks_unavailable", message: "secret provider log" }; };
      let failure: unknown; try { await client.startBrandCheck({ accountId: owner }, input); } catch (error) { failure = error; }
      assert.equal(client.brandCheckFailureIsUncertain(failure), true); assert.equal(String(failure).includes("secret"), false);
      fixture.reply = async () => ({ accountId: owner, requestId, run: run() }); await client.startBrandCheck({ accountId: owner }, input); assert.deepEqual(requests[0].options.body, requests[1].options.body);
      for (const [detail, expected] of [[{ status: 403 }, "verification_required"], [{ status: 404, code: "report_not_found" }, "not_found"], [{ status: 404 }, "disabled"], [{ status: 409, code: "report_conflict" }, "conflict"], [{ status: 409, code: "check_pending" }, "pending"], [{ status: 409, code: "check_limit_reached" }, "limit"], [{ status: 429, code: "check_daily_limit" }, "daily_limit"]] as const) {
        fixture.reply = async () => { throw detail; }; let error: unknown; try { await client.startBrandCheck({ accountId: owner }, input); } catch (caught) { error = caught; }
        assert.equal((error as { code: string }).code, expected); assert.equal(client.brandCheckFailureIsUncertain(error), false);
      }
    });
  } finally { await vite.close(); Reflect.deleteProperty(globalThis, key); }
});

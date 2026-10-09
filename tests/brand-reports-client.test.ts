import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { assessBrandPresence, buildBrandIndexTargets, type BrandIndexInput } from "../shared/brand-presence-index";
import { BRAND_REPORT_MAX_BYTES, brandReportSaveSchema, type BrandReportSaveInput, type BrandReportSnapshot } from "../shared/brand-reports";
import { SOCIAL_PLATFORMS } from "../shared/name-packages";
import { NAME_PACKAGE_MARKET_CODES } from "../shared/name-package-markets";

const accountId = "account-a", requestId = "req_0123456789abcdef", at = "2026-09-01T12:00:00.000Z";
const assessment: BrandIndexInput = { brand_name: "Example Brand", identity_label: "examplebrand", primary_domain: "examplebrand.com", domains: ["examplebrand.com"], socials: [{ platform: "github", handle: "examplebrand" }], markets: ["US"], observations: [{ target_id: "domain:examplebrand.com", status: "reported_owned", source_url: "https://example.com/evidence", reported_at: at }] };
function input(): BrandReportSaveInput { return { id: "abcdaaaa-0000-4000-8000-000000000001", requestKey: "abcdaaaa-0000-4000-8000-000000000002", expectedVersion: 0, title: "Example Brand", assessment: structuredClone(assessment) }; }
function report(raw = input(), now = Date.parse(at)): BrandReportSnapshot { return { id: raw.id, title: raw.title, version: raw.expectedVersion + 1, savedAt: at, assessment: raw.assessment, result: assessBrandPresence(raw.assessment, now) }; }

test("brand report client fences owners, exact receipts, original dates and uncertain retries", async t => {
  const key = "__BRAND_REPORTS_CLIENT_TEST__";
  type Request = { accountId: string; signal?: AbortSignal; body?: { report: BrandReportSaveInput }; method?: string };
  const requests: { path: string; options: Request }[] = [];
  const fixture = { owner: accountId, verified: true, expires: Date.now() / 1000 + 3600,
    reply: async (_path: string, _options: Request): Promise<unknown> => ({ accountId, requestId, reports: [] }),
    request: async (path: string, options: Request) => { requests.push({ path, options }); return fixture.reply(path, options); },
    session: async () => ({ user: { id: fixture.owner, email_verified: fixture.verified }, expires_at: fixture.expires }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: "brand-report-account-boundary", enforce: "pre", load(id) {
    if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);export const readAccountSession=()=>globalThis.${key}.session();`;
  } }] });
  try {
    const client = await vite.ssrLoadModule("/src/lib/brandReportsClient.ts");
    const code = (expected: string) => (error: { code?: string }) => { assert.equal(error.code, expected); return true; };
    const reset = () => { requests.length = 0; fixture.owner = accountId; fixture.verified = true; fixture.expires = Date.now() / 1000 + 3600; fixture.reply = async () => ({ accountId, requestId, reports: [] }); };
    await t.test("strict invalid selectors and oversized bodies never reach the transport", async () => {
      reset(); await assert.rejects(client.getBrandReport({ accountId }, { id: "bad" }), code("invalid"));
      await assert.rejects(client.saveBrandReport({ accountId }, { ...input(), verified: true }), code("invalid"));
      await assert.rejects(client.saveBrandReport({ accountId }, { ...input(), assessment: { ...assessment, observations: [{ ...assessment.observations[0], verified_at: at }] } }), code("invalid"));
      const largeAssessment: BrandIndexInput = { ...assessment, domains: [assessment.primary_domain, ...Array.from({ length: 19 }, (_, index) => `example${index}.com`)],
        socials: SOCIAL_PLATFORMS.map(platform => ({ platform, handle: assessment.identity_label })), markets: [...NAME_PACKAGE_MARKET_CODES], observations: [] };
      largeAssessment.observations = buildBrandIndexTargets(largeAssessment).map(target => ({ target_id: target.id, status: "reported_owned", reported_at: at, source_url: "https://example.com/" + "界".repeat(492) }));
      const large = { ...input(), assessment: largeAssessment }; assert.equal(brandReportSaveSchema.safeParse(large).success, true);
      assert.ok(new TextEncoder().encode(JSON.stringify({ report: large })).byteLength > BRAND_REPORT_MAX_BYTES);
      await assert.rejects(client.saveBrandReport({ accountId }, large), code("invalid"));
      const controller = new AbortController(); controller.abort(); await assert.rejects(client.getBrandReports({ accountId, signal: controller.signal }));
      await assert.rejects(client.getBrandReports({ accountId: "" }), code("unauthenticated")); assert.equal(requests.length, 0);
    });
    await t.test("read selectors are explicit and cannot show a different account or version", async () => {
      reset(); fixture.reply = async () => ({ accountId, requestId, report: report() });
      assert.equal((await client.getBrandReport({ accountId }, { id: input().id, version: 1 })).report.version, 1);
      assert.equal(requests[0].path, `/api/account/brand-reports?id=${input().id}&version=1`);
      await assert.rejects(client.getBrandReport({ accountId }, { id: input().id, version: 2 }), code("invalid_response"));
      fixture.reply = async () => ({ accountId: "account-b", requestId, report: report() }); await assert.rejects(client.getBrandReport({ accountId }, { id: input().id }), code("account_changed"));
      fixture.reply = async () => ({ accountId, requestId, versions: [{ id: input().id, title: input().title, version: 1, savedAt: at }] });
      assert.equal((await client.getBrandReportHistory({ accountId }, input().id)).versions.length, 1);
      assert.equal(requests.at(-1)!.path, `/api/account/brand-reports?id=${input().id}&history=true`);
      fixture.reply = async () => ({ accountId, requestId, versions: [{ id: input().id, title: input().title, version: 1, savedAt: at }, { id: input().id, title: input().title, version: 1, savedAt: at }] });
      await assert.rejects(client.getBrandReportHistory({ accountId }, input().id), code("invalid_response"));
    });
    await t.test("payload and owner are cloned before IO; late responses cannot cross a changed or expired session", async () => {
      reset(); let finish!: (value: unknown) => void; fixture.reply = async () => new Promise(resolve => { finish = resolve; });
      const raw = input(), scope = { accountId }; const pending = client.saveBrandReport(scope, raw);
      raw.assessment.observations[0].reported_at = "2030-01-01T00:00:00.000Z"; raw.title = "Changed"; scope.accountId = "account-b";
      assert.equal(requests[0].options.body!.report.title, input().title); assert.equal(requests[0].options.body!.report.assessment.observations[0].reported_at, at);
      fixture.owner = "account-b"; finish({ accountId, requestId, report: report(requests[0].options.body!.report) }); await assert.rejects(pending, code("account_changed"));
      reset(); fixture.reply = async () => ({ accountId, requestId, reports: [] }); fixture.expires = 1; await assert.rejects(client.getBrandReports({ accountId }), code("unauthenticated"));
      reset(); fixture.verified = false; await assert.rejects(client.getBrandReports({ accountId }), code("verification_required"));
      fixture.reply = async () => ({ accountId, requestId, report: report() });
      let failed: unknown; try { await client.saveBrandReport({ accountId }, input()); } catch (error) { failed = error; }
      assert.equal((failed as { code: string }).code, "verification_required");
      assert.equal(client.brandReportSaveFailureIsUncertain(failed), true, "A successful write followed by failed session verification keeps the request key");
    });
    await t.test("exact receipts cannot silently change declarations, timestamps, report or version", async () => {
      reset();
      for (const value of [{ ...report(), title: "Different" }, { ...report(), version: 2 }, { ...report(), id: "abcdaaaa-0000-4000-8000-000000000003" }, report({ ...input(), assessment: { ...assessment, observations: [{ ...assessment.observations[0], reported_at: "2026-09-02T12:00:00.000Z" }] } })]) {
        fixture.reply = async () => ({ accountId, requestId, report: value }); await assert.rejects(client.saveBrandReport({ accountId }, input()), code("invalid_response"));
      }
      const stale = report(input(), Date.parse(at) + 40 * 86_400_000); fixture.reply = async () => ({ accountId, requestId, report: stale });
      const value = await client.saveBrandReport({ accountId }, input()); assert.equal(value.report.assessment.observations[0].reported_at, at);
      assert.equal(value.report.result.counts.stale, 1); assert.equal(value.report.result.index.verified_score, null);
    });
    await t.test("uncertain failures retry the same request while known rejection codes remain editable", async () => {
      reset(); const raw = input(); fixture.reply = async () => { throw { status: 503, message: "private provider details" }; };
      let uncertain: unknown; try { await client.saveBrandReport({ accountId }, raw); } catch (error) { uncertain = error; }
      assert.equal(client.brandReportSaveFailureIsUncertain(uncertain), true); assert.equal(String(uncertain).includes("private"), false);
      fixture.reply = async (_path, options) => ({ accountId, requestId, report: report(options.body!.report) }); await client.saveBrandReport({ accountId }, raw);
      assert.deepEqual(requests[0].options.body, requests[1].options.body);
      for (const [detail, expected] of [[{ status: 403 }, "verification_required"], [{ status: 404, code: "report_not_found" }, "not_found"], [{ status: 404 }, "disabled"], [{ status: 409, code: "report_conflict" }, "conflict"], [{ status: 409, code: "report_request_conflict" }, "request_conflict"], [{ status: 409, code: "report_limit" }, "limit"], [{ status: 409, code: "report_version_limit" }, "version_limit"], [{ status: 429 }, "rate_limited"], [{ status: 413 }, "invalid"]] as const) {
        fixture.reply = async () => { throw detail; }; let failed: unknown; try { await client.saveBrandReport({ accountId }, raw); } catch (error) { failed = error; }
        assert.equal((failed as { code: string }).code, expected); assert.equal(client.brandReportSaveFailureIsUncertain(failed), false);
      }
    });
  } finally { await vite.close(); Reflect.deleteProperty(globalThis, key); }
});

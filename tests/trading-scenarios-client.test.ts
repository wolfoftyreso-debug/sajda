import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { tradingScenarioInputSchema, type TradingScenarioInput } from "../shared/trading-scenarios";

const requestId = "req_0123456789abcdef";
const input = (): TradingScenarioInput => tradingScenarioInputSchema.parse({
  id: "abcdaaaa-0000-4000-8000-000000000001", expectedVersion: 0, domain: "example.com", title: "Private thesis",
  thesis: "Private reasoning", catalyst: "", invalidation: "", reviewOn: "2030-01-31", stance: "neutral", analysisMode: "balanced",
  assumptions: { acquisitionUsd: 100, annualRenewalUsd: 20, otherCostsUsd: 0, holdingMonths: 12,
    sellingFeePercent: 15, saleProbabilityPercent: 50, bearSaleUsd: 0, baseSaleUsd: 200, bullSaleUsd: 500 },
}) as TradingScenarioInput;
function saved(value = input()) {
  const { expectedVersion, ...row } = value;
  return { ...row, version: expectedVersion + 1, createdAt: "2030-01-01T12:00:00.000Z", updatedAt: "2030-01-01T12:00:00.000Z" };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("real scenario client rejects uncertain or rebound account state and normalizes mutations", async t => {
  const key = "__TRADING_SCENARIOS_CLIENT_TEST__";
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  type Request = { accountId: string; signal?: AbortSignal; method?: string; body?: { scenario: TradingScenarioInput } };
  const requests: Request[] = [];
  const fixture = {
    owner: "account-a", expiry: Date.now() / 1000 + 3600,
    reply: async (_request: Request): Promise<unknown> => ({ accountId: "account-a", requestId, scenarios: [] }),
    request: async (url: string, options: Request): Promise<unknown> => {
      assert.equal(url, "/api/account/trading-scenarios"); requests.push(options); return fixture.reply(options);
    },
    session: async (): Promise<unknown> => ({ user: { id: fixture.owner }, expires_at: fixture.expiry }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "scenario-client-account-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `
        export const accountRequest=(url,options)=>globalThis.${key}.request(url,options);
        export const readAccountSession=()=>globalThis.${key}.session();`;
    } }],
  });
  try {
    const client = await vite.ssrLoadModule("/src/lib/tradingScenarios.ts");
    const code = (expected: string) => (error: { code?: string }) => { assert.equal(error.code, expected); return true; };
    const empty = (owner = "account-a") => ({ accountId: owner, requestId, scenarios: [] });
    const reset = () => {
      requests.length = 0; fixture.owner = "account-a"; fixture.expiry = Date.now() / 1000 + 3600;
      fixture.reply = async () => empty();
      fixture.session = async () => ({ user: { id: fixture.owner }, expires_at: fixture.expiry });
    };

    await t.test("no transport call is made for a cancelled scope, invalid owner or absent save payload", async () => {
      reset(); const controller = new AbortController(), reason = new Error("cancelled by user"); controller.abort(reason);
      await assert.rejects(client.getTradingScenarios({ accountId: "account-a", signal: controller.signal }), error => error === reason);
      for (const accountId of ["", " ", null, undefined]) await assert.rejects(client.getTradingScenarios({ accountId }), code("unauthenticated"));
      for (const value of [null, undefined, {}, false, "{}"])
        await assert.rejects(client.saveTradingScenario({ accountId: "account-a" }, value), code("invalid"));
      assert.equal(requests.length, 0);
    });

    await t.test("a normalized deep copy freezes the submitted fields before session/network awaits", async () => {
      reset(); const pending = deferred<unknown>(), raw = input();
      raw.id = raw.id.toUpperCase(); raw.title = "  Private thesis  "; fixture.reply = async () => pending.promise;
      const result = client.saveTradingScenario({ accountId: "account-a" }, raw);
      assert.equal(requests.length, 1);
      const submitted = requests[0].body!.scenario;
      assert.equal(submitted.id, input().id); assert.equal(submitted.title, "Private thesis");
      raw.title = "Changed after submit"; raw.assumptions.baseSaleUsd = 999;
      assert.equal(submitted.title, "Private thesis"); assert.equal(submitted.assumptions.baseSaleUsd, 200);
      pending.resolve({ accountId: "account-a", requestId, scenarios: [saved(submitted)] });
      assert.equal((await result).scenarios[0].id, input().id);
    });

    await t.test("mutable caller options cannot rebind the initiating owner or bypass its cancellation", async () => {
      reset(); const pending = deferred<unknown>(), scope = { accountId: "account-a" };
      fixture.reply = async () => pending.promise;
      const result = client.getTradingScenarios(scope); scope.accountId = "account-b"; fixture.owner = "account-b";
      pending.resolve(empty("account-b")); await assert.rejects(result, code("account_changed"));
      assert.equal(requests[0].accountId, "account-a");

      reset(); const late = deferred<unknown>(), controller = new AbortController(), reason = new Error("Cancelled original operation");
      const mutable = { accountId: "account-a", signal: controller.signal }; fixture.reply = async () => late.promise;
      const cancelled = client.getTradingScenarios(mutable); mutable.signal = new AbortController().signal; controller.abort(reason);
      late.resolve(empty()); await assert.rejects(cancelled, error => error === reason);
    });

    await t.test("null, malformed or expired sessions are rejected after response, not treated as active", async () => {
      reset();
      for (const session of [null, { user: { id: "account-a" } }, { user: { id: "account-a" }, expires_at: NaN },
        { user: { id: "account-a" }, expires_at: Infinity }, { user: { id: "account-a" }, expires_at: "99999999999" },
        { user: { id: "account-a" }, expires_at: 1 }]) {
        fixture.session = async () => session;
        await assert.rejects(client.getTradingScenarios({ accountId: "account-a" }), code("unauthenticated"));
      }
      fixture.session = async () => ({ expires_at: Date.now() / 1000 + 3600 });
      await assert.rejects(client.getTradingScenarios({ accountId: "account-a" }), code("account_changed"));
    });

    await t.test("a save requires its matching next-version receipt, not just a valid 200 snapshot", async () => {
      reset(); const current = { ...input(), expectedVersion: 1 };
      for (const receipt of [[], [{ ...saved(current), id: "ffffaaaa-0000-4000-8000-000000000001" }],
        [{ ...saved(current), version: 1 }], [{ ...saved(current), version: 3 }]]) {
        fixture.reply = async () => ({ accountId: "account-a", requestId, scenarios: receipt });
        await assert.rejects(client.saveTradingScenario({ accountId: "account-a" }, current), code("invalid"));
      }
      fixture.reply = async () => ({ accountId: "account-a", requestId, scenarios: [saved(current)] });
      assert.equal((await client.saveTradingScenario({ accountId: "account-a" }, current)).scenarios[0].version, 2);
    });

    await t.test("primitive provider failures remain safe product errors instead of secondary TypeErrors", async () => {
      reset();
      for (const failure of [null, undefined, "private diagnostic", 4, false]) {
        fixture.reply = async () => { throw failure; };
        await assert.rejects(client.getTradingScenarios({ accountId: "account-a" }), (error: { name?: string; code?: string; message?: string }) => {
          assert.equal(error.name, "TradingScenariosError"); assert.equal(error.code, "unavailable");
          assert.equal(error.message, "unavailable"); return true;
        });
      }
    });
  } finally {
    await vite.close();
    if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
  }
});

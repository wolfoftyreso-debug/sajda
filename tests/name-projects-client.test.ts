import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { emptyNameProjectDraft, parseNameProjectDraft, parseProjectBudget, nameProjectToDraft, exportNameProject } from "../src/lib/nameProjectDraft";
import { nameProjectInputSchema, type NameProjectInput, type NameProject } from "../shared/name-projects";

const requestId = "req_0123456789abcdef";
function input(): NameProjectInput { return { ...emptyNameProjectDraft(), id: "abcdaaaa-0000-4000-8000-000000000001", title: "Private brief", shortlistDomains: ["example.com", "example.dev"], budget: { currency: "USD", maxFirstYearCents: 0, maxAnnualRenewalCents: null } }; }
function saved(value = input()): NameProject { const { expectedVersion, ...row } = value; return { ...row, version: expectedVersion + 1, createdAt: "2030-01-01T12:00:00.000Z", updatedAt: "2030-01-01T12:00:00.000Z" }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("project budgets preserve zero, absence and decimal precision without guessing a currency", () => {
  assert.equal(parseProjectBudget(""), null); assert.equal(parseProjectBudget("  "), null); assert.equal(parseProjectBudget("0"), 0);
  assert.equal(parseProjectBudget("12.34"), 1234); assert.equal(parseProjectBudget("12,34"), 1234); assert.equal(parseProjectBudget(" 9.9 "), 990);
  for (const value of ["-1", "1e3", "1.001", "NaN", "Infinity", "$4", "1,234.56"]) assert.ok(Number.isNaN(parseProjectBudget(value)));
  const draft = nameProjectToDraft(saved());
  assert.equal(draft.budget.maxFirstYearCents, "0.00"); assert.equal(draft.budget.maxAnnualRenewalCents, "");
  assert.equal(parseNameProjectDraft(draft).success, true);
  assert.equal(parseNameProjectDraft({ ...draft, title: " " }).success, false);
  assert.equal(parseNameProjectDraft({ ...draft, budget: { ...draft.budget, maxFirstYearCents: "999999999999999" } }).success, false);
  assert.deepEqual(JSON.parse(exportNameProject(saved())).project, saved());
  assert.match(JSON.parse(exportNameProject(saved())).notice, /not current availability/);
});

test("project client requires owner-bound, exact-payload acknowledgements and safely retries immutable input", async t => {
  const key = "__NAME_PROJECT_CLIENT_TEST__";
  type Request = { accountId: string; signal?: AbortSignal; method?: string; body?: { project: NameProjectInput } };
  const requests: Request[] = [];
  const snapshot = (projects: NameProject[] = [], accountId = "account-a") => ({ accountId, requestId, projects });
  const fixture = { owner: "account-a", expiry: Date.now() / 1000 + 3600,
    reply: async (_request: Request): Promise<unknown> => snapshot(),
    request: async (url: string, options: Request) => { assert.equal(url, "/api/account/name-projects"); requests.push(options); return fixture.reply(options); },
    session: async (): Promise<unknown> => ({ user: { id: fixture.owner }, expires_at: fixture.expiry }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "project-client-boundary", enforce: "pre", load(id) { if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(url,options)=>globalThis.${key}.request(url,options); export const readAccountSession=()=>globalThis.${key}.session();`; } }],
  });
  try {
    const client = await vite.ssrLoadModule("/src/lib/nameProjectsClient.ts");
    const code = (value: string) => (error: { code?: string }) => { assert.equal(error.code, value); return true; };
    const reset = () => { requests.length = 0; fixture.owner = "account-a"; fixture.expiry = Date.now() / 1000 + 3600; fixture.reply = async () => snapshot(); };
    await t.test("invalid or aborted input never reaches the transport", async () => {
      reset(); const controller = new AbortController(); controller.abort(new Error("stop"));
      await assert.rejects(client.getNameProjects({ accountId: "account-a", signal: controller.signal }));
      await assert.rejects(client.getNameProjects({ accountId: "" }), code("unauthenticated"));
      for (const value of [null, undefined, {}, { ...input(), budget: { ...input().budget, maxFirstYearCents: -1 } }]) await assert.rejects(client.saveNameProject({ accountId: "account-a" }, value), code("invalid"));
      assert.equal(requests.length, 0);
    });
    await t.test("schema-valid UTF-8 payloads exceeding the API envelope limit remain editable without a transport call", async () => {
      reset();
      const large = { ...input(), title: "界".repeat(120), description: "界".repeat(2000), audience: "界".repeat(500), desiredStyle: "界".repeat(500),
        shortlistDomains: Array.from({ length: 100 }, (_, index) => `${String(index).padStart(3, "0")}${"a".repeat(60)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`) };
      assert.equal(nameProjectInputSchema.safeParse(large).success, true);
      assert.ok(new TextEncoder().encode(JSON.stringify({ action: "save", project: large })).byteLength > 32768);
      await assert.rejects(client.saveNameProject({ accountId: "account-a" }, large), code("invalid"));
      assert.equal(requests.length, 0);
    });
    await t.test("client snapshots input before awaiting transport and cannot rebind owner", async () => {
      reset(); const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      const raw = input(), scope = { accountId: "account-a" };
      const result = client.saveNameProject(scope, raw); raw.title = "Mutated"; raw.budget.maxFirstYearCents = 7000; scope.accountId = "account-b";
      assert.equal(requests[0].body!.project.title, "Private brief"); assert.equal(requests[0].body!.project.budget.maxFirstYearCents, 0);
      pending.resolve(snapshot([saved(requests[0].body!.project)])); assert.equal((await result).projects[0].title, "Private brief");
      fixture.owner = "account-b"; await assert.rejects(client.getNameProjects({ accountId: "account-a" }), code("account_changed"));
    });
    await t.test("receipt must preserve exact brief, next version and shortlist order, allowing only removed references", async () => {
      reset();
      for (const project of [{ ...saved(), title: "Wrong brief" }, { ...saved(), version: 2 }, { ...saved(), shortlistDomains: ["example.dev", "example.com"] }, { ...saved(), shortlistDomains: ["other.com"] }, { ...saved(), budget: { ...saved().budget, maxFirstYearCents: null } }]) {
        fixture.reply = async () => snapshot([project]); await assert.rejects(client.saveNameProject({ accountId: "account-a" }, input()), code("invalid_response"));
      }
      fixture.reply = async () => snapshot([{ ...saved(), shortlistDomains: ["example.dev"] }]);
      assert.deepEqual((await client.saveNameProject({ accountId: "account-a" }, input())).projects[0].shortlistDomains, ["example.dev"]);
      fixture.reply = async () => snapshot([saved(), saved()]); await assert.rejects(client.getNameProjects({ accountId: "account-a" }), code("invalid_response"));
    });
    await t.test("brand configurations require an exact receipt while older saves accept server-preserved configurations", async () => {
      reset();
      const entry = { label: "northlane", requiredTlds: ["com"], platforms: ["github" as const], markets: ["US" as const], source: "user_supplied" as const };
      const raw = { ...input(), brandShortlist: [entry] };
      fixture.reply = async () => snapshot([saved(raw)]);
      assert.deepEqual((await client.saveNameProject({ accountId: "account-a" }, raw)).projects[0].brandShortlist, [entry]);
      for (const brandShortlist of [[], [{ ...entry, requiredTlds: ["dev"] }]]) {
        fixture.reply = async () => snapshot([{ ...saved(raw), brandShortlist }]);
        await assert.rejects(client.saveNameProject({ accountId: "account-a" }, raw), code("invalid_response"));
      }
      fixture.reply = async () => snapshot([saved(raw)]);
      assert.deepEqual((await client.saveNameProject({ accountId: "account-a" }, input())).projects[0].brandShortlist, [entry], "An older editor omitting optional brandShortlist preserves it");
      const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      const delayed = client.saveNameProject({ accountId: "account-a" }, raw);
      fixture.owner = "account-b";
      pending.resolve(snapshot([saved(raw)]));
      await assert.rejects(delayed, code("account_changed"));
    });
    await t.test("post-response session expiry and transport error classifications never leak provider details", async () => {
      reset(); fixture.expiry = 1; await assert.rejects(client.getNameProjects({ accountId: "account-a" }), code("unauthenticated"));
      const originalSession = fixture.session;
      try {
        for (const expires_at of [undefined, null, "999999999999", Number.NaN, Number.POSITIVE_INFINITY]) {
          reset(); fixture.session = async () => ({ user: { id: fixture.owner }, expires_at });
          await assert.rejects(client.getNameProjects({ accountId: "account-a" }), code("unauthenticated"));
        }
      } finally { fixture.session = originalSession; }
      reset(); for (const [detail, expected] of [[{ status: 404 }, "disabled"], [{ status: 413 }, "invalid"], [{ status: 409, code: "saved_domain_required" }, "saved_domain_required"], [{ status: 409, code: "project_limit" }, "limit"], [{ status: 503 }, "unavailable"], [null, "unavailable"]] as const) {
        fixture.reply = async () => { throw detail; }; await assert.rejects(client.getNameProjects({ accountId: "account-a" }), code(expected));
      }
    });
  } finally { await vite.close(); Reflect.deleteProperty(globalThis, key); }
});

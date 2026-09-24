import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("name-package social client enforces account-bound, private observation receipts", async t => {
  const key = "__NAME_PACKAGE_SOCIAL_CLIENT_TEST__";
  type Request = { accountId: string; signal?: AbortSignal; method?: string; body?: { handles: string[] } };
  const requests: Request[] = [];
  const observation = (handle = "octocat", overrides: Record<string, unknown> = {}) => ({ platform: "github", handle,
    status: "profile_found", checkedAt: new Date(Date.now() - 1000).toISOString(), sourceUrl: `https://api.github.com/users/${handle}`, ...overrides });
  const receipt = (observations: unknown[] = [observation()], accountId = "account-a") => ({ accountId, observations, requestId: "req_0123456789abcdef" });
  const fixture = { owner: "account-a", expiry: Date.now() / 1000 + 3600,
    reply: async (_request: Request): Promise<unknown> => receipt(),
    request: async (url: string, options: Request) => { assert.equal(url, "/api/account/name-package-social"); requests.push(options); return fixture.reply(options); },
    session: async (): Promise<unknown> => ({ user: { id: fixture.owner }, expires_at: fixture.expiry }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "name-package-social-client-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(url,options)=>globalThis.${key}.request(url,options); export const readAccountSession=()=>globalThis.${key}.session();`;
    } }],
  });
  const reset = () => { requests.length = 0; fixture.owner = "account-a"; fixture.expiry = Date.now() / 1000 + 3600;
    fixture.reply = async () => receipt(); fixture.session = async () => ({ user: { id: fixture.owner }, expires_at: fixture.expiry }); };
  try {
    const client = await vite.ssrLoadModule("/src/lib/namePackageSocialClient.ts");
    await t.test("invalid handles, duplicate names and pre-cancelled requests never reach transport", async () => {
      reset();
      for (const handles of [null, undefined, [], ["octocat", "octocat"], ["Octocat"], ["../admin"], ["https://internal.test"], ["a--b"], ["-name"], ["x".repeat(40)], Array(6).fill("name")]) {
        await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, handles));
      }
      await assert.rejects(client.checkPackageSocials({ accountId: "" }, ["octocat"]));
      const controller = new AbortController(); controller.abort(new Error("cancelled"));
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a", signal: controller.signal }, ["octocat"]));
      assert.equal(requests.length, 0);
    });
    await t.test("handle and owner snapshots cannot be rebound while a request is pending", async () => {
      reset(); const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      const controller = new AbortController(), replacement = new AbortController();
      const scope = { accountId: "account-a", signal: controller.signal }, names = ["octocat"];
      const result = client.checkPackageSocials(scope, names);
      names[0] = "changed"; names.push("another"); scope.accountId = "account-b"; scope.signal = replacement.signal;
      assert.deepEqual(requests[0].body, { handles: ["octocat"] });
      assert.equal(requests[0].accountId, "account-a"); assert.equal(requests[0].method, "POST"); assert.equal(requests[0].signal, controller.signal);
      pending.resolve(receipt()); assert.equal((await result)[0].handle, "octocat");
    });
    await t.test("strict envelopes and observations reject unrequested and invented availability evidence", async () => {
      reset();
      const invalid: unknown[] = [null, [], {}, { ...receipt(), extra: true }, { ...receipt(), accountId: "account-b" },
        { ...receipt(), requestId: "wrong" }, receipt([]), receipt([observation(), observation()]),
        receipt([observation("another")]), receipt([observation("octocat", { platform: "instagram", sourceUrl: "https://www.instagram.com/octocat" })]),
        receipt([observation("octocat", { available: true })]), receipt([observation("octocat", { status: "available" })]),
        receipt([observation("octocat", { sourceUrl: "https://github.com/octocat" })]),
        receipt([observation("octocat", { sourceUrl: "https://api.github.com/users/octocat?redirect=internal" })]),
        receipt([observation("octocat", { sourceUrl: "https://api.github.com.evil.test/users/octocat" })]),
        receipt([observation("octocat", { sourceUrl: "javascript:alert(1)" })]),
        receipt([observation("octocat", { handle: "Octocat" })]),
      ];
      for (const body of invalid) { fixture.reply = async () => body; await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"])); }
    });
    await t.test("old, future, invalid and absent observation timestamps are not accepted as current", async () => {
      reset();
      for (const checkedAt of [undefined, "not-a-date", "", "2026-99-99T00:00:00Z", new Date(Date.now() + 60_000).toISOString(), new Date(Date.now() - 30 * 60 * 1000 - 10_000).toISOString()]) {
        fixture.reply = async () => receipt([observation("octocat", { checkedAt })]);
        await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
      }
    });
    await t.test("404 and unknown remain observations only, and responses may reorder but never lose requested names", async () => {
      reset(); fixture.reply = async () => receipt([observation("github", { status: "not_found" }), observation("octocat", { status: "unknown" })]);
      const result = await client.checkPackageSocials({ accountId: "account-a" }, ["octocat", "github"]);
      assert.deepEqual(result.map((value: { handle: string; status: string }) => [value.handle, value.status]), [["github", "not_found"], ["octocat", "unknown"]]);
      assert.equal(result.some((value: object) => "available" in value), false);
      fixture.reply = async () => receipt([observation("octocat")]);
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat", "github"]));
    });
    await t.test("account changes, deletion and invalid session expiry after provider response suppress results", async () => {
      reset(); fixture.owner = "account-b";
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
      reset(); fixture.session = async () => null;
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
      for (const expires_at of [undefined, null, "999999999999", Number.NaN, Number.POSITIVE_INFINITY, 1, Date.now() / 1000 - 1]) {
        reset(); fixture.session = async () => ({ user: { id: "account-a" }, expires_at });
        await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
      }
      reset(); fixture.session = async () => ({ user: {}, expires_at: Date.now() / 1000 + 3600 });
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
    });
    await t.test("cancellation during either await uses the initiating signal even if caller mutates scope", async () => {
      reset(); const controller = new AbortController(), replacement = new AbortController(), pending = deferred<unknown>();
      fixture.reply = async () => pending.promise;
      const scope = { accountId: "account-a", signal: controller.signal };
      const request = client.checkPackageSocials(scope, ["octocat"]);
      scope.signal = replacement.signal; controller.abort(new Error("cancelled")); pending.resolve(receipt()); await assert.rejects(request);
      reset(); const lateController = new AbortController(), sessionPending = deferred<unknown>(), sessionEntered = deferred<void>();
      fixture.session = async () => { sessionEntered.resolve(); return sessionPending.promise; };
      const late = client.checkPackageSocials({ accountId: "account-a", signal: lateController.signal }, ["octocat"]);
      await sessionEntered.promise; lateController.abort(new Error("cancelled"));
      sessionPending.resolve({ user: { id: "account-a" }, expires_at: Date.now() / 1000 + 3600 }); await assert.rejects(late);
    });
    await t.test("transport failures cannot produce usable package evidence", async () => {
      reset(); fixture.reply = async () => { throw new Error("unavailable"); };
      await assert.rejects(client.checkPackageSocials({ accountId: "account-a" }, ["octocat"]));
      assert.equal(requests.length, 1);
    });
  } finally { await vite.close(); Reflect.deleteProperty(globalThis, key); }
});

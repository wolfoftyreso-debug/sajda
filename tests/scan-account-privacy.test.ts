import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { StartScanOptions, useScan as useScanType } from "../src/contexts/ScanContext";

const sessionKey = "sajda.search-results.v2";
const privateOptions: StartScanOptions = { advanced: true, brief: "Private account A project and unreleased product strategy", theme: "private founder brief", tlds: ["com"] };
const registryCheckedAt = new Date(Date.now() - 10 * 60_000).toISOString();
function ready(prefix: string) {
  return { results: [{ domain: `${prefix}.com`, tld: "com", status: "available", checkMethod: "rdap", authoritative: true,
    source: "Synthetic fixture", checkedAt: registryCheckedAt, registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: `Synthetic ${prefix}` }],
  generation: { source: "ai", refinementApplied: false }, briefAnalysis: { mode: "local", summary: `${prefix} brief`, keywords: [prefix], concepts: [] } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

test("mounted search retires private account context, aborts old requests and preserves explicit guest first value", async context => {
  const keys = ["window", "__SCAN_ACCOUNT_PRIVACY__"];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const local = new Map<string, string>(), session = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key) });
  const requests: { brief?: string; signal?: AbortSignal }[] = [];
  let reply: () => Promise<ReturnType<typeof ready>> = async () => ready("private-alpha");
  const fixture = { owner: "account-a" as string | null, loading: false, toasts: [] as unknown[],
    search: async (_tlds: unknown, _limit: unknown, _theme: unknown, _language: unknown, options: typeof requests[number]) => {
      requests.push(options); return reply();
    } };
  Object.defineProperty(globalThis, "__SCAN_ACCOUNT_PRIVACY__", { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "https://sajda.test", hostname: "sajda.test", href: "https://sajda.test/" },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    localStorage: storage(local), sessionStorage: storage(session),
  } });
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "export const useAuth=()=>{const f=globalThis.__SCAN_ACCOUNT_PRIVACY__;return {user:f.owner?{id:f.owner,email_verified:true}:null,loading:f.loading}};"],
    ["/src/i18n/LanguageProvider.tsx", "export const useLanguage=()=>({language:'en',t:key=>key});"],
    ["/src/hooks/use-toast.ts", "const toast=value=>globalThis.__SCAN_ACCOUNT_PRIVACY__.toasts.push(value);export const useToast=()=>({toast});"],
    ["/src/lib/localTestSearch.ts", "export const runAnonymousSearch=(...args)=>globalThis.__SCAN_ACCOUNT_PRIVACY__.search(...args);"],
  ]);
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_SAJDA_SURFACE": '"web"' },
    plugins: [{ name: "scan-owner-boundary-fixtures", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (file.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let scan!: ReturnType<typeof useScanType>;
  try {
    const { ScanProvider, useScan } = await vite.ssrLoadModule("/src/contexts/ScanContext.tsx");
    function Probe() {
      scan = useScan();
      return h("section", { "data-refinable": Boolean(scan.lastSearchOptions) }, scan.domains.map(domain => h("article", { key: domain.domain }, domain.domain)));
    }
    const render = async () => { await act(async () => {
      if (renderer) renderer.update(h(ScanProvider, null, h(Probe)));
      else renderer = create(h(ScanProvider, null, h(Probe)));
    }); };
    const reset = async (owner: string | null, loading = false) => {
      if (renderer) await act(async () => renderer!.unmount()); renderer = undefined;
      local.clear(); session.clear(); requests.length = 0; fixture.toasts.length = 0;
      fixture.owner = owner; fixture.loading = loading; reply = async () => ready("private-alpha");
      await render();
    };
    const start = async (options: StartScanOptions) => { let result = false; await act(async () => { result = await scan.startScan(options); }); return result; };
    const empty = () => {
      assert.deepEqual(scan.domains, []); assert.deepEqual(scan.pendingDomains, []);
      assert.equal(scan.resultsCheckedAt, null, "Private observation timestamps retire with their results");
      assert.equal(scan.lastSearchOptions, null); assert.equal(scan.briefAnalysis, null); assert.equal(scan.generation, null);
      assert.equal(scan.searchKeyword, ""); assert.equal(scan.restoredResults, false); assert.equal(scan.isScanning, false);
      assert.equal(renderer!.root.findByType("section").props["data-refinable"], false);
      assert.equal(session.has(sessionKey), false); assert.equal(session.has("sajda.search-results.v1"), false);
    };
    await context.test("A project cannot remain visible or be refined under B; same-account loading is harmless", async () => {
      await reset("account-a");
      assert.equal(await start(privateOptions), true);
      assert.ok(Number.isFinite(Date.parse(scan.resultsCheckedAt!)), "A successful live search gets a receipt timestamp");
      assert.equal(scan.domains[0].checkedAt, registryCheckedAt, "Registry evidence retains its earlier observation time");
      assert.equal(scan.domains[0].source, "Synthetic fixture");
      assert.equal(scan.lastSearchOptions?.brief, privateOptions.brief);
      assert.equal(session.has(sessionKey), false, "Signed-in results must not enter the unowned guest cache");
      const privateRows = scan.domains, staleStart = scan.startScan;
      fixture.loading = true; await render();
      assert.equal(scan.domains, privateRows);
      fixture.owner = null; await render();
      assert.equal(scan.domains, privateRows, "Transient null while refreshing the same owner is not settled logout");
      fixture.owner = "account-a";
      fixture.loading = false; await render();
      assert.equal(scan.domains, privateRows);
      fixture.owner = "account-b"; await render(); empty();
      const count = requests.length;
      let staleResult = true;
      await act(async () => { staleResult = await staleStart(privateOptions); });
      assert.equal(staleResult, false); assert.equal(requests.length, count, "Old callbacks cannot resend A's private brief");
      reply = async () => ready("account-beta");
      assert.equal(await start({ brief: "B's own project", theme: "beta", advanced: true }), true);
      assert.equal(scan.lastSearchOptions?.brief, "B's own project");
      assert.deepEqual(scan.domains.map(domain => domain.domain), ["account-beta.com"]);
    });
    await context.test("a pending A search is aborted and its late successful response cannot restore A's context", async () => {
      await reset("account-a");
      const pending = deferred<ReturnType<typeof ready>>(); reply = () => pending.promise;
      let completion!: Promise<boolean>;
      await act(async () => { completion = scan.startScan(privateOptions); });
      assert.equal(scan.isScanning, true); assert.equal(requests.length, 1);
      const signal = requests[0].signal!; assert.equal(signal.aborted, false);
      fixture.owner = "account-b"; fixture.loading = true; await render(); empty(); assert.equal(signal.aborted, true);
      const previousToasts = fixture.toasts.length;
      let completed = true;
      await act(async () => { pending.resolve(ready("late-private-alpha")); completed = await completion; });
      assert.equal(completed, false); empty(); assert.equal(fixture.toasts.length, previousToasts);
      fixture.loading = false; await render(); empty();
      reply = async () => ready("fresh-beta");
      assert.equal(await start({ theme: "beta" }), true, "The old request must release its submission lock");
    });
    await context.test("logout retires private context and both cached snapshot generations", async () => {
      await reset("account-a"); assert.equal(await start(privateOptions), true);
      session.set(sessionKey, "synthetic old guest cache"); session.set("sajda.search-results.v1", "synthetic legacy private cache");
      fixture.owner = null; await render(); empty();
    });
    await context.test("initial loading and first signup preserve the explicit guest trial result", async () => {
      await reset(null, true);
      assert.equal(await start({ theme: "guest project" }), false); assert.equal(requests.length, 0);
      fixture.loading = false; await render(); reply = async () => ready("guest-first-value");
      assert.equal(await start({ theme: "guest project" }), true);
      const guestRows = scan.domains;
      const stored = session.get(sessionKey)!;
      assert.equal(JSON.parse(stored).audience, "guest");
      fixture.loading = true; await render(); assert.equal(scan.domains, guestRows);
      fixture.owner = "new-account"; fixture.loading = false; await render();
      assert.equal(scan.domains, guestRows); assert.equal(session.get(sessionKey), stored);
      fixture.owner = null; await render(); empty();
    });
    await context.test("new guest-only snapshots restore during hydration while legacy snapshots do not", async () => {
      await reset(null); reply = async () => ready("returning-guest"); assert.equal(await start({ theme: "guest" }), true);
      const snapshot = session.get(sessionKey)!;
      await act(async () => renderer!.unmount()); renderer = undefined;
      fixture.loading = true; session.set("sajda.search-results.v1", "legacy private data"); await render();
      assert.equal(scan.restoredResults, true); assert.equal(scan.domains[0].domain, "returning-guest.com");
      assert.equal(scan.resultsCheckedAt, null, "Restoring a snapshot never refreshes domain evidence");
      assert.equal(scan.domains[0].checkedAt, null, "Retained row timestamps cannot verify restored snapshots");
      assert.equal(session.has("sajda.search-results.v1"), false);
      fixture.loading = false; await render();
      assert.equal(scan.domains[0].domain, "returning-guest.com"); assert.equal(session.get(sessionKey), snapshot);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { translate, type Language } from "../src/i18n/LanguageProvider";
import { getSearchCapacityAttemptNote, getSearchGenerationNote, searchRefinementCopy } from "../src/i18n/searchRefinementCopy";
import type { StartScanOptions, useScan as useScanType } from "../src/contexts/ScanContext";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";
import type { NamingGeneration } from "../shared/search-refinement";

const languages = ["en", "sv", "es", "fr", "zh"] as const;
const origin = "https://sajda.example.test";
const sessionKey = "sajda.search-results.v1";
const originalOptions: StartScanOptions = { advanced: true, brief: "A quiet neighborhood flower studio", theme: "flower studio", tlds: ["com"] };
const batch = (prefix = "petalpath"): AnonymousSearchResult[] => Array.from({ length: 4 }, (_, index) => ({
  domain: `${prefix}${index}.com`, tld: "com", status: "available", checkMethod: "rdap", authoritative: true,
  source: "registry-test-fixture", registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "Naming fixture.",
}));
const ready = (prefix = "petalpath") => Response.json({ results: batch(prefix),
  generation: { source: "ai", refinementApplied: false },
  briefAnalysis: { mode: "local", summary: "Original flower project", keywords: ["flower"], concepts: ["quiet"] },
});

test("attempt notes describe only capacity failures, never relabel retained suggestions", () => {
  for (const language of languages) {
    const copy = searchRefinementCopy[language];
    assert.equal(getSearchCapacityAttemptNote(language), undefined);
    assert.equal(getSearchCapacityAttemptNote(language, null), undefined);
    for (const fallbackReason of [undefined, "ai_off", "ai_unavailable", "no_context"] as const) {
      assert.equal(getSearchCapacityAttemptNote(language, { source: "rules", refinementApplied: true, fallbackReason }), undefined);
    }
    for (const fallbackReason of ["ai_daily_limit", "ai_busy"] as const) {
      const generation: NamingGeneration = { source: "rules", refinementApplied: true, fallbackReason };
      const note = getSearchCapacityAttemptNote(language, generation);
      assert.equal(note, fallbackReason === "ai_daily_limit" ? copy.attemptAiDailyLimitNote : copy.attemptAiBusyNote);
      assert.notEqual(note, getSearchGenerationNote(language, generation));
      assert.doesNotMatch(note!, /rule|regler|regelbaser|reglas|règles|规则/iu);
      assert.equal(getSearchCapacityAttemptNote(language, { ...generation, source: "ai" }), undefined);
      if (fallbackReason === "ai_daily_limit") assert.match(note!, /00:00 UTC/u);
    }
  }
});

test("mounted empty or unverified refinement reports AI capacity without replacing previous AI results", async context => {
  const globals = new Map(["window", "__SCAN_CAPACITY_ATTEMPT__"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const fixture = { language: "en" as Language, translate, toasts: [] as { title: string; description: string }[] };
  const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); }, clear: () => map.clear() });
  Object.defineProperty(globalThis, "__SCAN_CAPACITY_ATTEMPT__", { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin, hostname: "sajda.example.test", href: `${origin}/` },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    localStorage: storage(local), sessionStorage: storage(session),
  } });
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "const user={id:'fixture-free-account',email_verified:true}; export const useAuth=()=>({user,loading:false});"],
    ["/src/i18n/LanguageProvider.tsx", "export const useLanguage=()=>{const f=globalThis.__SCAN_CAPACITY_ATTEMPT__;return {language:f.language,t:(k,v)=>f.translate(f.language,k,v)}}; export const translate=(l,k,v)=>globalThis.__SCAN_CAPACITY_ATTEMPT__.translate(l,k,v);"],
    ["/src/hooks/use-toast.ts", "const toast=value=>globalThis.__SCAN_CAPACITY_ATTEMPT__.toasts.push(value); export const useToast=()=>({toast});"],
    ["/src/lib/nativeTransport.ts", "export const nativeRequest=()=>{throw new Error('No native request expected');};"],
  ]);
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_SAJDA_SURFACE": '"web"' },
    plugins: [{ name: "scan-capacity-attempt-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (file.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let scan!: ReturnType<typeof useScanType>;
  let requests = 0;
  let response: () => Response = ready;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, "/api/domain-search");
    assert.equal(init.method, "POST");
    requests++;
    return response();
  };
  try {
    const { ScanProvider, useScan } = await vite.ssrLoadModule("/src/contexts/ScanContext.tsx");
    function Probe() {
      scan = useScan();
      return h("section", { "data-source": scan.generation?.source }, scan.domains.map(domain => h("article", { key: domain.domain }, domain.domain)));
    }
    const start = async (options: StartScanOptions) => {
      let success = false;
      await act(async () => { success = await scan.startScan(options); });
      return success;
    };
    for (const language of languages) for (const fallbackReason of ["ai_daily_limit", "ai_busy"] as const) {
      for (const failure of ["empty", "unknown"] as const) await context.test(`${language}: ${fallbackReason}, ${failure}`, async () => {
        if (renderer) await act(async () => renderer!.unmount());
        session.clear(); local.clear(); fixture.language = language; fixture.toasts.length = 0; requests = 0; response = ready;
        await act(async () => { renderer = create(h(ScanProvider, null, h(Probe))); });
        assert.equal(await start(originalOptions), true);
        const before = { domains: scan.domains, generation: scan.generation, options: scan.lastSearchOptions, analysis: scan.briefAnalysis, stored: session.get(sessionKey) };
        fixture.toasts.length = 0;
        const generation: NamingGeneration = { source: "rules", refinementApplied: true, fallbackReason };
        response = () => Response.json({ results: failure === "empty" ? [] : batch("unchecked").map(item => ({ ...item, status: "unknown", authoritative: false, checkMethod: "none" })), generation });
        const options: StartScanOptions = { ...originalOptions, refinement: { previousNames: scan.domains.map(item => item.domain), likedNames: [], reasons: ["too_long"] } };
        assert.equal(await start(options), false);
        assert.equal(scan.domains, before.domains);
        assert.equal(scan.generation, before.generation);
        assert.equal(scan.lastSearchOptions, before.options);
        assert.equal(scan.briefAnalysis, before.analysis);
        assert.equal(session.get(sessionKey), before.stored);
        assert.equal(renderer!.root.findByType("section").props["data-source"], "ai");
        assert.deepEqual(renderer!.root.findAllByType("article").map(article => article.children[0]), before.domains.map(domain => domain.domain));
        assert.deepEqual(fixture.toasts, [{ title: translate(language, "toast.searchFailed"), description: getSearchCapacityAttemptNote(language, generation) }]);
        assert.equal(scan.isScanning, false);
        assert.equal(scan.scanPhase, "idle");
        await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
        assert.equal(requests, 2, "no automatic retry after capacity failure");
        response = () => ready("manualretry");
        assert.equal(await start(options), true, "the finished attempt releases the submission guard");
        assert.equal(requests, 3);
        assert.ok(scan.domains.every(domain => domain.domain.startsWith("manualretry")));
      });
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

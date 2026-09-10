import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h, Fragment } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { AccountUser } from "../src/integrations/neon/account-types";
import type { StartScanOptions, useScan as useScanType } from "../src/contexts/ScanContext";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";
import { DEFAULT_ADVANCED_SEARCH_CRITERIA } from "../src/lib/advancedSearchCriteria";
import { searchRefinementCopy } from "../src/i18n/searchRefinementCopy";
import { aiPrivacyCopy } from "../src/i18n/aiPrivacyCopy";
import { parseSearchRefinement } from "../shared/search-refinement";

type ScanState = ReturnType<typeof useScanType>;
const origin = "https://sajda.example.test";
const quotaKey = "sajda.free-search.v1";
const sessionKey = "sajda.search-results.v1";
const account: AccountUser = { id: "free-account", email: "qa@example.test", email_verified: true, created_at: "2026-09-01T00:00:00Z" };
const originalCriteria = { ...DEFAULT_ADVANCED_SEARCH_CRITERIA, nameStyle: "invented" as const, includeWords: ["calm"], excludeWords: ["robot"] };
const originalOptions: StartScanOptions = {
  advanced: true, brief: "A calm neighborhood coffee studio", theme: "coffee studio", mode: "deep",
  tlds: ["dev", "com"], providers: ["loopia"], criteria: originalCriteria,
};
const card = (domain: string, index = 0): AnonymousSearchResult => ({ domain, tld: domain.split(".")[1],
  status: "available", checkMethod: "rdap", source: "registry-test-fixture", authoritative: true,
  registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, namingScore: 70, rankingPosition: index + 1, rationale: "Fixture naming rationale." });
const batch = (prefix = "northspark", count = 25) => Array.from({ length: count }, (_, index) => card(`${prefix}${index}.dev`, index));
const reply = (prefix = "northspark", count = 25) => Response.json({ results: batch(prefix, count),
  briefAnalysis: { mode: "local", summary: "Original context", keywords: ["coffee"], concepts: ["neighborhood"] },
  generation: { source: "rules", refinementApplied: false, fallbackReason: "ai_off" } });
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join(" ").replace(/\s+/g, " ").trim();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const pause = () => new Promise<void>(done => setTimeout(done, 0));

// Real ScanProvider + Index + SearchRefinement + search HTTP serialization,
// real quota/session storage and AI-consent dispatch. Only account identity,
// decorative children, watchlist reads and the network are test boundaries.
test("mounted iterative search preserves original context, access boundaries and prior results", async t => {
  const globals = new Map(["window", "document", "__REFINEMENT_FLOW__"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const localWrites: [string, string][] = [];
  const fixture = { auth: { user: account as AccountUser | null, loading: false }, toasts: [] as unknown[], watchlistMutations: 0 };
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  const storage = (map: Map<string, string>, writes?: [string, string][]) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); writes?.push([key, value]); },
    removeItem: (key: string) => { map.delete(key); }, clear: () => map.clear(),
  });
  setGlobal("__REFINEMENT_FLOW__", fixture);
  setGlobal("window", { location: { origin, hostname: "sajda.example.test", href: `${origin}/` },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    requestAnimationFrame: (callback: () => void) => { callback(); return 0; },
    matchMedia: () => ({ matches: true }), history: { replaceState() {} },
    localStorage: storage(local, localWrites), sessionStorage: storage(session),
  });
  setGlobal("document", { getElementById: () => null });
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "export const useAuth=()=>globalThis.__REFINEMENT_FLOW__.auth;"],
    ["/src/i18n/LanguageProvider.tsx", "const t=(key)=>key; export const useLanguage=()=>({language:'en',t}); export const translate=(_locale,key)=>key;"],
    ["/src/hooks/use-toast.ts", "const toast=(value)=>globalThis.__REFINEMENT_FLOW__.toasts.push(value); export const useToast=()=>({toast});"],
    ["/src/lib/nativeTransport.ts", "export const nativeRequest=()=>{throw new Error('No native transport expected');};"],
    ["/src/lib/watchlistService.ts", "export const getWatchlist=async()=>[]; export const addToWatchlist=async()=>{globalThis.__REFINEMENT_FLOW__.watchlistMutations++;}; export const removeFromWatchlist=addToWatchlist;"],
    ["/src/components/HeroOfferCarousel.tsx", "export default function HeroOfferCarousel(){return null;} export function HeroOfferHeading(){return null;}"],
  ]);
  const wrapped = ["DomainCard", "DomainFilters", "TLDSelector", "ProviderSelector", "ScanModeSelector", "AdvancedSearchBrief", "DeepReviewPanel"];
  for (const component of wrapped) mocks.set(`/src/components/${component}.tsx`,
    `import {createElement as h} from 'react'; export default function ${component}(props){return h('fixture-${component.toLowerCase()}',props,props.children);}`);
  for (const component of ["StatsCard", "ScanningIndicator", "SearchResultHelp", "FooterNav", "Top10Banner", "LanguageSwitcher", "AccountLink"])
    mocks.set(`/src/components/${component}.tsx`, `export default function ${component}(){return null;}`);
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_SAJDA_SURFACE": '"web"' },
    plugins: [{ name: "refinement-flow-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (normalized.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let scan!: ScanState;
  const requests: { body: Record<string, unknown>; signal?: AbortSignal }[] = [];
  let response: () => Response | Promise<Response> = reply;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin, "No external network is allowed in this fixture");
    assert.equal(url.pathname, "/api/domain-search", "Iteration must not call billing, premium or account mutation endpoints");
    assert.equal(init.method, "POST");
    requests.push({ body: JSON.parse(String(init.body)), signal: init.signal ?? undefined });
    return response();
  };
  try {
    const { ScanProvider, useScan } = await vite.ssrLoadModule("/src/contexts/ScanContext.tsx");
    const { default: Index } = await vite.ssrLoadModule("/src/pages/Index.tsx");
    function Probe() { scan = useScan(); return null; }
    const tree = () => h(MemoryRouter, null, h(ScanProvider, null, h(Fragment, null, h(Probe), h(Index))));
    const mount = async ({ user = account as AccountUser | null, loading = false, consumed = false, preserveSession = false } = {}) => {
      if (renderer) await act(async () => renderer!.unmount());
      local.clear(); localWrites.length = 0; requests.length = 0; fixture.toasts.length = 0; fixture.watchlistMutations = 0;
      if (!preserveSession) session.clear();
      fixture.auth = { user, loading };
      if (consumed) local.set(quotaKey, JSON.stringify({ version: 1, state: "completed", reservationId: "fixture_reservation", updatedAt: new Date().toISOString() }));
      response = reply;
      await act(async () => { renderer = create(tree()); });
    };
    const button = (label: string) => renderer!.root.findAllByType("button").find(node => text(node) === label)!;
    const cards = () => renderer!.root.findAllByType("fixture-domaincard");
    const start = async (options: StartScanOptions = originalOptions) => {
      let completed = false;
      await act(async () => { completed = await scan.startScan(options); });
      return completed;
    };
    const selectFeedback = async () => {
      await act(async () => button(searchRefinementCopy.en.reasons.too_long).props.onClick());
      await act(async () => button(scan.domains[0].domain).props.onClick());
    };
    const refine = async () => { await act(async () => { button(searchRefinementCopy.en.submit).props.onClick(); await pause(); }); };

    await t.test("Index shows ten, reveals existing results without a request, and posts explicit original-context feedback", async () => {
      await mount({ consumed: true });
      // Start via the real Index form, rather than seeding ScanContext state.
      await act(async () => renderer!.root.findByProps({ id: "domain-theme" }).props.onChange({ target: { value: originalOptions.theme } }));
      await act(async () => {
        const advanced = renderer!.root.findByType("fixture-advancedsearchbrief").props;
        advanced.onEnabledChange(true);
        advanced.onValueChange(originalOptions.brief);
        advanced.onCriteriaChange(originalCriteria);
        renderer!.root.findByType("fixture-scanmodeselector").props.onModeChange(originalOptions.mode);
        renderer!.root.findByType("fixture-providerselector").props.onProviderIdsChange(originalOptions.providers);
        scan.setSelectedTLDs(originalOptions.tlds!);
      });
      await act(async () => { renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); await pause(); });
      assert.equal(requests.length, 1);
      assert.equal(scan.isScanning, false);
      assert.equal(cards().length, 10);
      await act(async () => button("Show 10 more").props.onClick());
      assert.equal(cards().length, 20);
      assert.equal(requests.length, 1, "show more only reveals this response");
      await act(async () => button("search.edit").props.onClick());
      await act(async () => renderer!.root.findByProps({ id: "domain-theme" }).props.onChange({ target: { value: "unrelated edited theme" } }));
      await act(async () => {
        const advanced = renderer!.root.findByType("fixture-advancedsearchbrief").props;
        advanced.onEnabledChange(true);
        advanced.onValueChange("A different description that must not replace the original");
        advanced.onCriteriaChange({ ...DEFAULT_ADVANCED_SEARCH_CRITERIA, nameStyle: "descriptive", excludeWords: ["coffee"] });
        renderer!.root.findByType("fixture-scanmodeselector").props.onModeChange("light");
        renderer!.root.findByType("fixture-providerselector").props.onProviderIdsChange(["namecheap"]);
        scan.setSelectedTLDs(["ai"]);
      });
      assert.equal(scan.searchKeyword, "unrelated edited theme");
      assert.equal(scan.scanMode, "light");
      assert.deepEqual(scan.selectedTLDs, ["ai"]);
      await selectFeedback();
      assert.equal(requests.length, 1, "feedback selection must not dispatch");
      response = () => reply("freshspark");
      await refine();
      assert.equal(requests.length, 2);
      const body = requests[1].body;
      assert.equal(body.theme, originalOptions.theme);
      assert.equal(body.brief, originalOptions.brief);
      assert.equal(body.advanced, true);
      assert.equal(body.creativeMode, originalOptions.mode);
      assert.deepEqual(body.tlds, originalOptions.tlds);
      assert.deepEqual(body.providers, originalOptions.providers);
      assert.deepEqual(body.criteria, originalCriteria);
      assert.deepEqual(parseSearchRefinement(body.refinement), {
        reasons: ["too_long"], previousNames: batch().map(item => item.domain), likedNames: [batch()[0].domain],
      });
      assert.equal(body.aiConsent, undefined, "refinement does not turn AI sharing on");
      assert.equal(cards().length, 10, "a new result set resets the reveal count");
      assert.equal(cards()[0].props.domain, "freshspark0.dev");
      assert.equal(renderer!.root.findByType("fixture-deepreviewpanel").props.theme, originalOptions.theme);
      assert.deepEqual(cards()[0].props.selectedProviderIds, originalOptions.providers);
      assert.equal(button(searchRefinementCopy.en.submit).props.disabled, true, "new results reset feedback");
    });

    await t.test("double refine clicks create one request and preserve the old list while waiting", async () => {
      await mount(); await start(); await selectFeedback();
      const pending = deferred<Response>(); response = () => pending.promise;
      const click = button(searchRefinementCopy.en.submit).props.onClick;
      await act(async () => { click(); click(); });
      assert.equal(requests.length, 2);
      assert.equal(scan.isScanning, true);
      assert.equal(cards()[0].props.domain, "northspark0.dev");
      assert.equal(button(searchRefinementCopy.en.submitting).props.disabled, true);
      await act(async () => { pending.resolve(reply("nextspark")); await pause(); });
      assert.equal(scan.isScanning, false);
      assert.equal(scan.domains[0].domain, "nextspark0.dev");
    });

    await t.test("ScanProvider independently rejects double submits; cancel ignores a late response and releases the trial", async () => {
      await mount(); await start();
      await mount({ user: null, preserveSession: true });
      const originalList = scan.domains;
      const originalStored = session.get(sessionKey);
      const pending = deferred<Response>(); response = () => pending.promise;
      const startSameRender = scan.startScan;
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => { first = startSameRender(originalOptions); second = startSameRender(originalOptions); });
      assert.equal(await second, false);
      assert.equal(requests.length, 1);
      assert.equal(scan.isScanning, true);
      assert.equal(JSON.parse(local.get(quotaKey)!).state, "pending");
      await act(async () => scan.stopScan());
      assert.equal(requests[0].signal?.aborted, true);
      assert.equal(scan.isScanning, false);
      assert.equal(local.has(quotaKey), false);
      await act(async () => { pending.resolve(reply("arrivedlate")); assert.equal(await first, false); });
      assert.deepEqual(scan.domains, originalList);
      assert.equal(session.get(sessionKey), originalStored);
      response = () => reply("aftercancel");
      assert.equal(await start(), true);
      assert.equal(scan.domains[0].domain, "aftercancel0.dev");
      assert.equal(JSON.parse(local.get(quotaKey)!).state, "completed");
      assert.equal(requests.length, 2);
    });

    for (const failure of ["http", "empty", "unknown"] as const) await t.test(`${failure}: prior results, source and original brief survive; feedback can be retried`, async () => {
      await mount(); await start(); await selectFeedback();
      const priorResults = scan.domains;
      const priorOptions = scan.lastSearchOptions;
      const priorGeneration = scan.generation;
      const priorAnalysis = scan.briefAnalysis;
      const priorStored = session.get(sessionKey);
      response = failure === "http" ? () => Response.json({ error: "Service unavailable" }, { status: 503 })
        : failure === "unknown" ? () => Response.json({ results: batch("unchecked").map(entry => ({ ...entry, status: "unknown", authoritative: false, checkMethod: "none" })), generation: { source: "ai", refinementApplied: true } })
        : () => Response.json({ results: [] });
      await refine();
      assert.equal(scan.isScanning, false);
      assert.deepEqual(scan.domains, priorResults);
      assert.deepEqual(scan.lastSearchOptions, priorOptions);
      assert.deepEqual(scan.generation, priorGeneration);
      assert.deepEqual(scan.briefAnalysis, priorAnalysis);
      assert.equal(session.get(sessionKey), priorStored);
      assert.equal(button(searchRefinementCopy.en.reasons.too_long).props["aria-pressed"], true);
      assert.equal(text(renderer!.root.findByProps({ role: "alert" })), searchRefinementCopy.en.failed);
      response = () => reply("retryname");
      await refine();
      assert.equal(scan.domains[0].domain, "retryname0.dev");
      assert.equal(requests.length, 3);
    });

    await t.test("a verified free identity can continue without mutating the browser pass or granting premium", async () => {
      await mount({ consumed: true });
      const before = JSON.stringify(fixture.auth.user);
      const pass = local.get(quotaKey);
      assert.equal(scan.anonymousSearchAccessReady, true);
      assert.equal(scan.anonymousSearchCanStart, true);
      assert.equal(scan.freeSearchAvailable, false);
      assert.equal(await start(), true);
      assert.equal(await start({ ...originalOptions, refinement: { reasons: ["wrong_tone"], previousNames: batch().map(item => item.domain), likedNames: [] } }), true);
      assert.equal(requests.length, 2);
      assert.equal(local.get(quotaKey), pass);
      assert.equal(localWrites.filter(([key]) => key === quotaKey).length, 0);
      assert.equal(JSON.stringify(fixture.auth.user), before);
      assert.equal(fixture.watchlistMutations, 0);
      assert.equal(localWrites.some(([key]) => /premium|trading|entitlement|subscription/i.test(key)), false);
      for (const request of requests) {
        assert.equal("plan" in request.body, false);
        assert.equal("premium" in request.body, false);
      }
    });

    await t.test("guest and unverified identities retain the existing introductory-search gate", async () => {
      for (const user of [null, { ...account, email_verified: false }]) {
        await mount({ user });
        assert.equal(await start(), true);
        assert.equal(scan.freeSearchAvailable, false);
        const priorStored = session.get(sessionKey);
        assert.equal(await start(), false);
        assert.equal(scan.freeSearchGateOpen, true);
        assert.equal(scan.anonymousSearchCanStart, false);
        assert.equal(requests.length, 1);
        assert.equal(session.get(sessionKey), priorStored);
      }
    });

    await t.test("auth hydration blocks the form and direct scan calls, including a cached identity", async () => {
      for (const user of [null, account]) {
        await mount({ user, loading: true });
        assert.equal(scan.anonymousSearchAccessReady, false);
        assert.equal(scan.anonymousSearchCanStart, false);
        assert.equal(renderer!.root.findByType("form").findByProps({ type: "submit" }).props.disabled, true);
        await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
        assert.equal(await start(), false);
        assert.equal(requests.length, 0);
        assert.equal(local.has(quotaKey), false);
        assert.equal(session.has(sessionKey), false);
      }
    });

    await t.test("AI opt-in is separate from feedback and revocation applies to the next iteration", async () => {
      await mount(); await start(); await selectFeedback();
      assert.equal(requests[0].body.aiConsent, undefined);
      await act(async () => button(aiPrivacyCopy.en.allow).props.onClick());
      assert.equal(requests.length, 1, "consent is not a search");
      response = () => reply("withai"); await refine();
      assert.equal((requests[1].body.aiConsent as { accepted: boolean }).accepted, true);
      await selectFeedback();
      await act(async () => button(aiPrivacyCopy.en.revoke).props.onClick());
      response = () => reply("withoutai"); await refine();
      assert.equal(requests[2].body.aiConsent, undefined);
    });

    await t.test("restored snapshots do not resurrect briefs or permit context-free refinement", async () => {
      await mount(); await start();
      const snapshot = session.get(sessionKey);
      assert.ok(snapshot);
      assert.doesNotMatch(snapshot!, /coffee studio|neighborhood|includeWords|refinement|aiConsent/);
      await mount({ preserveSession: true });
      assert.equal(scan.restoredResults, true);
      assert.equal(scan.lastSearchOptions, null);
      assert.equal(scan.generation, null);
      assert.equal(scan.briefAnalysis, null);
      assert.equal(cards().length, 10);
      assert.equal(button(searchRefinementCopy.en.submit), undefined);
      assert.equal(requests.length, 0);
    });

    await t.test("exact checks retain their full bounded list and cannot become creative refinement", async () => {
      await mount();
      const exact = batch("exactname", 12).map(item => item.domain);
      response = () => reply("exactname", 12);
      await start({ domains: exact, tlds: ["dev"], theme: "", mode: "medium" });
      assert.equal(cards().length, 12);
      assert.deepEqual(requests[0].body.domains, exact);
      assert.equal(button(searchRefinementCopy.en.submit), undefined);
      assert.equal(button("Show 10 more"), undefined);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

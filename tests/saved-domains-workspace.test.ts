import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { savedDomainsCopy, savedCopyValues } from "../src/i18n/savedDomainsCopy";
import { savedDomainExtension, selectSavedDomains } from "../src/lib/savedDomainsWorkspace";
import type { WatchlistItem } from "../src/lib/watchlistService";
import type { Language } from "../src/i18n/LanguageProvider";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");
const row = (domain: string, day: number, id = domain): WatchlistItem => ({ id, domain, created_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`, registrar_price: 0, estimated_value: 0, confidence_score: 0, rationale: null });
const rows = [row("zebra.com", 1, "1"), row("alpha.co.uk", 3, "2"), row("beta.se", 2, "3")];
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("saved-domain filtering uses real multi-label registry suffixes and stable name/date sorts", () => {
  assert.equal(savedDomainExtension("alpha.co.uk"), "co.uk");
  assert.equal(savedDomainExtension("alpha.blogspot.com"), "com");
  assert.deepEqual(selectSavedDomains(rows, " ALPHA ", "co.uk", "newest", "en").map(item => item.domain), ["alpha.co.uk"]);
  assert.equal(selectSavedDomains(rows, "", "uk", "newest", "en").length, 0);
  assert.deepEqual(selectSavedDomains(rows, "", "", "newest", "en").map(item => item.domain), ["alpha.co.uk", "beta.se", "zebra.com"]);
  assert.deepEqual(selectSavedDomains(rows, "", "", "oldest", "en").map(item => item.domain), ["zebra.com", "beta.se", "alpha.co.uk"]);
  assert.deepEqual(rows.map(item => item.domain), ["zebra.com", "alpha.co.uk", "beta.se"], "Never mutate fetched account records");
});

test("saved domains workspace preserves account isolation and confirmed mutations", async t => {
  const fixtureKey = "__SAJDA_SAVED_WORKSPACE_TEST__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, fixtureKey);
  const originalFetch = globalThis.fetch;
  type Scope = { accountId: string; signal: AbortSignal };
  const fixture: {
    user: { id: string } | null; language: Language; authLoading: boolean;
    reads: Scope[]; removes: Array<Scope & { domain: string }>;
    get: (scope: Scope) => Promise<WatchlistItem[]>;
    remove: (domain: string, scope: Scope) => Promise<void>;
  } = { user: { id: "account-a" }, language: "en", authLoading: false, reads: [], removes: [],
    get: async () => rows, remove: async () => {} };
  Object.defineProperty(globalThis, fixtureKey, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("Saved workspace must not run providers, search, pricing or AI"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "saved-workspace-account-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${fixtureKey}.user,loading:globalThis.${fixtureKey}.authLoading});`;
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}.language});`;
      if (name.endsWith("/src/lib/watchlistService.ts")) return `export const getWatchlist=scope=>{const f=globalThis.${fixtureKey};f.reads.push(scope);return f.get(scope);};export const removeFromWatchlist=(domain,scope)=>{const f=globalThis.${fixtureKey};f.removes.push({...scope,domain});return f.remove(domain,scope);};`;
      if (name.endsWith("/src/components/DomainCard.tsx")) return `import {createElement as h} from "react";export default function DomainCard(props){return h("div",{"data-card":props.domain,"data-status":props.status,"data-method":props.checkMethod,"data-verified":props.availabilityVerified,"data-actions":props.showWatchlistActions},props.domain);}`;
      if (name.endsWith("/src/components/PageSkeletons.tsx")) return `import {createElement as h} from "react";export const WatchlistPageSkeleton=()=>h("div",{"data-skeleton":true});`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Watchlist } = await vite.ssrLoadModule("/src/pages/Watchlist.tsx");
    const view = () => h(MemoryRouter, { initialEntries: ["/watchlist"] }, h(Watchlist));
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); await act(async () => { renderer = create(view()); }); };
    const root = () => renderer!.root;
    const buttons = () => root().findAllByType("button");
    const button = (text: string) => { const found = buttons().find(node => label(node) === text); assert.ok(found, text); return found; };
    const names = () => root().findAll(node => typeof node.props["data-saved-domain"] === "string").map(node => node.props["data-saved-domain"]);
    const change = async (id: string, value: string) => { const control = root().findAll(node => ["input", "select"].includes(String(node.type)) && node.props.id === id)[0]; assert.ok(control); await act(async () => control.props.onChange({ target: { value } })); };
    const openRemove = async (domain: string) => { const control = buttons().find(node => node.props["aria-label"] === savedCopyValues(savedDomainsCopy[fixture.language].removeLabel, { domain })); assert.ok(control); await act(async () => control.props.onClick()); };
    const reset = () => { fixture.user = { id: "account-a" }; fixture.language = "en"; fixture.authLoading = false; fixture.reads = []; fixture.removes = []; fixture.get = async () => rows; fixture.remove = async () => {}; };

    for (const language of ["en", "sv", "es", "fr", "zh"] as const) await t.test(`${language}: clear title, correct controls, snapshot status and 44px actions`, async () => {
      reset(); fixture.language = language; await mount();
      const copy = savedDomainsCopy[language];
      assert.equal(label(root().findByType("h1")), copy.title);
      assert.ok(label(root()).includes(copy.snapshot)); assert.ok(label(root()).includes(copy.refreshHelp));
      assert.ok(label(root()).includes(savedCopyValues(copy.results, { shown: 3, total: 3 })));
      assert.equal(root().findAllByType("label").length, 3);
      for (const node of root().findAllByType("label")) assert.ok(node.props.htmlFor);
      for (const node of buttons()) assert.match(node.props.className, /(?:min-)?h-11/);
      for (const node of root().findAll(node => node.props["data-card"])) {
        assert.equal(node.props["data-status"], "unknown"); assert.equal(node.props["data-method"], "none");
        assert.equal(node.props["data-verified"], false); assert.equal(node.props["data-actions"], false);
      }
      assert.equal(fixture.reads.length, 1); assert.equal(fixture.removes.length, 0);
    });

    await t.test("query, suffix, sort, no-match reset and manual refresh are local browsing only", async () => {
      reset(); await mount(); assert.deepEqual(names(), ["alpha.co.uk", "beta.se", "zebra.com"]);
      assert.ok(root().findAllByType("option").some(node => node.props.value === "co.uk"));
      await change("saved-domain-search", "  ALPHA "); assert.deepEqual(names(), ["alpha.co.uk"]);
      await change("saved-domain-extension", "se"); assert.deepEqual(names(), []); assert.ok(label(root()).includes(savedDomainsCopy.en.noMatches));
      await act(async () => button(savedDomainsCopy.en.reset).props.onClick()); assert.equal(names().length, 3);
      await change("saved-domain-sort", "oldest"); assert.deepEqual(names(), ["zebra.com", "beta.se", "alpha.co.uk"]);
      await change("saved-domain-sort", "name"); assert.deepEqual(names(), ["alpha.co.uk", "beta.se", "zebra.com"]);
      assert.equal(fixture.reads.length, 1);
      fixture.get = async () => [row("new.com", 4)];
      await act(async () => button(savedDomainsCopy.en.refresh).props.onClick());
      assert.deepEqual(names(), ["new.com"]); assert.equal(fixture.reads.length, 2); assert.equal(fixture.removes.length, 0);
    });

    await t.test("read failure never masquerades as an empty account and retry recovers", async () => {
      reset(); fixture.get = async () => { throw new Error("private internal service details"); }; await mount();
      assert.ok(label(root()).includes(savedDomainsCopy.en.failed)); assert.ok(!label(root()).includes(savedDomainsCopy.en.empty));
      assert.ok(!label(root()).includes("private internal"));
      fixture.get = async () => [];
      await act(async () => button(savedDomainsCopy.en.retry).props.onClick());
      assert.ok(label(root()).includes(savedDomainsCopy.en.empty)); assert.equal(root().findAllByProps({ role: "alert" }).length, 0);
    });

    await t.test("explicit confirmation, cancellation, duplicate lock and failed-delete retry", async () => {
      reset(); await mount(); await openRemove("alpha.co.uk");
      assert.equal(fixture.removes.length, 0);
      await act(async () => button(savedDomainsCopy.en.cancel).props.onClick()); assert.equal(fixture.removes.length, 0);
      const pending = deferred<void>(); fixture.remove = () => pending.promise; await openRemove("alpha.co.uk");
      const confirm = button(savedDomainsCopy.en.confirmRemove);
      await act(async () => { confirm.props.onClick(); confirm.props.onClick(); });
      assert.equal(fixture.removes.length, 1); assert.equal(fixture.removes[0].domain, "alpha.co.uk");
      assert.ok(button(savedDomainsCopy.en.removing).props.disabled);
      for (const node of buttons().filter(node => node.props["aria-label"]?.startsWith("Remove "))) assert.equal(node.props.disabled, true);
      await act(async () => pending.reject(new Error("database timeout")));
      assert.ok(label(root()).includes(savedDomainsCopy.en.removeFailed)); assert.equal(names().length, 3);
      fixture.remove = async () => {};
      await act(async () => button(savedDomainsCopy.en.confirmRemove).props.onClick());
      assert.equal(fixture.removes.length, 2); assert.deepEqual(names(), ["beta.se", "zebra.com"]);
      assert.ok(label(root()).includes(savedCopyValues(savedDomainsCopy.en.removed, { domain: "alpha.co.uk" })));
    });

    await t.test("pre-delete refresh cannot resurrect a removed domain", async () => {
      reset(); await mount(); const stale = deferred<WatchlistItem[]>(); fixture.get = () => stale.promise;
      await act(async () => button(savedDomainsCopy.en.refresh).props.onClick());
      await openRemove("alpha.co.uk"); await act(async () => button(savedDomainsCopy.en.confirmRemove).props.onClick());
      assert.equal(fixture.reads[1].signal.aborted, true);
      await act(async () => stale.resolve(rows)); assert.deepEqual(names(), ["beta.se", "zebra.com"]);
    });

    await t.test("late account-A reads and deletes never change account B", async () => {
      reset(); const oldRead = deferred<WatchlistItem[]>(); fixture.get = () => oldRead.promise; await mount();
      fixture.user = { id: "account-b" }; fixture.get = async () => [row("b-only.se", 5)];
      await act(async () => renderer!.update(view()));
      assert.equal(fixture.reads[0].signal.aborted, true);
      await act(async () => oldRead.resolve(rows)); assert.deepEqual(names(), ["b-only.se"]);
      assert.deepEqual(fixture.reads.map(scope => scope.accountId), ["account-a", "account-b"]);
      const oldDelete = deferred<void>(); fixture.remove = () => oldDelete.promise;
      await openRemove("b-only.se"); await act(async () => button(savedDomainsCopy.en.confirmRemove).props.onClick());
      fixture.user = { id: "account-c" }; fixture.get = async () => [row("c-only.com", 6)];
      await act(async () => renderer!.update(view()));
      await act(async () => oldDelete.resolve());
      assert.equal(fixture.removes[0].signal.aborted, true); assert.deepEqual(names(), ["c-only.com"]);
      assert.equal(button(savedDomainsCopy.en.refresh).props.disabled, false);
      assert.ok(!label(root()).includes("b-only.se"));
    });

    await t.test("language changes keep data, filters and pending owner unchanged", async () => {
      reset(); await mount(); await change("saved-domain-search", "beta"); fixture.language = "fr";
      await act(async () => renderer!.update(view()));
      assert.deepEqual(names(), ["beta.se"]); assert.equal(fixture.reads.length, 1);
      assert.equal(label(root().findByType("h1")), savedDomainsCopy.fr.title);
    });

    await t.test("deleting the last matching suffix keeps its filter visible and resettable", async () => {
      reset(); await mount(); await change("saved-domain-extension", "co.uk");
      await openRemove("alpha.co.uk"); await act(async () => button(savedDomainsCopy.en.confirmRemove).props.onClick());
      assert.deepEqual(names(), []);
      const extension = root().findAllByType("select").find(node => node.props.id === "saved-domain-extension")!;
      assert.equal(extension.props.value, "co.uk");
      assert.ok(extension.findAllByType("option").some(node => node.props.value === "co.uk"));
      await act(async () => button(savedDomainsCopy.en.reset).props.onClick());
      assert.deepEqual(names(), ["beta.se", "zebra.com"]);
    });

    await t.test("stale action callbacks cannot put a new account into a busy state", async () => {
      reset(); await mount(); await openRemove("alpha.co.uk");
      const oldRemove = button(savedDomainsCopy.en.confirmRemove).props.onClick;
      const oldRefresh = button(savedDomainsCopy.en.refresh).props.onClick;
      fixture.user = { id: "account-b" }; fixture.get = async () => [row("b-only.se", 5)];
      await act(async () => renderer!.update(view()));
      const beforeReads = fixture.reads.length;
      await act(async () => { oldRemove(); oldRefresh(); });
      assert.equal(fixture.removes.length, 0); assert.equal(fixture.reads.length, beforeReads);
      assert.equal(button(savedDomainsCopy.en.refresh).props.disabled, false);
      assert.deepEqual(names(), ["b-only.se"]);
    });

    await t.test("changing or cancelling confirmation invalidates the previous row action", async () => {
      reset(); await mount(); await openRemove("alpha.co.uk");
      const oldRemove = button(savedDomainsCopy.en.confirmRemove).props.onClick;
      await openRemove("beta.se");
      await act(async () => oldRemove());
      assert.equal(fixture.removes.length, 0);
      const cancelledRemove = button(savedDomainsCopy.en.confirmRemove).props.onClick;
      await act(async () => button(savedDomainsCopy.en.cancel).props.onClick());
      await act(async () => cancelledRemove());
      assert.equal(fixture.removes.length, 0); assert.equal(names().length, 3);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, fixtureKey, originalFixture); else Reflect.deleteProperty(globalThis, fixtureKey);
    await vite.close();
  }
});

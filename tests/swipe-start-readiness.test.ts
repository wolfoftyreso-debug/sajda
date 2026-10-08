import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { Language } from "../src/i18n/LanguageProvider";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";

const origin = "https://sajda.example.test";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}
const verifiedCards: AnonymousSearchResult[] = ["alpha.dev", "bravo.dev"].map(domain => ({
  domain, tld: "dev", status: "available", checkMethod: "rdap", authoritative: true,
  source: "registry-test-fixture", registrarPrice: 0, estimatedValue: 0, confidenceScore: 0,
  rationale: "Synthetic registry response, not a live availability claim.",
}));
const languages: [Language, string, string][] = [
  ["en", "Start swiping", "Checking your account…"],
  ["sv", "Börja swajpa", "Kontrollerar ditt konto…"],
  ["es", "Empezar a deslizar", "Comprobando tu cuenta…"],
  ["fr", "Commencer à parcourir", "Vérification de votre compte…"],
  ["zh", "开始滑选", "正在检查你的账户…"],
];

// Mount the real page, settings callback, hooks and search HTTP client. Only
// provider readiness, presentational dialog wrappers and network replies are
// controlled. This is not a browser/real-session/registry integration proof.
test("mounted Swipe retains settings until account/search readiness permits an explicit start", { timeout: 20_000 }, async t => {
  const globals = ["window", "document", "HTMLElement", "__SWIPE_READINESS_TEST__", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  let completion = deferred<"complete" | "release">();
  const fixture = {
    owner: null as string | null, authLoading: true, ready: false,
    language: "en" as Language, reservations: 0, completed: 0, released: 0,
    requestAccess: () => {
      fixture.reservations++;
      if (!fixture.ready) return null;
      return {
        complete() { fixture.completed++; completion.resolve("complete"); },
        release() { fixture.released++; completion.resolve("release"); },
      };
    },
  };
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  setGlobal("__SWIPE_READINESS_TEST__", fixture);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("window", {
    location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  });
  setGlobal("document", { documentElement: { classList: { add() {}, remove() {} } } });
  setGlobal("HTMLElement", class {});
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "export const useAuth = () => ({ user: globalThis.__SWIPE_READINESS_TEST__.owner ? { id: globalThis.__SWIPE_READINESS_TEST__.owner } : null, loading: globalThis.__SWIPE_READINESS_TEST__.authLoading });"],
    ["/src/contexts/ScanContext.tsx", "export const useScan = () => ({ anonymousSearchAccessReady: globalThis.__SWIPE_READINESS_TEST__.ready, anonymousSearchCanStart: false, requestAnonymousSearchAccess: globalThis.__SWIPE_READINESS_TEST__.requestAccess });"],
    ["/src/i18n/LanguageProvider.tsx", "export const useLanguage = () => ({ language: globalThis.__SWIPE_READINESS_TEST__.language }); export const translate = (_language, key) => key;"],
    ["/src/components/ui/dialog.tsx", "import { createElement as h } from 'react'; export const Dialog = ({open,children}) => open ? h('section', {role:'dialog'}, children) : null; export const DialogContent = ({children,...props}) => h('div',props,children); export const DialogDescription = ({children}) => h('p',null,children); export const DialogFooter = ({children}) => h('footer',null,children); export const DialogHeader = ({children}) => h('header',null,children); export const DialogTitle = ({children}) => h('h2',null,children);"],
    ["/src/components/SwipeWishlistPanel.tsx", "export const SwipeWishlistPanel = () => null;"],
    ["/src/components/DomainLogoConcept.tsx", "export default function DomainLogoConcept() { return null; }"],
  ]);
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"' },
    plugins: [{ name: "swipe-readiness-test-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (normalized.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let reply = deferred<Response>();
  const requests: { tlds: string[]; count: number; locale: string; swipe: boolean }[] = [];
  const unexpectedRequests: string[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin);
    if (url.origin !== origin || url.pathname !== "/api/domain-search" || init.method !== "POST") {
      unexpectedRequests.push(`${init.method ?? "GET"} ${url}`);
      throw new Error("Unexpected request in the isolated Swipe readiness test");
    }
    requests.push(JSON.parse(String(init.body)));
    return reply.promise;
  };
  try {
    const { default: Swipe } = await vite.ssrLoadModule("/src/pages/Swipe.tsx");
    const tree = () => h(MemoryRouter, { initialEntries: ["/swipe"] }, h(Swipe));
    const dialogs = () => renderer!.root.findAllByProps({ role: "dialog" });
    const start = (name: string) => {
      const button = renderer!.root.findAllByType("button").find(node => label(node) === name);
      assert.ok(button, `Start action ${name} exists`); return button;
    };
    const selected = () => renderer!.root.findAllByType("button")
      .filter(node => node.props["aria-pressed"] === true).map(node => label(node).slice(1));
    const currentDomain = () => renderer!.root.findAllByType("div")
      .find(node => node.props.role === "group")?.props["aria-label"]?.split(",")[0];
    const update = async (values: Partial<typeof fixture>) => {
      Object.assign(fixture, values);
      await act(async () => { renderer!.update(tree()); });
    };
    const mount = async (language: Language) => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      storage.clear(); requests.length = 0; unexpectedRequests.length = 0;
      completion = deferred<"complete" | "release">(); reply = deferred<Response>();
      Object.assign(fixture, { owner: null, authLoading: true, ready: false, language, reservations: 0, completed: 0, released: 0 });
      await act(async () => { renderer = create(tree()); });
    };

    for (const [language, action, checking] of languages) {
      await t.test(`${language}: no lost start while account or allowance is pending; readiness preserves the selected endings`, async () => {
        await mount(language);
        assert.equal(dialogs().length, 1); assert.equal(requests.length, 0);
        const explanation = renderer!.root.findByProps({ id: "swipe-account-check" });
        assert.equal(explanation.props.role, "status"); assert.equal(label(explanation), checking);
        assert.equal(start(action).props.disabled, true);
        assert.equal(start(action).props["aria-describedby"], explanation.props.id);
        await act(async () => {
          const com = renderer!.root.findAllByType("button").find(node => label(node) === ".com");
          assert.ok(com); com.props.onClick();
        });
        const selection = selected();
        assert.ok(selection.includes("dev")); assert.ok(!selection.includes("com"));
        // Invoking a disabled button's callback directly proves the production
        // applySettings guard itself, rather than relying only on DOM disabling.
        await act(async () => { start(action).props.onClick(); });
        assert.equal(dialogs().length, 1); assert.deepEqual(selected(), selection);
        assert.equal(requests.length, 0); assert.equal(fixture.reservations, 0);
        assert.equal(currentDomain(), undefined);

        await update({ authLoading: false });
        assert.equal(start(action).props.disabled, true, "Resolved guest session alone cannot bypass unresolved search access");
        await act(async () => { start(action).props.onClick(); });
        assert.equal(dialogs().length, 1); assert.equal(requests.length, 0); assert.equal(fixture.reservations, 0);

        await update({ ready: true });
        assert.equal(dialogs().length, 1); assert.deepEqual(selected(), selection);
        assert.equal(renderer!.root.findAllByProps({ id: "swipe-account-check" }).length, 0);
        assert.equal(start(action).props.disabled, false);
        assert.equal(start(action).props["aria-describedby"], undefined);
        assert.equal(requests.length, 0, "Readiness is not permission to start a search automatically");
        await act(async () => {
          const begin = start(action).props.onClick;
          begin(); begin();
        });
        assert.equal(dialogs().length, 0); assert.equal(requests.length, 1); assert.equal(fixture.reservations, 1);
        assert.deepEqual(requests[0].tlds, selection);
        assert.equal(requests[0].swipe, true); assert.equal(requests[0].count, 100);
        assert.equal(requests[0].locale, language === "sv" || language === "es" ? language : "en");
        await act(async () => {
          reply.resolve(Response.json({ results: verifiedCards }));
          assert.equal(await completion.promise, "complete", "The verified deck must complete, not release, its search allowance");
        });
        assert.equal(currentDomain(), "alpha.dev"); assert.equal(fixture.completed, 1);
        assert.equal(fixture.released, 0); assert.equal(requests.length, 1, "No silent guest prefetch consumes a second search");
        assert.deepEqual(unexpectedRequests, []);
      });
    }
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    assert.deepEqual(unexpectedRequests, [], "No mocked provider error may conceal an unexpected network request");
  }
});

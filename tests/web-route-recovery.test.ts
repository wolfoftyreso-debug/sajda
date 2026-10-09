import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement as h, Fragment } from "react";
import { createMemoryRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { webRouteRecoveryCopy } from "../src/i18n/webRouteRecoveryCopy";
import { reportWebRouteError, webRouteErrorReference } from "../src/lib/webRouteError";
import type { Language } from "../src/i18n/languagePreference";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");

test("web app wires its own fallback and sanitized diagnostics without changing native routing", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /path: "\*"[^\n]+errorElement: <WebRouteRecovery \/>/u);
  assert.match(source, /<RouterProvider router=\{getRouter\(\)\} onError=\{reportWebRouteError\}/u);
  assert.match(source, /<WebRecoveryFocus \/>/u);
  const native = readFileSync(new URL("../src/app/NativeApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(native, /WebRouteRecovery|WebRecoveryFocus|reportWebRouteError/u);
});

test("browser diagnostics retain an ephemeral reference/classification, never raw error or URL data", () => {
  const original = console.error;
  const messages: string[] = [];
  console.error = value => { messages.push(String(value)); };
  try {
    const secret = "synthetic-private-input-do-not-display";
    const error = new Error(secret);
    error.stack = `private-stack ${secret}`;
    reportWebRouteError(error);
    const event = JSON.parse(messages[0]);
    assert.deepEqual(Object.keys(event).sort(), ["clientReference", "event", "kind"]);
    assert.equal(event.event, "web_screen_failed"); assert.equal(event.kind, "render_error");
    assert.equal(event.clientReference, webRouteErrorReference(error));
    assert.match(event.clientReference, /^web-[a-zA-Z0-9-]{10,40}$/u);
    assert.equal(webRouteErrorReference(error), webRouteErrorReference(error));
    assert.notEqual(webRouteErrorReference(new Error(secret)), event.clientReference);
    assert.equal(messages.join(" ").includes(secret), false);
    reportWebRouteError({ status: 503, statusText: "private-status", internal: false, data: { token: secret } });
    const response = JSON.parse(messages[1]);
    assert.equal(response.kind, "route_response"); assert.equal(response.status, 503);
    assert.equal(messages.join(" ").includes("private-status"), false);
    assert.equal(messages.join(" ").includes(secret), false);
    const unusual = new Proxy({}, { get() { throw new Error(secret); } });
    assert.doesNotThrow(() => reportWebRouteError(unusual));
    assert.equal(JSON.parse(messages[2]).kind, "unknown");
    assert.equal(messages.join(" ").includes(secret), false);
  } finally { console.error = original; }
});

test("mounted web router failures are localized, manually recoverable and restore scroll/focus", async t => {
  const fixtureKey = "__SAJDA_WEB_RECOVERY_TEST__";
  const originals = new Map([fixtureKey, "window", "document", "MutationObserver"].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalError = console.error;
  const originalFetch = globalThis.fetch;
  const fixture = { language: "en" as Language, fail: true, reloadThrows: false, reloads: 0, redirectAccount: false,
    headingAvailable: false, focuses: [] as Array<{ target: string; options: unknown }>,
    scrolls: [] as unknown[], logs: [] as string[], renders: 0 };
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const observers: Array<{ callback: () => void; connected: boolean }> = [];
  let nextId = 0;
  const healthyHeading = { hasAttribute: () => false, setAttribute() {},
    focus: (options: unknown) => fixture.focuses.push({ target: "healthy-heading", options }) };
  const window = {
    history: { scrollRestoration: "auto" },
    location: { reload: () => { fixture.reloads++; if (fixture.reloadThrows) throw new Error("blocked-browser-reload"); } },
    scrollTo: (options: unknown) => { fixture.scrolls.push(options); },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void) => { timers.set(++nextId, callback); return nextId; },
    clearTimeout: (id: number) => timers.delete(id),
    addEventListener: (name: string, callback: (event: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback);
    },
    removeEventListener: (name: string, callback: (event: unknown) => void) => listeners.get(name)?.delete(callback),
  };
  const document = { body: {}, querySelector: () => fixture.headingAvailable ? healthyHeading : null };
  class Observer {
    entry: { callback: () => void; connected: boolean };
    constructor(callback: () => void) { this.entry = { callback, connected: false }; observers.push(this.entry); }
    observe() { this.entry.connected = true; }
    disconnect() { this.entry.connected = false; }
  }
  for (const [key, value] of Object.entries({ [fixtureKey]: fixture, window, document, MutationObserver: Observer })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  console.error = (...values: unknown[]) => { fixture.logs.push(values.map(String).join(" ")); };
  globalThis.fetch = async () => { throw new Error("Recovery tests must not call providers or replay actions"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "web-recovery-language-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${fixtureKey}.language});`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let router: ReturnType<typeof createMemoryRouter> | undefined;
  const secret = "synthetic-secret-in-route-error";
  const error = new Error(secret);
  error.stack = `private-error-stack ${secret}`;
  try {
    const { default: Recovery } = await vite.ssrLoadModule("/src/components/WebRouteRecovery.tsx");
    const { default: Focus } = await vite.ssrLoadModule("/src/components/WebRecoveryFocus.tsx");
    const { reportWebRouteError: report } = await vite.ssrLoadModule("/src/lib/webRouteError.ts");
    function Page() {
      const location = useLocation(); fixture.renders++;
      if (fixture.fail) throw error;
      if (fixture.redirectAccount && location.pathname === "/account") return h(Navigate, { replace: true, to: "/auth?next=%2Faccount" });
      return h("main", { "data-recovered-route": location.pathname }, h("h1", null, "Healthy page"));
    }
    async function mount(entry = "/projects?token=synthetic-url-secret#private") {
      if (renderer) await act(async () => renderer!.unmount());
      router?.dispose(); fixture.headingAvailable = false;
      router = createMemoryRouter([{ path: "*", element: h(Fragment, null, h(Focus), h(Page)), errorElement: h(Recovery) }], { initialEntries: [entry] });
      await act(async () => { renderer = create(h(RouterProvider, { router: router!, onError: report }), {
        createNodeMock: element => element.type === "h1" ? { focus: (options: unknown) => fixture.focuses.push({ target: element.props.id, options }) } : null,
      }); });
    }
    const root = () => renderer!.root;
    const button = () => root().findByType("button");
    const click = async (link: ReactTestInstance) => {
      await act(async () => link.props.onClick({ button: 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; } }));
    };

    for (const language of ["en", "sv", "es", "fr", "zh"] as Language[]) {
      await t.test(`${language}: fallback keeps the exact URL, truthful state and no raw exception details`, async () => {
        fixture.language = language; fixture.fail = true; const reloads = fixture.reloads;
        await mount();
        const copy = webRouteRecoveryCopy[language];
        assert.equal(text(root().findByType("h1")), copy.title);
        assert.ok(text(root()).includes(copy.body)); assert.ok(text(root()).includes(copy.warning));
        assert.ok(text(root()).includes(copy.referenceHint));
        assert.equal(text(root()).includes(secret), false); assert.equal(text(root()).includes("private-error-stack"), false);
        assert.equal(text(root()).includes("synthetic-url-secret"), false);
        assert.equal(router!.state.location.pathname, "/projects");
        assert.equal(router!.state.location.search, "?token=synthetic-url-secret");
        assert.equal(router!.state.location.hash, "#private");
        assert.equal(fixture.reloads, reloads);
        assert.equal(root().findByType("h1").props.tabIndex, -1);
        assert.ok(fixture.focuses.some(call => call.target === "web-page-error-title"));
        assert.deepEqual(fixture.scrolls.at(-1), { top: 0, left: 0, behavior: "instant" });
        assert.equal(window.history.scrollRestoration, "manual");
        assert.ok(root().findAllByType("a").some(link => link.props.href === "mailto:dev@hypbit.com"));
        assert.match(button().props.className, /min-h-11/);
        const event = fixture.logs.filter(line => line.startsWith('{"event":"web_screen_failed"')).at(-1)!;
        const parsed = JSON.parse(event);
        assert.equal(parsed.clientReference, text(root().findByProps({ "data-web-error-reference": true })));
        assert.equal(parsed.kind, "render_error");
        assert.equal(event.includes(secret), false); assert.equal(event.includes("token="), false);
        assert.equal(fixture.logs.some(line => line.includes("React Router caught the following error")), false);
      });
    }

    await t.test("a persistent homepage failure has no search self-link or automatic retry", async () => {
      fixture.language = "en"; const reloads = fixture.reloads; await mount("/");
      const renders = fixture.renders;
      assert.equal(root().findAllByType("a").some(link => link.props.href === "/"), false);
      await act(async () => { for (const callback of frames.values()) callback(0); frames.clear(); });
      await act(async () => { renderer!.update(h(RouterProvider, { router: router!, onError: report })); });
      assert.equal(fixture.renders, renders);
      assert.equal(fixture.reloads, reloads);
      const reload = button().props.onClick;
      await act(async () => { reload(); reload(); });
      assert.equal(fixture.reloads, reloads + 1);
      assert.equal(button().props.disabled, true);
      assert.equal(text(button()), webRouteRecoveryCopy.en.reloading);
    });

    await t.test("a browser reload exception remains recoverable without exposing its details", async () => {
      fixture.reloadThrows = true; await mount();
      await act(async () => button().props.onClick());
      assert.equal(button().props.disabled, false);
      assert.equal(text(root().findByProps({ role: "alert" })), webRouteRecoveryCopy.en.reloadFailed);
      assert.equal(text(root()).includes("blocked-browser-reload"), false);
      fixture.reloadThrows = false;
    });

    await t.test("search recovery reaches the actual destination and focuses a lazy heading once", async () => {
      await mount(); fixture.fail = false;
      const search = root().findAllByType("a").find(link => link.props.href === "/")!;
      await click(search);
      assert.equal(router!.state.location.pathname, "/"); assert.equal(router!.state.location.search, "");
      assert.deepEqual(router!.state.location.state, { sajdaRecoveryFocus: true });
      assert.equal(root().findByType("main").props["data-recovered-route"], "/");
      assert.equal(window.history.scrollRestoration, "auto");
      assert.equal(observers.filter(observer => observer.connected).length, 1);
      fixture.headingAvailable = true;
      const before = fixture.focuses.filter(call => call.target === "healthy-heading").length;
      await act(async () => { for (const observer of observers.filter(value => value.connected)) observer.callback(); });
      assert.equal(fixture.focuses.filter(call => call.target === "healthy-heading").length, before + 1);
      assert.equal(observers.filter(observer => observer.connected).length, 0);
      assert.equal(timers.size, 0);
      assert.equal(frames.size, 0);
    });

    await t.test("account recovery uses the exact account route and avoids its own self-link", async () => {
      fixture.fail = true; await mount("/account");
      assert.equal(root().findAllByType("a").some(link => link.props.href === "/account"), false);
      await mount("/brand-index/assessment"); fixture.fail = false; fixture.headingAvailable = true;
      await click(root().findAllByType("a").find(link => link.props.href === "/account")!);
      assert.equal(router!.state.location.pathname, "/account");
      assert.equal(root().findByType("main").props["data-recovered-route"], "/account");
    });

    await t.test("a protected account redirect retains recovery focus without rewriting its auth URL", async () => {
      fixture.fail = true; await mount(); fixture.fail = false; fixture.redirectAccount = true;
      await click(root().findAllByType("a").find(link => link.props.href === "/account")!);
      assert.equal(router!.state.location.pathname, "/auth");
      assert.equal(router!.state.location.search, "?next=%2Faccount");
      assert.equal(router!.state.location.state, null);
      assert.equal(observers.filter(observer => observer.connected).length, 1);
      fixture.headingAvailable = true;
      const before = fixture.focuses.filter(call => call.target === "healthy-heading").length;
      await act(async () => { for (const observer of observers.filter(value => value.connected)) observer.callback(); });
      assert.equal(fixture.focuses.filter(call => call.target === "healthy-heading").length, before + 1);
      assert.equal(observers.filter(observer => observer.connected).length, 0);
      fixture.redirectAccount = false;
    });

    await t.test("missing recovery headings time out and normal navigation does not gain focus work", async () => {
      fixture.fail = true; await mount(); fixture.fail = false;
      await click(root().findAllByType("a").find(link => link.props.href === "/")!);
      assert.equal(observers.filter(observer => observer.connected).length, 1);
      await act(async () => { for (const callback of [...timers.values()]) callback(); });
      assert.equal(observers.filter(observer => observer.connected).length, 0);
      assert.equal(timers.size, 0);
      const before = fixture.focuses.length;
      await act(async () => { await router!.navigate("/watchlist"); });
      assert.equal(observers.filter(observer => observer.connected).length, 0);
      assert.equal(timers.size, 0);
      assert.equal(fixture.focuses.length, before);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    router?.dispose(); await vite.close(); console.error = originalError; globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

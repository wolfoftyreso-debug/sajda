import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("public console recovers after a deadline, deduplicates clicks and cancels on navigation", async t => {
  const originals = new Map(["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://sajda.test" } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { title: "Sajda" } });
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(input, "/api/v1/public/domains");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    assert.equal(JSON.parse(String(init.body)).count, 3);
    const signal = init.signal as AbortSignal;
    assert.ok(signal);
    return new Promise((resolve, reject) => {
      requests.push({ signal, resolve });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  const stubbedComponents = new Set([
    "LanguageSwitcher", "ConnectorSetup", "NamePackageApiGuide", "BrandIndexApiGuide", "BrandLookupApiGuide",
  ]);
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: "automatic" }, plugins: [{ name: "public-console-fixtures", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null,loading:false});";
      if (file.endsWith("/src/integrations/neon/auth.ts")) return "export const isAccountAuthConfigured=false;export const readAccountSession=async()=>null;";
      if (file.endsWith("/src/lib/localTestMode.ts")) return "export const isLocalTestMode=()=>false;";
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if ([...stubbedComponents].some(name => file.endsWith(`/src/components/${name}.tsx`))) return "export default function Stub(){return null;}";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Developers } = await vite.ssrLoadModule("/src/pages/Developers.tsx");
    await act(async () => { renderer = create(h(MemoryRouter, null, h(Developers))); });
    const root = () => renderer!.root;
    const button = (text: string) => root().findAllByType("button").find(node => label(node) === text)!;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const run = button("Run live example");
    await act(async () => { void run.props.onClick(); void run.props.onClick(); });
    assert.equal(requests.length, 1, "A rapid second click must not consume another public request");
    assert.equal(button("Requesting…").props.disabled, true);
    await act(async () => { t.mock.timers.tick(34_999); });
    assert.equal(requests[0].signal.aborted, false);
    await act(async () => { t.mock.timers.tick(1); });
    assert.equal(requests[0].signal.reason.name, "TimeoutError");
    assert.ok(label(root()).includes("The search took too long."));
    assert.equal(button("Run live example").props.disabled, false, "Timeout must restore the retry action");

    await act(async () => { void button("Run live example").props.onClick(); });
    const result = { checked: 3, available: 2, unknown: 0, results: [{ domain: "synthetic-fixture.test", status: "available" }] };
    await act(async () => { requests[1].resolve(Response.json(result)); });
    assert.ok(label(root()).includes("synthetic-fixture.test"));
    assert.equal(label(root()).includes("The search took too long."), false);
    await act(async () => { t.mock.timers.tick(35_000); });
    assert.equal(requests[1].signal.aborted, false, "A completed request must release its deadline");

    await act(async () => { void button("Run live example").props.onClick(); });
    await act(async () => { requests[2].resolve(new Response("Gateway unavailable", { status: 503 })); });
    assert.ok(label(root()).includes("The request could not be completed."));
    assert.equal(label(root()).includes("Gateway unavailable"), false, "Raw gateway output must not appear as a domain result");
    assert.equal(button("Run live example").props.disabled, false);

    await act(async () => { void button("Run live example").props.onClick(); });
    await act(async () => { renderer!.unmount(); renderer = undefined; });
    assert.equal(requests[3].signal.aborted, true, "Leaving the page must abort the browser request");
    assert.equal(requests[3].signal.reason.name, "AbortError");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await vite.close();
  }
});

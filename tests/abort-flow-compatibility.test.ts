import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

test("native sign-in and FX requests use disposable deadlines without new AbortSignal methods", async t => {
  const key = "__SAJDA_ABORT_FLOW_TEST__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  const assigned: string[] = [];
  const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const fx: AbortSignal[] = [];
  const fixture = { user: { id: "owner-a", email: "qa@example.test" }, loading: false, fx,
    fxFetch: async (_input: unknown, init: RequestInit) => { fx.push(init.signal as AbortSignal); return Response.json({}); } };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { assign: (value: string) => assigned.push(value) } } });
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
  globalThis.fetch = async (_input, init) => new Promise(resolve => requests.push({ signal: init!.signal as AbortSignal, resolve }));
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "abort-flow-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>globalThis.${key};`;
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (name.endsWith("/src/lib/productFetch.ts")) return `export const productFetch=(...args)=>globalThis.${key}.fxFetch(...args);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const state = "s".repeat(32);
  const callback = `com.hypbit.sajda://auth/callback?state=${state}&code=${"c".repeat(43)}`;
  try {
    const { default: NativeConnect } = await vite.ssrLoadModule("/src/pages/NativeConnect.tsx");
    const { useReferenceFx } = await vite.ssrLoadModule("/src/hooks/useReferenceFx.ts");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const element = () => h(MemoryRouter, { initialEntries: [`/native/connect?challenge=${"p".repeat(43)}&state=${state}`] }, h(NativeConnect));
    const mount = async () => { if (renderer) await act(async () => renderer!.unmount()); await act(async () => { renderer = create(element()); }); };
    const click = async () => act(async () => renderer!.root.findByType("button").props.onClick());
    const resolveLatest = async () => act(async () => requests.at(-1)!.resolve(Response.json({ callback })));

    await t.test("success clears deadline and double-click creates only one auth request", async () => {
      await mount(); await click(); await click();
      assert.equal(requests.length, 1);
      await resolveLatest();
      assert.deepEqual(assigned, [callback]);
      t.mock.timers.tick(20001);
      assert.equal(requests[0].signal.aborted, false, "finally disposed the successful request timer");
    });
    await t.test("timeout rejects even a transport that ignores abort and returns a late valid grant", async () => {
      await mount(); await click();
      await act(async () => t.mock.timers.tick(20000));
      assert.equal(requests.at(-1)!.signal.aborted, true);
      await resolveLatest();
      assert.equal(assigned.length, 1);
      assert.equal(renderer!.root.findAll(node => node.props.role === "alert").length, 1);
    });
    await t.test("leaving or switching accounts cancels the old grant and cannot navigate later", async () => {
      await mount(); await click();
      fixture.user = { ...fixture.user, id: "owner-b" };
      await act(async () => renderer!.update(element()));
      assert.equal(requests.at(-1)!.signal.aborted, true);
      await resolveLatest();
      assert.equal(assigned.length, 1);
      await click();
      await act(async () => renderer!.unmount()); renderer = undefined;
      assert.equal(requests.at(-1)!.signal.aborted, true);
      await resolveLatest();
      assert.equal(assigned.length, 1);
    });
    await t.test("FX success clears the request deadline while preserving shared cache behavior", async () => {
      const Fx = () => { useReferenceFx(); return h("div"); };
      await act(async () => { renderer = create(h(Fx)); });
      assert.equal(fx.length, 1);
      await act(async () => t.mock.timers.tick(7001));
      assert.equal(fx[0].aborted, false);
      assert.equal(fx.length, 1);
      await act(async () => renderer!.unmount()); renderer = undefined;
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    t.mock.timers.reset();
    await vite.close();
    globalThis.fetch = originalFetch;
    if (originalTimeout) Object.defineProperty(AbortSignal, "timeout", originalTimeout); else Reflect.deleteProperty(AbortSignal, "timeout");
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});

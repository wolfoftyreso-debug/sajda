import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { AI_CONSENT_VERSION } from "../shared/ai-consent";
import { aiPrivacyCopy } from "../src/i18n/aiPrivacyCopy";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("mounted consent is explicit in five languages, persistent, revocable and identical for web/native requests", async t => {
  const key = "__SAJDA_AI_PRIVACY_TEST__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  const storageListeners = new Set<(event: { key: string | null }) => void>();
  const fixture = { language: "en", webCalls: [] as unknown[], nativeCalls: [] as unknown[] };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (name: string) => storage.get(name) ?? null, setItem: (name: string, value: string) => storage.set(name, value) },
    addEventListener: (name: string, fn: (event: { key: string | null }) => void) => { if (name === "storage") storageListeners.add(fn); },
    removeEventListener: (name: string, fn: (event: { key: string | null }) => void) => { if (name === "storage") storageListeners.delete(fn); },
  } });
  globalThis.fetch = async (_input, init) => { fixture.webCalls.push(JSON.parse(String(init?.body))); return Response.json({}); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "ai-privacy-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (name.endsWith("/src/lib/appSurface.ts")) return "export let isNativeApp=false; export const setNative=(value)=>{isNativeApp=value;};";
      if (name.endsWith("/src/lib/nativeTransport.ts")) return `export const nativeRequest=async(path,method,body)=>{globalThis.${key}.nativeCalls.push(body);return Response.json({});};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Control } = await vite.ssrLoadModule("/src/components/AiPrivacyControl.tsx");
    const consent = await vite.ssrLoadModule("/src/lib/aiConsent.ts");
    const surface = await vite.ssrLoadModule("/src/lib/appSurface.ts");
    const { productFetch } = await vite.ssrLoadModule("/src/lib/productFetch.ts");
    const mount = async () => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, {}, h(Control))); });
    };
    const click = async (text: string) => act(async () => renderer!.root.findAllByType("button").find(button => label(button) === text)!.props.onClick());
    for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
      await t.test(`${language}: explicit opt-in and opt-out without product actions`, async () => {
        fixture.language = language;
        consent.setAiPermission(false);
        await mount();
        const copy = aiPrivacyCopy[language];
        assert.equal(label(renderer!.root.findByType("h3")), `${copy.title} · ${copy.off}`);
        assert.match(label(renderer!.root), /Google Gemini/);
        assert.match(label(renderer!.root), /Vercel AI Gateway/);
        assert.ok(renderer!.root.findAllByType("a").some(anchor => anchor.props.href === "/legal#privacy"));
        for (const button of renderer!.root.findAllByType("button")) assert.equal(button.props.type, "button");
        await click(copy.decline);
        assert.equal(consent.hasAiPermission(), false);
        await click(copy.allow);
        assert.equal(consent.hasAiPermission(), true);
        await mount();
        assert.equal(label(renderer!.root.findByType("h3")), `${copy.title} · ${copy.on}`);
        await click(copy.revoke);
        assert.equal(consent.hasAiPermission(), false);
        assert.equal(fixture.webCalls.length + fixture.nativeCalls.length, 0, "choice never submits user data");
      });
    }
    await t.test("both actual transport branches use current body consent, never a header or stale caller value", async () => {
      for (const native of [false, true]) {
        surface.setNative(native);
        const calls = native ? fixture.nativeCalls : fixture.webCalls;
        for (const enabled of [false, true, false]) {
          await act(async () => consent.setAiPermission(enabled));
          await productFetch("/api/domain-search", { method: "POST", body: JSON.stringify({ advanced: true, brief: "public test fixture", aiConsent: { version: "stale", accepted: true } }) });
          assert.deepEqual((calls.at(-1) as { aiConsent?: unknown }).aiConsent, enabled ? { version: AI_CONSENT_VERSION, accepted: true } : undefined);
        }
      }
    });
    await t.test("cross-tab revoke and clear events update the mounted screen", async () => {
      fixture.language = "en";
      await mount();
      await act(async () => consent.setAiPermission(true));
      await act(async () => { storage.clear(); for (const listener of storageListeners) listener({ key: null }); });
      assert.equal(label(renderer!.root.findByType("h3")), `${aiPrivacyCopy.en.title} · ${aiPrivacyCopy.en.off}`);
      assert.equal(consent.aiPermissionForRequest(), undefined);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    for (const [name, value] of originals) { if (value) Object.defineProperty(globalThis, name, value); else Reflect.deleteProperty(globalThis, name); }
  }
});

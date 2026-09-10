import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeExportCopy } from "../src/app/nativeExportCopy";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("native SVG and HTML exports use the OS share sheet, never blob navigation", async t => {
  const key = "__NATIVE_ARTIFACT_EXPORT_TEST__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const files: { filename: string; content: string }[] = [];
  const storage = new Map();
  const fixture = { language: "en", share: async (filename: string, content: string): Promise<{ completed: boolean }> => { files.push({ filename, content }); return { completed: true }; } };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "capacitor://localhost", href: "capacitor://localhost/" }, setTimeout, clearTimeout,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } } });
  globalThis.fetch = async () => { throw new Error("Generated exports must not call external services"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_SAJDA_SURFACE": '"native"', "import.meta.env.VITE_NATIVE_API_ORIGIN": '"https://sajda-test-hypbit.vercel.app"' },
    plugins: [{ name: "native-export-test-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>globalThis.${key};`;
      if (name.endsWith("/src/lib/nativeTransport.ts")) return `export const nativeShareFile=(...args)=>globalThis.${key}.share(...args);`;
      if (name.endsWith("/src/components/ui/dialog.tsx")) return `import{createElement as h}from'react';const Wrapper=({children})=>h('div',null,children);export{Wrapper as Dialog,Wrapper as DialogContent,Wrapper as DialogDescription,Wrapper as DialogFooter,Wrapper as DialogHeader,Wrapper as DialogTitle};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const mount = async (element: ReturnType<typeof h>) => { if (renderer) await act(async () => renderer!.unmount()); await act(async () => { renderer = create(element); }); };
  const button = (name: string) => { const found = renderer!.root.findAllByType("button").find(node => label(node) === name); assert.ok(found, name); return found; };
  try {
    const { default: Logo } = await vite.ssrLoadModule("/src/components/DomainLogoConcept.tsx");
    const { default: Landing } = await vite.ssrLoadModule("/src/components/SaleLandingGenerator.tsx");
    const { marketplacePublicUrl } = await vite.ssrLoadModule("/src/lib/appSurface.ts");

    await t.test("a native marketplace share URL uses the compiled backend, not the webview origin", () => {
      assert.equal(marketplacePublicUrl("listing-123"), "https://sajda-test-hypbit.vercel.app/marketplace/listing-123");
      assert.equal(marketplacePublicUrl("../foreign?x=1"), "https://sajda-test-hypbit.vercel.app/marketplace/..%2Fforeign%3Fx%3D1");
    });

    await t.test("SVG exports preserve generated content and prevent duplicate sheets", async () => {
      await mount(h(Logo, { domain: "example.dev" }));
      const open = renderer!.root.findAllByType("button").find(node => node.props["aria-label"] === "Create a logo: example.dev")
        ?? renderer!.root.findAllByType("button").find(node => String(node.props["aria-label"] ?? "").endsWith(": example.dev"));
      assert.ok(open);
      await act(async () => { open.props.onClick(); });
      const pending = deferred<{ completed: boolean }>();
      fixture.share = async (filename, content) => { files.push({ filename, content }); return pending.promise; };
      const before = files.length;
      await act(async () => { button("Save or share SVG").props.onClick(); button("Save or share SVG").props.onClick(); });
      assert.equal(files.length, before + 1);
      assert.equal(files.at(-1)!.filename, "example-dev-logo-study.svg");
      assert.match(files.at(-1)!.content, /^<svg/u);
      assert.match(files.at(-1)!.content, /example\.dev/u);
      assert.equal(button("Save or share SVG").props.disabled, true);
      await act(async () => { pending.resolve({ completed: false }); });
      assert.equal(button("Save or share SVG").props.disabled, false);
      assert.ok(label(renderer!.root).includes(nativeExportCopy.en.cancelled));
    });

    await t.test("HTML export preserves escaping and reports failures/cancellation truthfully", async () => {
      const props = { domain: "example.dev", price: 100, currency: "USD", description: '<script>alert("x")</script>', listingUrl: marketplacePublicUrl("listing-123") };
      await mount(h(Landing, props));
      fixture.share = async (filename, content) => { files.push({ filename, content }); return { completed: true }; };
      await act(async () => { button("Save or share HTML").props.onClick(); });
      assert.equal(files.at(-1)!.filename, "index.html");
      assert.match(files.at(-1)!.content, /<!DOCTYPE html>/iu);
      assert.doesNotMatch(files.at(-1)!.content, /<script>/u);
      assert.match(files.at(-1)!.content, /&lt;script&gt;/u);
      assert.match(files.at(-1)!.content, /https:\/\/sajda-test-hypbit\.vercel\.app\/marketplace\/listing-123/u);
      assert.ok(label(renderer!.root).includes(nativeExportCopy.en.completed));
      fixture.share = async () => { throw new Error("Private OS error must not be shown"); };
      await act(async () => { button("Save or share HTML").props.onClick(); });
      assert.ok(label(renderer!.root).includes(nativeExportCopy.en.failed));
      assert.doesNotMatch(label(renderer!.root), /Private OS error/u);
      assert.equal(button("Save or share HTML").props.disabled, false);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, original] of originals) { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); }
  }
});

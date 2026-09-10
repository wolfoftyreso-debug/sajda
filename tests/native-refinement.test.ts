import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nativeApiOrigin } from "../scripts/build-native.mjs";

const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("native build accepts only public HTTPS DNS origins, never private or normalized IP literals", () => {
  for (const origin of ["https://sajda-test-hypbit.vercel.app", "https://app.example.com/"]) assert.equal(nativeApiOrigin(origin), origin.replace(/\/$/u, ""));
  for (const origin of [undefined, "", "http://app.example.com", "https://app.example.com:444", "https://user:secret@app.example.com", "https://app.example.com/auth", "https://app.example.com/?key=x", "https://app.example.com/#fragment",
    "https://localhost", "https://device.localhost", "https://device.local", "https://device.internal", "https://device.invalid", "https://device.test", "https://localhost.",
    "https://127.0.0.1", "https://2130706433", "https://0x7f000001", "https://10.0.0.1", "https://172.16.0.1", "https://169.254.169.254", "https://192.168.1.1", "https://8.8.8.8", "https://[::1]", "https://[2606:4700:4700::1111]"]) {
    assert.throws(() => nativeApiOrigin(origin), Error, String(origin));
  }
});

test("native fixed navigation honors landscape safe areas and viewport fallbacks", () => {
  const css = readFileSync("src/app/native.css", "utf8");
  const navigation = css.match(/\.sajda-native-navigation\s*\{([^}]+)\}/u)?.[1] ?? "";
  for (const side of ["left", "right", "bottom"]) assert.ok(navigation.includes(`env(safe-area-inset-${side}, 0px)`), side);
  assert.match(css, /min-height: 100vh;\s*min-height: 100dvh;/u);
  assert.match(css, /height: calc\(100vh[^;]+;\s*height: calc\(100dvh/u);
});

test("native route failures retain localized, explicit recovery and reset on navigation", async t => {
  const key = "__NATIVE_ROUTE_REFINEMENT__";
  const originals = new Map([key, "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalError = console.error;
  const fixture = { language: "en", reloads: 0 };
  const errors: unknown[][] = [];
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { reload() { fixture.reloads++; } } } });
  console.error = (...args) => { errors.push(args); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "native-recovery-language-fixture", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>globalThis.${key};`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: Boundary } = await vite.ssrLoadModule("/src/app/NativeRouteBoundary.tsx");
    function BrokenScreen(): never { throw new Error("private-report-content-must-not-be-shown"); }
    const tree = () => h(MemoryRouter, { initialEntries: ["/plus"] }, h("nav", null, h(Link, { to: "/help" }, "Help")), h(Boundary, null,
      h(Routes, null, h(Route, { path: "/plus", element: h(BrokenScreen) }), h(Route, { path: "/", element: h("h1", null, "Search restored") }), h(Route, { path: "/help", element: h("h1", null, "Help restored") }))));
    for (const [language, title] of [["en", "This screen could not be opened"], ["sv", "Sidan kunde inte öppnas"], ["es", "No se ha podido abrir esta pantalla"], ["fr", "Cet écran n’a pas pu s’ouvrir"], ["zh", "无法打开此页面"]]) {
      await t.test(`${language}: a failed screen is recoverable without losing navigation`, async () => {
        if (renderer) await act(async () => renderer!.unmount());
        fixture.language = language;
        await act(async () => { renderer = create(tree()); });
        assert.equal(label(renderer!.root.findByProps({ role: "alert" })), title);
        assert.equal(renderer!.root.findByType("h1").props.role, undefined, "The error announcement must preserve heading semantics");
        assert.equal(renderer!.root.findByType("nav").findByType("a").props.href, "/help");
        assert.doesNotMatch(label(renderer!.root), /private-report-content/u);
        await act(async () => { renderer!.root.findByType("button").props.onClick(); });
        const back = renderer!.root.findAllByType("a").find(node => node.props.href === "/")!;
        await act(async () => { back.props.onClick({ button: 0, preventDefault() {}, defaultPrevented: false }); });
        assert.equal(label(renderer!.root.findByType("h1")), "Search restored");
        assert.equal(renderer!.root.findAllByProps({ role: "alert" }).length, 0);
      });
    }
    assert.equal(fixture.reloads, 5);
    const diagnostic = errors.filter(args => typeof args[0] === "string" && args[0].startsWith('{"event":'));
    assert.equal(diagnostic.length, 5);
    assert.equal(diagnostic.every(args => args.length === 1 && args[0] === '{"event":"native_screen_failed"}'), true);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); console.error = originalError;
    for (const [name, original] of originals) { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); }
  }
});

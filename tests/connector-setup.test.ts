import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { connectorCopy } from "../src/i18n/connectorCopy";
import type { Language } from "../src/i18n/languagePreference";
import { PUBLIC_CONNECTOR_ORIGIN } from "../src/lib/publicConnector";

const languages: Language[] = ["en", "sv", "es", "fr", "zh"];
const c = connectorCopy.en;
const origin = "https://sajda-test-hypbit.vercel.app";
const endpoint = origin + "/api/mcp/public";
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");

test("connector instructions have complete five-language copy and retain budget and access boundaries", () => {
  const keys = Object.keys(c).sort();
  assert.deepEqual(Object.keys(connectorCopy).sort(), [...languages].sort());
  for (const language of languages) {
    const copy = connectorCopy[language];
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim(), `${language}.${key}`);
      assert.equal(value, value.trim());
      assert.doesNotMatch(value, /\uFFFD|<[^>]+>|\{\w+\}/u);
    }
    assert.match(copy.prompt, /10/u); assert.match(copy.prompt, /30/u); assert.match(copy.prompt, /USD/u);
    assert.match(copy.privateBody, /MCP/u); assert.match(copy.privateBody, /API/u);
    assert.match(copy.noAuth, /Streamable HTTP/u);
    if (language !== "en") for (const key of ["title", "lead", "prompt", "priceHint", "copyError", "privacy", "listing", "verification"] as const) {
      assert.notEqual(copy[key], c[key], `${language}.${key} is translated`);
    }
  }
  assert.match(c.prompt, /up to 10/u); assert.match(c.prompt, /Return fewer/u);
  assert.match(c.priceHint, /published extension prices/u);
  assert.match(c.pricing, /not exact checkout quotes/u);
  assert.match(c.privacy, /cannot read your account.*cannot buy domains/u);
  assert.match(c.listing, /not a directory listing/u);
  assert.match(c.verification, /not yet been verified/u);
  assert.match(c.limits, /not unlimited/u);
});

test("real ConnectorSetup renders usable instructions and honest clipboard outcomes without API activity", async t => {
  const originals = new Map(["navigator", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  let write: (value: string) => Promise<void> = async value => { writes.push(value); };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: (value: string) => write(value) } } });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  globalThis.fetch = async () => { throw new Error("Displaying or copying connector instructions must not call an API"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: ConnectorSetup } = await vite.ssrLoadModule("/src/components/ConnectorSetup.tsx");
    const root = () => renderer!.root;
    const text = () => label(root());
    const button = (name: string) => {
      const found = root().findAllByType("button").find(node => label(node) === name);
      assert.ok(found, `Missing button ${name}`); return found;
    };
    const link = (name: string) => {
      const found = root().findAllByType("a").find(node => label(node) === name);
      assert.ok(found, `Missing link ${name}`); return found;
    };
    const click = async (name: string) => act(async () => { button(name).props.onClick(); await pause(); });
    const mount = async (language: Language = "en", url = origin) => {
      if (renderer) await act(async () => renderer!.unmount());
      writes.length = 0; write = async value => { writes.push(value); };
      await act(async () => { renderer = create(h(ConnectorSetup, { language, origin: url })); });
    };

    await t.test("public URL and read-only boundaries are clear without a login, key or network call", async () => {
      await mount();
      assert.equal(root().findByType("section").props.id, "ai-assistants");
      assert.equal(root().findByType("h2").children.join(""), c.title);
      assert.equal(root().findByType("code").children.join(""), endpoint);
      assert.ok(text().includes(c.noAccount)); assert.ok(text().includes(c.priceHint));
      assert.ok(text().includes(c.listing)); assert.ok(text().includes(c.verification));
      assert.equal(link(c.privateAction).props.href, "#mcp");
      assert.equal(root().findAllByType("form").length, 0);
      assert.equal(writes.length, 0);
      await click(c.copyUrl); assert.deepEqual(writes, [endpoint]);
      assert.ok(button(c.urlCopied));
      await click(c.copyPrompt); assert.equal(writes.at(-1), c.prompt); assert.ok(button(c.promptCopied));
    });

    await t.test("each assistant has three steps and an official setup link, not a fabricated install route", async () => {
      await mount();
      assert.equal(link(c.chatgptAction).props.href, "https://chatgpt.com/plugins");
      assert.equal(link(c.documentation).props.href, "https://developers.openai.com/plugins/deploy/connect-chatgpt");
      assert.equal(root().findAllByType("li").length, 3);
      for (const client of ["Claude", "Grok", "ChatGPT"]) {
        await click(client);
        assert.equal(button(client).props["aria-pressed"], true);
        assert.equal(root().findAllByType("li").length, 3);
        const region = root().findByProps({ role: "region" });
        assert.equal(button(client).props["aria-controls"], region.props.id);
        assert.equal(region.props["aria-labelledby"], button(client).props.id);
      }
      await click("Claude");
      const claude = new URL(link(c.claudeAction).props.href);
      assert.equal(claude.origin + claude.pathname, "https://claude.ai/customize/connectors");
      assert.deepEqual(Object.fromEntries(claude.searchParams), { modal: "add-custom-connector", connectorName: "Sajda", connectorUrl: endpoint });
      assert.ok(text().includes(c.claudeNote));
      await click("Grok");
      assert.equal(link(c.grokAction).props.href, "https://grok.com/connectors");
      assert.equal(link(c.documentation).props.href, "https://docs.x.ai/grok/connectors");
      for (const node of root().findAllByType("a").filter(node => node.props.target === "_blank")) {
        assert.match(node.props.rel, /noopener/u); assert.match(node.props.rel, /noreferrer/u);
      }
    });

    await t.test("local, native and unsafe origins cannot be copied as remote-install URLs", async () => {
      for (const url of ["", "capacitor://localhost", "http://localhost:8103", "https://localhost", "https://127.0.0.1", "https://service.local",
        "https://user:private-secret@sajda-test-hypbit.vercel.app", origin + "/wrong-path", origin + "?token=secret", origin + "#fragment", "javascript:alert(1)"]) {
        await mount("en", url);
        assert.ok(text().includes(c.endpointUnavailable));
        assert.equal(root().findAllByType("code").length, 0);
        assert.equal(root().findAllByType("button").filter(node => label(node) === c.copyUrl).length, 0);
        assert.equal(root().findAllByType("a").filter(node => node.props.href === "https://chatgpt.com/plugins").length, 0);
        assert.ok(!text().includes("private-secret"));
        await click("Claude");
        assert.equal(root().findAllByType("a").filter(node => node.props.href.startsWith("https://claude.ai/")).length, 0);
        await click(c.copyPrompt); assert.equal(writes.at(-1), c.prompt, "A useful prompt remains available");
      }
    });

    await t.test("clipboard denial shows manual recovery and never claims copying succeeded", async () => {
      await mount(); write = async () => { throw new Error("NotAllowedError"); };
      await click(c.copyUrl);
      assert.ok(button(c.copyUrl));
      assert.equal(label(root().findByProps({ role: "alert" })), c.copyError);
      assert.ok(!text().includes(c.urlCopied));
      write = async value => { writes.push(value); };
      await click(c.copyUrl); assert.ok(button(c.urlCopied));
      assert.equal(root().findAllByProps({ role: "alert" }).length, 0);
    });

    await t.test("changing language or origin invalidates an older pending clipboard result", async () => {
      await mount();
      let finish!: () => void;
      write = () => new Promise(resolve => { finish = resolve; });
      await click(c.copyPrompt); assert.equal(button(c.copying).props.disabled, true);
      await act(async () => renderer!.update(h(ConnectorSetup, { language: "sv", origin })));
      await act(async () => { finish(); await pause(); });
      assert.ok(button(connectorCopy.sv.copyPrompt));
      assert.ok(!text().includes(connectorCopy.sv.promptCopied));
      write = async value => { writes.push(value); };
      await click(connectorCopy.sv.copyPrompt); assert.equal(writes.at(-1), connectorCopy.sv.prompt);
      write = () => new Promise(resolve => { finish = resolve; });
      await click(connectorCopy.sv.copyUrl);
      const updatedOrigin = "https://sajda-new-preview.vercel.app";
      await act(async () => renderer!.update(h(ConnectorSetup, { language: "sv", origin: updatedOrigin })));
      await act(async () => { finish(); await pause(); });
      assert.ok(button(connectorCopy.sv.copyUrl));
      assert.ok(!text().includes(connectorCopy.sv.urlCopied));
      assert.equal(root().findByType("code").children.join(""), updatedOrigin + "/api/mcp/public");
    });

    await t.test("all languages render translated controls, limits and the same public endpoint", async () => {
      for (const language of languages) {
        await mount(language);
        const copy = connectorCopy[language];
        assert.equal(root().findByType("h2").children.join(""), copy.title);
        assert.ok(button(copy.copyUrl)); assert.ok(button(copy.copyPrompt));
        assert.ok(text().includes(copy.limits)); assert.ok(text().includes(copy.privacy));
        assert.ok(text().includes(copy.verification));
        assert.equal(root().findByType("code").children.join(""), endpoint);
        await click("Claude"); assert.ok(link(copy.claudeAction));
      }
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test("both Developers entry layouts expose public AI setup separately from private MCP and keys", async () => {
  const source = await readFile("src/pages/Developers.tsx", "utf8");
  assert.equal([...source.matchAll(/<ConnectorSetup language=\{language\} origin=\{PUBLIC_CONNECTOR_ORIGIN\} \/>/gu)].length, 2);
  const native = source.slice(source.indexOf("if (isNativeApp) return"), source.indexOf("\n  return (", source.indexOf("if (isNativeApp) return")));
  assert.ok(native.indexOf("<ConnectorSetup") < native.indexOf("<DeveloperKeyWorkspace"));
  assert.match(source, /href="#ai-assistants"[^>]+>\{connectorCopy\[language\]\.connectAction\}/u);
  assert.match(source, /<section id="mcp"/u);
  assert.match(source, /\{origin\}\/api\/mcp<\/code>/u);
});

test("preview, local and native Developers use the stable public connector without moving private endpoints", async () => {
  const originals = new Map(["window", "document", "navigator"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  const fixture = { copied: "" };
  const location = { origin: "https://private-preview.vercel.app" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location, setTimeout, clearTimeout } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { title: "Sajda" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { fixture.copied = value; } } } });
  globalThis.fetch = async () => { throw new Error("Connector origin selection must never issue an account or MCP request"); };
  const nativeOrigin = "https://private-native.vercel.app";
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_NATIVE_API_ORIGIN": JSON.stringify(nativeOrigin) },
    plugins: [{ name: "connector-origin-test-boundaries", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null,loading:false});";
      if (file.endsWith("/src/integrations/neon/auth.ts")) return "export const isAccountAuthConfigured=true;export const readAccountSession=async()=>{throw new Error('No account read expected');};";
      if (file.endsWith("/src/lib/localTestMode.ts")) return "export const isLocalTestMode=()=>false;";
      if (file.endsWith("/src/lib/appSurface.ts")) return "export let isNativeApp=false;export const setNative=value=>{isNativeApp=value;};";
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (file.endsWith("/src/components/LanguageSwitcher.tsx")) return "export default function Stub(){return null;}";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const [{ default: Developers }, { setNative }] = await Promise.all([
      vite.ssrLoadModule("/src/pages/Developers.tsx"), vite.ssrLoadModule("/src/lib/appSurface.ts"),
    ]);
    assert.equal(PUBLIC_CONNECTOR_ORIGIN, "https://sajda-connector.vercel.app");
    for (const state of [
      { native: false, host: "https://private-preview.vercel.app", privateOrigin: "https://private-preview.vercel.app" },
      { native: false, host: "http://127.0.0.1:8103", privateOrigin: "http://127.0.0.1:8103" },
      { native: true, host: "capacitor://localhost", privateOrigin: nativeOrigin },
    ]) {
      if (renderer) await act(async () => renderer!.unmount());
      location.origin = state.host; setNative(state.native);
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: ["/developers"] }, h(Developers))); });
      const root = renderer!.root;
      const publicSection = root.findByProps({ id: "ai-assistants" });
      assert.equal(label(publicSection.findByType("code")), PUBLIC_CONNECTOR_ORIGIN + "/api/mcp/public");
      const copy = publicSection.findAllByType("button").find(node => label(node) === c.copyUrl)!;
      await act(async () => { copy.props.onClick(); await pause(); });
      assert.equal(fixture.copied, PUBLIC_CONNECTOR_ORIGIN + "/api/mcp/public");
      const privateSection = root.findByProps({ id: "mcp" });
      assert.ok(privateSection.findAllByType("code").some(node => label(node) === state.privateOrigin + "/api/mcp"));
      assert.ok(!label(privateSection).includes(PUBLIC_CONNECTOR_ORIGIN));
      if (!state.native) {
        const api = root.findByProps({ id: "api-v1" });
        assert.ok(label(api).includes(state.privateOrigin + "/api/v1/domains"));
        assert.ok(!label(api).includes(PUBLIC_CONNECTOR_ORIGIN));
      }
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

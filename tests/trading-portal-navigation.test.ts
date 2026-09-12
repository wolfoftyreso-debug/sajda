import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { tradingPortalCopy } from "../src/i18n/tradingPortalCopy";
import type { LostDomainAssessment } from "../src/lib/lostDomains";

const c = tradingPortalCopy.en;
const now = Date.UTC(2030, 0, 20, 12);
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function text(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : text(child)).join("");
}
function candidate(domain: string): LostDomainAssessment {
  return {
    domain, sourceUrl: "https://example.test/fixture", targetUrl: `https://${domain}/`, anchor: "Synthetic UI fixture",
    sensitive: false, registryStatus: "registered", registrability: "unverified", confirmedRegistrable: false,
    reviewStatus: "registered", risk: { level: "review", reasons: [] }, potentialScore: 0, confidenceScore: 60,
    evidence: [{ kind: "registry", source: "Synthetic UI fixture", method: "fixture", outcome: "registered",
      observedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 60_000).toISOString() }],
  };
}

test("Trading portal navigation protects focused context, draft state and recovery semantics", async t => {
  const key = "__SAJDA_TRADING_NAVIGATION_TEST__";
  const original = new Map([key, "window", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const beforeUnload = new Set<(event: { preventDefault(): void; returnValue?: string }) => void>();
  const domCalls: string[] = [];
  let confirm = true;
  const fixture = {
    request: async () => ({ accountId: "account-a", requestId: "req_0123456789abcdef", scenarios: [] }),
    session: async () => ({ user: { id: "account-a" }, expires_at: Date.now() / 1000 + 60 }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    confirm: () => confirm,
    addEventListener: (name: string, handler: (event: { preventDefault(): void; returnValue?: string }) => void) => { if (name === "beforeunload") beforeUnload.add(handler); },
    removeEventListener: (name: string, handler: (event: { preventDefault(): void; returnValue?: string }) => void) => { if (name === "beforeunload") beforeUnload.delete(handler); },
  } });
  const vite = await createServer({
    configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "trading-navigation-test-account-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `
        export const accountRequest=()=>globalThis.${key}.request();
        export const readAccountSession=()=>globalThis.${key}.session();`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: TradingPortal } = await vite.ssrLoadModule("/src/components/TradingPortal.tsx");
    let candidates: LostDomainAssessment[] = [];
    const tree = () => h(TradingPortal, { accountId: "account-a", language: "en", candidates, now });
    const root = () => renderer!.root;
    const contents = () => text(root());
    const button = (name: string) => {
      const found = root().findAllByType("button").find(node => text(node) === name);
      assert.ok(found, `Missing button: ${name}`); return found;
    };
    const click = async (name: string) => act(async () => { button(name).props.onClick(); await pause(); });
    const settle = async () => act(async () => { await pause(); });
    const field = (name: string) => root().findAllByType("input").find(node => node.props.name === name)!;
    const resetTransport = () => { fixture.request = async () => ({ accountId: "account-a", requestId: "req_0123456789abcdef", scenarios: [] }); };
    const mount = async (rows: LostDomainAssessment[] = [], wait = true) => {
      if (renderer) await act(async () => renderer!.unmount());
      candidates = rows; domCalls.length = 0; confirm = true;
      await act(async () => { renderer = create(tree(), { createNodeMock(element) {
        if (element.type === "nav") return { scrollIntoView: () => domCalls.push("scroll") };
        if (element.props["data-trading-panel"] !== undefined) return { focus: () => domCalls.push("focus:" + element.props["aria-label"]) };
        return null;
      } }); if (wait) await pause(); });
    };

    await t.test("switching away from a removed candidate button focuses the new named panel", async () => {
      resetTransport(); await mount([candidate("example.com")]);
      assert.equal(domCalls.length, 0, "Initial render does not steal page focus or scroll");
      const domainButton = root().findAllByType("button").find(node => text(node).startsWith("example.com"))!;
      await act(async () => domainButton.props.onClick());
      assert.deepEqual(domCalls, ["scroll", "focus:" + c.tabs.twin]);
      const panel = root().findAll(node => node.props["data-trading-panel"] !== undefined)[0];
      assert.equal(panel.props.role, "region"); assert.equal(panel.props.tabIndex, -1);
      assert.equal(button(c.tabs.twin).props["aria-controls"], panel.props.id);
      await click(c.openScenario);
      assert.equal(domCalls.at(-1), "focus:" + c.tabs.scenarios);
      assert.equal(field("domain").props.value, "example.com");
    });

    await t.test("a report refresh never silently replaces the explicitly selected domain", async () => {
      resetTransport(); await mount([candidate("example.com"), candidate("example.net")]);
      const selected = root().findAllByType("button").find(node => text(node).startsWith("example.com"))!;
      await act(async () => selected.props.onClick());
      assert.equal(text(root().findByType("h3")), "example.com");
      candidates = [candidate("example.net")];
      await act(async () => renderer!.update(tree()));
      assert.equal(root().findAllByType("h3").length, 0, "No unrelated domain twin is substituted");
      assert.ok(contents().includes("This domain is no longer in the report"));
      assert.equal(button(c.tabs.twin).props["aria-pressed"], true);
      await click(c.tabs.radar);
      assert.ok(contents().includes("example.net"));
    });

    await t.test("journal refresh errors describe loading rather than falsely describing a save", async () => {
      resetTransport(); await mount(); await click(c.tabs.journal);
      fixture.request = async () => { throw { status: 503 }; };
      await click(c.reload); await settle();
      assert.ok(contents().includes(c.loadError));
      assert.ok(!contents().includes(c.saveError));
      resetTransport(); await click(c.retry); await settle();
      assert.ok(contents().includes(c.emptyJournalTitle));
    });

    await t.test("a failed initial load remains a recoverable load failure inside Scenario lab", async () => {
      let fail!: (reason: unknown) => void;
      fixture.request = () => new Promise((_resolve, reject) => { fail = reject; });
      await mount([], false); await click(c.tabs.scenarios);
      await act(async () => { fail({ status: 503 }); await pause(); });
      assert.ok(contents().includes(c.loadError));
      assert.ok(!contents().includes(c.saveError));
      assert.ok(button(c.retry));
      resetTransport(); await click(c.retry); await settle();
      assert.ok(!contents().includes(c.loadError));
      assert.equal(button(c.tabs.scenarios).props["aria-pressed"], true);
    });

    await t.test("unsaved edits are protected across tabs and refresh until explicitly discarded", async () => {
      resetTransport(); await mount(); await click(c.tabs.scenarios);
      assert.equal(beforeUnload.size, 0);
      await act(async () => field("title").props.onChange({ target: { value: "Keep my reasoning" } }));
      assert.equal(beforeUnload.size, 1);
      let prevented = false;
      const event = { preventDefault() { prevented = true; }, returnValue: undefined as string | undefined };
      for (const listener of beforeUnload) listener(event);
      assert.equal(prevented, true); assert.equal(event.returnValue, "");
      await click(c.tabs.journal); assert.equal(beforeUnload.size, 1);
      await click(c.tabs.scenarios); assert.equal(field("title").props.value, "Keep my reasoning");
      confirm = false; await click(c.resetDraft); assert.equal(field("title").props.value, "Keep my reasoning");
      assert.equal(beforeUnload.size, 1);
      confirm = true; await click(c.resetDraft); assert.equal(field("title").props.value, "");
      assert.equal(beforeUnload.size, 0);
    });

    await t.test("mobile form controls retain a 16px base font instead of triggering small-input zoom", async () => {
      resetTransport(); await mount(); await click(c.tabs.scenarios);
      for (const node of root().findAll(node => ["input", "textarea", "select"].includes(String(node.type)))) {
        assert.match(node.props.className, /(?:^|\s)text-base(?:\s|$)/u);
        assert.match(node.props.className, /(?:^|\s)sm:text-sm(?:\s|$)/u);
      }
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

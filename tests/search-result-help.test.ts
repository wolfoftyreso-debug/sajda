import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

test("result help stays inline and is controlled only by the reader", async t => {
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  let renderer: ReactTestRenderer | undefined;
  let focusCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Result help must not request a feed or private data"); };
  try {
    const { default: SearchResultHelp } = await vite.ssrLoadModule("/src/components/SearchResultHelp.tsx");
    const mount = async (language = "sv", enabled = true) => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(SearchResultHelp, { language, enabled }), {
        createNodeMock: element => element.type === "button" ? { focus: () => { focusCount++; } } : null,
      }); });
    };
    const button = () => renderer!.root.findByType("button");
    const content = () => renderer!.root.findByProps({ id: button().props["aria-controls"] });
    const click = async () => { await act(async () => button().props.onClick()); };

    await t.test("starts collapsed with an accessible named button and no floating positioning", async () => {
      await mount();
      assert.equal(button().props.type, "button");
      assert.equal(button().props["aria-expanded"], false);
      assert.equal(content().props.hidden, true);
      assert.equal(renderer!.root.findByProps({ id: button().props["aria-labelledby"] }).children[0], "Så läser du resultaten");
      assert.equal(renderer!.root.findByProps({ id: button().props["aria-describedby"] }).children[0], "Tillgänglighet, priser och namnpoäng");
      for (const node of renderer!.root.findAll(node => typeof node.props.className === "string")) {
        assert.doesNotMatch(node.props.className, /(?:^|[\s:])(?:fixed|sticky|absolute)(?:\s|$)|truncate|bottom-\[/u);
      }
    });
    await t.test("opens three relevant explanations and only closes by a user action", async () => {
      await click();
      assert.equal(button().props["aria-expanded"], true);
      assert.equal(content().props.hidden, false);
      assert.equal(renderer!.root.findAllByType("h3").length, 3);
      const markup = JSON.stringify(renderer!.toJSON());
      assert.match(markup, /inte en bokning/);
      assert.match(markup, /Publicerat standardpris gäller ändelsen/);
      assert.match(markup, /inte ett marknadsvärde/);
      assert.doesNotMatch(markup, /Sajda.brief|Valfri kontext|Next note|Nästa notis/);
      await act(async () => renderer!.update(h(SearchResultHelp, { language: "sv", enabled: true })));
      assert.equal(content().props.hidden, false, "Unrelated render must not dismiss help");
      await click();
      assert.equal(content().props.hidden, true);
    });
    await t.test("Escape closes help and restores focus without a modal or focus trap", async () => {
      await click();
      let stopped = false;
      await act(async () => renderer!.root.findByType("aside").props.onKeyDown({ key: "Escape", stopPropagation: () => { stopped = true; } }));
      assert.ok(stopped); assert.equal(content().props.hidden, true); assert.equal(focusCount, 1);
      assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    });
    await t.test("disabled/new search clears the old expanded state", async () => {
      await click();
      await act(async () => renderer!.update(h(SearchResultHelp, { language: "sv", enabled: false })));
      assert.equal(renderer!.toJSON(), null);
      await act(async () => renderer!.update(h(SearchResultHelp, { language: "sv", enabled: true })));
      assert.equal(content().props.hidden, true);
    });
    await t.test("all five languages describe help instead of an unexplained brief", async () => {
      for (const [language, title] of [["sv", "Så läser du resultaten"], ["en", "How to read the results"],
        ["es", "Cómo leer los resultados"], ["fr", "Comment lire les résultats"], ["zh", "如何理解搜索结果"]]) {
        await mount(language);
        assert.equal(renderer!.root.findByProps({ id: button().props["aria-labelledby"] }).children[0], title);
        await click(); assert.equal(renderer!.root.findAllByType("h3").length, 3);
      }
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("the result help belongs after filters and before domain cards, never after the footer", () => {
  const index = readFileSync("src/pages/Index.tsx", "utf8");
  const help = index.indexOf("<SearchResultHelp");
  assert.equal(index.match(/<SearchResultHelp/g)?.length, 1);
  assert.ok(index.indexOf("<DomainFilters") < help);
  assert.ok(help < index.indexOf("{/* Domain Grid */}"));
  assert.ok(help < index.indexOf("</main>"));
  assert.match(index, /enabled=\{!isScanning && domains\.length > 0\}/);
  const component = readFileSync("src/components/SearchResultHelp.tsx", "utf8");
  assert.doesNotMatch(component, /useSajdaSignal|useDomainSaleFactFeed|setTimeout|setInterval|fetch\(/);
});

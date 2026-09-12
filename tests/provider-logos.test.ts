import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { ProviderCatalogEntry } from "../src/lib/providerCatalog";

const providerIds = ["namesilo", "internetbs"] as const;
const internetBsLogoUrl = "https://faq.internetbs.net/hc/theming_assets/01HZKQZF4DVTSEGDQT3SKR6K05";

function assertStandaloneSvg(bytes: Buffer) {
  const source = bytes.toString("utf8");
  assert.match(source, /<svg\b/iu);
  assert.match(source, /<\/svg>\s*$/iu);
  assert.doesNotMatch(source, /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|@import|@font-face|font-family|javascript:|vbscript:/iu);
  for (const match of source.matchAll(/url\s*\(([^)]*)\)/giu)) {
    assert.match(match[1].trim().replace(/^["']|["']$/gu, ""), /^#[A-Za-z_][\w:.-]*$/u, "Paint and CSS references must also stay inside the SVG");
  }
  const $ = load(source, { xmlMode: true });
  assert.equal($("svg").length, 1);
  const viewBox = $("svg").attr("viewBox")?.trim().split(/[\s,]+/u).map(Number);
  assert.ok(viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0);
  assert.ok($("path[d]").toArray().some(element => ($(element).attr("d")?.length ?? 0) > 40), "A published vector mark must contain nonempty geometry, not fallback text");
  assert.equal($("script, foreignObject, iframe, object, embed, image, text, font, font-face, animate, animateTransform, set").length, 0);
  $("*").each((_index, element) => {
    if (!("attribs" in element)) return;
    for (const [name, value] of Object.entries(element.attribs)) {
      assert.doesNotMatch(name, /^on/iu, "Logo assets must not contain event handlers");
      if (name === "src" || /(?:^|:)href$/iu.test(name)) assert.match(value, /^#[A-Za-z_][\w:.-]*$/u, "Only internal SVG references are allowed");
      if (name === "style") assert.doesNotMatch(value, /@import|@font-face|font-family|url\s*\(/iu);
    }
  });
  assert.doesNotMatch($("style").text(), /@import|@font-face|font-family|url\s*\(/iu);
}

test("NameSilo and InternetBS show published brand assets with an error-only monogram fallback", async t => {
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { PROVIDER_CATALOG } = await vite.ssrLoadModule("/src/lib/providerCatalog.ts") as { PROVIDER_CATALOG: ProviderCatalogEntry[] };
    const { default: ProviderLogo } = await vite.ssrLoadModule("/src/components/ProviderLogo.tsx");
    for (const id of providerIds) {
      const provider = PROVIDER_CATALOG.find(entry => entry.id === id);
      assert.ok(provider, `${id}: the real provider must be in the catalog`);
      await t.test(id === "namesilo" ? "NameSilo bundles a standalone vector without script, font or hotlink dependencies"
        : "InternetBS uses the verified first-party header image, not a favicon or invented local copy", async () => {
        assert.ok(provider.logoUrl, `${id}: the monogram must not be the default logo`);
        if (id === "internetbs") {
          // The official header is linked, not copied or fetched by this test.
          assert.equal(provider.logoUrl, internetBsLogoUrl);
          assert.equal(provider.logoWide, true);
          assert.equal(provider.logoSurface, "dark", "The white InternetBS wordmark needs a dark background");
          return;
        }
        const url = new URL(provider.logoUrl);
        assert.equal(url.protocol, "file:", "Vite SSR must resolve the bundled source asset, not a remote image");
        const asset = fileURLToPath(url);
        assert.equal(path.dirname(asset), path.resolve("src/assets/providers"));
        assert.equal(path.basename(asset), "namesilo.svg");
        const bytes = await readFile(asset);
        assert.ok(bytes.length > 100 && bytes.length < 262_144, "Logos must be nonempty and compact");
        assertStandaloneSvg(bytes);
      });
      for (const size of ["sm", "md"] as const) await t.test(`${id} ${size}: shows the image, then falls back only after onError`, async () => {
        if (renderer) await act(async () => renderer!.unmount());
        await act(async () => { renderer = create(h(ProviderLogo, { provider, size })); });
        const image = renderer!.root.findByType("img");
        assert.equal(image.props.src, provider.logoUrl);
        assert.equal(image.props.alt, "");
        assert.equal(image.props.loading, "lazy");
        assert.equal(image.props.decoding, "async");
        assert.equal(image.props.referrerPolicy, "no-referrer");
        assert.equal(renderer!.root.findAll(node => node.children.includes(provider.logoMonogram)).length, 0);
        await act(async () => image.props.onError());
        assert.equal(renderer!.root.findAllByType("img").length, 0);
        const fallback = renderer!.root.find(node => node.children.includes(provider.logoMonogram));
        assert.equal(fallback.props.style.backgroundColor, provider.logoFallbackColor);
      });
    }
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close();
  }
});

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { accountNavigationCopy } from "../src/i18n/accountNavigationCopy";

function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

test("mounted account entry preserves workspace and uses one account in every language", async t => {
  const key = "__SAJDA_ACCOUNT_LINK_TEST__";
  const originalFixture = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalFetch = globalThis.fetch;
  const fixture: { user: { id: string } | null; loading: boolean; language: keyof typeof accountNavigationCopy } = {
    user: null, loading: false, language: "sv",
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  globalThis.fetch = async () => { throw new Error("A navigation link must not create accounts, payments or research runs"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "account-link-test-providers", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      if (normalized.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:globalThis.${key}.user,loading:globalThis.${key}.loading});`;
      if (normalized.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: AccountLink } = await vite.ssrLoadModule("/src/components/AccountLink.tsx");
    const mount = async (route: string, compact = false) => {
      if (renderer) await act(async () => renderer!.unmount());
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, h(AccountLink, { compact }))); });
      const link = renderer!.root.findByType("a");
      assert.match(link.props.className, /focus-visible:ring-2/);
      assert.equal(link.findByType("svg").props["aria-hidden"], "true");
      assert.equal(renderer!.root.findAllByType("form").length, 0);
      return link;
    };

    await t.test("anonymous sign-in keeps the workspace without forwarding query data or repeating auth", async () => {
      for (const route of ["/", "/swipe", "/plus", "/account", "/pricing", "/plus?source=private-idea#report", "/auth?next=%2Fplus"]) {
        const link = await mount(route);
        const source = new URL(route, "https://sajda.example.test");
        const destination = new URL(link.props.href, source.origin);
        assert.equal(destination.pathname, "/auth");
        assert.equal(destination.searchParams.get("next"), source.pathname === "/auth" ? "/account" : source.pathname);
        assert.equal(destination.searchParams.size, 1);
        assert.equal(destination.hash, "");
      }
    });

    for (const language of Object.keys(accountNavigationCopy) as (keyof typeof accountNavigationCopy)[]) {
      await t.test(`${language}: signed-in, anonymous and compact labels remain accessible`, async () => {
        fixture.language = language;
        for (const signedIn of [false, true]) for (const compact of [false, true]) {
          fixture.user = signedIn ? { id: "same-sajda-account" } : null;
          const link = await mount("/plus", compact);
          const copy = accountNavigationCopy[language];
          const expected = signedIn ? copy.account : copy.signIn;
          assert.equal(link.props.href, signedIn ? "/account" : "/auth?next=%2Fplus");
          assert.equal(link.props["aria-label"], expected);
          assert.equal(label(link), compact ? "" : expected);
          assert.equal(link.findAllByType("span").length, compact ? 0 : 1);
          if (compact) assert.match(link.props.className, /w-10/);
          assert.doesNotMatch(link.props.href, /signup|trading-account|plus-auth|mode=/);
        }
      });
    }

    await t.test("auth loading never suggests creating a second account", async () => {
      fixture.user = null; fixture.loading = true; fixture.language = "sv";
      const link = await mount("/swipe", true);
      assert.equal(link.props.href, "/account");
      assert.equal(link.props["aria-label"], accountNavigationCopy.sv.account);
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    if (originalFixture) Object.defineProperty(globalThis, key, originalFixture); else Reflect.deleteProperty(globalThis, key);
    await vite.close();
  }
});

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";

test("name packages are a public search entry while saved projects and account pages remain protected", async () => {
  const vite = await createServer({ configFile: false, appType: "custom", envDir: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "package-route-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return "export const useAuth=()=>({user:null,loading:false});";
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return "export const useLanguage=()=>({language:'en'});";
      if (file.endsWith("/src/lib/anonymousSearchMode.ts")) return "export const isAnonymousSearchMode=()=>true;";
    } }],
  });
  try {
    const { default: ProtectedRoute } = await vite.ssrLoadModule("/src/components/ProtectedRoute.tsx");
    function Probe() { const location = useLocation(); return location.pathname === "/auth"
      ? h("div", { id: "signin" }, location.search)
      : h(ProtectedRoute, null, h("div", { id: "workspace" }, "Synthetic public workspace")); }
    for (const route of ["/", "/swipe", "/name-packages", "/projects", "/account", "/watchlist", "/name-packages/private"]) {
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, h(Probe))); });
      const allowed = ["/", "/swipe", "/name-packages"].includes(route);
      assert.equal(renderer.root.findAllByProps({ id: "workspace" }).length, allowed ? 1 : 0, route);
      assert.equal(renderer.root.findAllByProps({ id: "signin" }).length, allowed ? 0 : 1, route);
      await act(async () => renderer.unmount());
    }
  } finally { await vite.close(); }
});

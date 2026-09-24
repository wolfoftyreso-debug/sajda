import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { authFixtureBoundary } from "./auth-boundaries.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixture: Plugin = {
  name: "loopback-only-auth-fixture", enforce: "pre",
  configResolved(config) {
    if (config.command !== "serve" || config.isProduction || config.server.host !== "127.0.0.1" || config.server.port !== 8193)
      throw new Error("Auth fixture is serve-only on 127.0.0.1:8193.");
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.startsWith("/api/")) { response.statusCode = 403; response.end("LOCAL FIXTURE: real APIs are prohibited."); return; }
      if (["/", "/auth", "/developers", "/legal"].includes(request.url?.split("?")[0] ?? "")) request.url = "/auth-preview.html";
      next();
    });
  },
  load(id) {
    const boundary = authFixtureBoundary(normalizePath(id));
    if (boundary) return boundary;
  },
};
export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("LOCAL AUTH FIXTURE: builds and deployment are prohibited.");
  return { root, publicDir: fileURLToPath(new URL("../../public-clean", import.meta.url)), envDir: false, appType: "mpa", plugins: [fixture, react()],
    cacheDir: fileURLToPath(new URL("../../tmp/auth-vite-cache", import.meta.url)), optimizeDeps: { entries: ["auth-preview.html"] },
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } }, css: { postcss: projectRoot },
    server: { host: "127.0.0.1", port: 8193, strictPort: true, hmr: false, cors: false, fs: { strict: true, allow: [projectRoot] },
      headers: { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } } };
});

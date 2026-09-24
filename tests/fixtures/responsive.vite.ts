import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { authFixtureBoundary } from "./auth-boundaries";
const root = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
// Serve the same local, credential-free logos as the production UI.
const publicAssets = fileURLToPath(new URL("../../public-clean", import.meta.url));
const suffix = (id: string, file: string) => normalizePath(id.split("?")[0]).endsWith(file);
const fixture: Plugin = {
  name: "serve-only-loopback-responsive-fixture", enforce: "pre",
  configResolved(config) {
    if (config.command !== "serve" || config.isProduction || config.server.host !== "127.0.0.1" || config.server.port !== 8195) throw new Error("Responsive fixture is serve-only on 127.0.0.1:8195.");
    if (normalizePath(config.publicDir) !== normalizePath(publicAssets)) throw new Error("Responsive fixture must serve public-clean assets.");
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.startsWith("/api/")) { response.statusCode = 403; response.end("LOCAL UI FIXTURE: APIs are prohibited."); return; }
      if (["/", "/auth", "/pricing", "/brand-index", "/name-packages", "/developers", "/swipe", "/trading", "/security", "/legal", "/story", "/how-it-works", "/marketplace", "/primitives", "/more", "/help"].includes(request.url?.split("?")[0] ?? "")) request.url = "/responsive-preview.html";
      next();
    });
  },
  load(id) {
    if (suffix(id, "/src/contexts/ScanContext.tsx")) return `export * from '/responsive-scan.tsx';`;
    if (suffix(id, "/src/contexts/MembershipContext.tsx")) return `export const useMembership=()=>({membership:null,loading:false,error:null,refresh:async()=>{}});`;
    if (suffix(id, "/src/integrations/neon/auth.ts")) return `
      export const isAccountAuthConfigured=true, accountAuthUnavailableReason='local_test';
      export const readAccountSession=async()=>null;
      export const accountRequest=async()=>{throw new Error('Responsive fixture blocks real account requests');};`;
    if (suffix(id, "/src/hooks/useReferenceFx.ts")) return `export const useReferenceFx=()=>null;`;
    if (suffix(id, "/src/lib/tradingScenarios.ts")) return `
      export class TradingScenariosError extends Error {constructor(code){super(code);this.code=code;}}
      export const getTradingScenarios=async scope=>({accountId:scope.accountId,requestId:'req_0123456789abcdef',scenarios:[]});
      export const saveTradingScenario=async()=>{throw new TradingScenariosError('unavailable');};`;
    if (suffix(id, "/src/lib/localTestSearch.ts")) return `export const runAnonymousSearch=async()=>({results:[],checkedAt:new Date().toISOString()});`;
    if (suffix(id, "/src/lib/productFetch.ts")) return `export const productFetch=async()=>{throw new Error('Responsive fixture blocks live product services');};`;
    const auth = authFixtureBoundary(id);
    if (auth) return auth.replaceAll("__sajdaAuthFixture", "__sajdaResponsiveFixture");
  },
};
export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("LOCAL UI FIXTURE: builds and deployment are prohibited.");
  return { root, publicDir: publicAssets, envDir: false, appType: "mpa", plugins: [fixture, react()],
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": JSON.stringify("true"),
      "import.meta.env.VITE_SAJDA_SURFACE": JSON.stringify(process.env.SAJDA_RESPONSIVE_SURFACE === "native" ? "native" : "web") },
    cacheDir: fileURLToPath(new URL("../../tmp/responsive-vite-cache", import.meta.url)), optimizeDeps: { entries: ["responsive-preview.html"] },
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } }, css: { postcss: projectRoot },
    server: { host: "127.0.0.1", port: 8195, strictPort: true, hmr: false, cors: false, fs: { strict: true, allow: [projectRoot] }, headers: {
      "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } } };
});

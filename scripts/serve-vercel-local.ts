/** Loopback QA server: executes the actual Vercel handlers and production build.
 * This is not a Vercel deployment and never claims infrastructure parity. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import search from "../api/domain-search";
import deepReview from "../api/deep-review";
import health from "../api/health";
import publicDomains from "../api/v1/public/domains";
import protectedDomains from "../api/v1/domains";
import openapi from "../api/openapi";
import facts from "../api/fact-signals";
import referenceFx from "../api/reference-fx";
import keys from "../api/developer/api-keys";
import verifyDomain from "../api/marketplace/verify-domain";
import savedDomains from "../api/account/saved-domains";
import capabilities from "../api/account/capabilities";
import membership from "../api/account/membership";
import lostDomains from "../api/account/lost-domains";
import tradingScenarios from "../api/account/trading-scenarios";
import lostDomainsCron from "../api/cron/lost-domains";
import auth from "../api/auth";
import contact from "../api/contact";
import billing from "../api/account/billing";
import billingWebhook from "../api/billing-webhook";
import mcp from "../api/mcp";
import publicMcp from "../api/mcp/public";
import accountApi from "../api/v1/account";
import nativeAuth from "../api/native/auth";
import nativeAccount from "../api/native/account";
import nativeCommerce from "../api/native/commerce";
import nativeCommerceCron from "../api/cron/native-commerce";
import appStoreWebhook from "../api/app-store-webhook";
import appSessions from "../api/account/app-sessions";
import deletion from "../api/account/deletion";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(projectRoot, "dist-vercel");
const config = JSON.parse(await readFile(resolve(projectRoot, "vercel.json"), "utf8"));
const port = Number(process.env.SAJDA_QA_PORT || 8095);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid QA port");
// Only this loopback adapter supplies a missing local origin. Never replace an
// explicit environment setting, and never infer any secret/provider setting.
if (process.env.BETTER_AUTH_URL === undefined) process.env.BETTER_AUTH_URL = `http://127.0.0.1:${port}`;
type ResponseAdapter = ServerResponse & { status(code: number): ResponseAdapter; json(body: unknown): void };
type Handler = (req: IncomingMessage, res: ResponseAdapter) => unknown;
const handlers = new Map<string, Handler>([
  ["/api/mcp",mcp], ["/api/v1/account",accountApi],
  ["/api/mcp/public", publicMcp],
  ["/api/native/auth",nativeAuth], ["/api/native/account",nativeAccount],
  ["/api/native/commerce",nativeCommerce], ["/api/app-store-webhook",appStoreWebhook],
  ["/api/auth",auth],
  ["/api/domain-search", search], ["/api/deep-review", deepReview], ["/api/health", health],
  ["/api/v1/public/domains", publicDomains], ["/api/v1/domains", protectedDomains],
  ["/api/v1/public/names", publicDomains], ["/api/v1/names", protectedDomains],
  ["/api/openapi", openapi], ["/api/fact-signals", facts],
  ["/api/reference-fx", referenceFx],
  ["/api/developer/api-keys", keys], ["/api/marketplace/verify-domain", verifyDomain],
  ["/api/account/saved-domains", savedDomains],
  ["/api/account/capabilities", capabilities],
  ["/api/account/membership", membership],
  ["/api/account/app-sessions", appSessions],
  ["/api/account/deletion", deletion],
  ["/api/account/lost-domains", lostDomains],
  ["/api/account/trading-scenarios", tradingScenarios],
  ["/api/cron/lost-domains", lostDomainsCron],
  ["/api/cron/native-commerce", nativeCommerceCron],
  ["/api/contact", contact],
  ["/api/account/billing", billing],
  ["/api/billing-webhook", billingWebhook],
] as [string, Handler][]);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};
function matches(source: string, path: string) {
  return source === "/(.*)" || source === path || (source.endsWith("/(.*)") && path.startsWith(source.slice(0, -4)));
}
const server = createServer(async (req, rawRes) => {
  const res = rawRes as ResponseAdapter;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const path = decodeURIComponent(url.pathname);
    for (const entry of config.headers) if (matches(entry.source, path)) {
      for (const header of entry.headers) res.setHeader(header.key, header.value);
    }
    const handler = path.startsWith("/api/auth/") ? auth as Handler : handlers.get(path);
    if (handler) {
      // Vercel pre-parses JSON bodies/query parameters. Mirror that adapter
      // boundary (with a hard size cap), while invoking the real handlers.
      const request = req as IncomingMessage & { body?: unknown; query?: Record<string, string> };
      request.query = Object.fromEntries(url.searchParams);
      if ((path.startsWith("/api/account/") || path === "/api/developer/api-keys") && ["POST", "DELETE"].includes(req.method || "")) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16_384) { res.status(413).json({ code: "request_too_large" }); return; }
          chunks.push(Buffer.from(chunk));
        }
        request.body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
      }
      await handler(request, res); return;
    }
    if (path.startsWith("/api/")) { res.status(404).json({ error: "Endpoint not found", code: "not_found" }); return; }
    if (!["GET", "HEAD"].includes(req.method || "")) { res.setHeader("Allow", "GET, HEAD"); res.status(405).end(); return; }
    if (path !== "/" && path.endsWith("/")) { res.setHeader("Location", path.slice(0, -1) + url.search); res.status(308).end(); return; }
    const shellRoute = path === "/" || config.rewrites.some((r: { source: string }) => r.source === path)
      || /^\/marketplace\/[^/]+$/.test(path);
    const candidates = shellRoute ? [resolve(root, "index.html")] : [resolve(root, `.${path}`), resolve(root, `.${path}.html`)];
    let file: string | undefined;
    for (const candidate of candidates) {
      if (!candidate.startsWith(root + sep)) continue;
      if (await stat(candidate).then((s) => s.isFile()).catch(() => false)) { file = candidate; break; }
    }
    if (!file) { res.statusCode = 404; file = resolve(root, "404.html"); }
    const body = await readFile(file).catch(() => Buffer.from("Not found"));
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(JSON.stringify({ event: "qa_request_failed", name: error instanceof Error ? error.name : "Error" }));
    if (!res.headersSent) res.status(500).json({ error: "The request could not be completed.", code: "internal_error" });
    else res.end();
  }
});
server.requestTimeout = 35_000;
server.listen(port, "127.0.0.1", () => console.log(`Sajda production-code QA: http://127.0.0.1:${port}`));

/** Minimal Vercel Build Output API artifact. Copies no project source, secrets,
 * database configuration, account routes or payment routes into the release. */
import { build } from "esbuild";
import { mkdir, writeFile, readdir, copyFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderConnectorHub } from "./connector-hub.mjs";
import { buildConnectorKit } from "./build-connector-kit.mjs";
import { CONNECTOR_HOSTS } from "../shared/connector-catalogue.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const staging = resolve(root, "tmp/public-connector-release");
const output = resolve(staging, ".vercel/output");
const origin = new URL(process.env.SAJDA_CONNECTOR_ORIGIN || "https://sajda-connector.vercel.app");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
  || !origin.hostname.endsWith(".vercel.app")) throw new Error("Use the verified dedicated Vercel production alias.");
const endpoint = new URL("/api/mcp/public", origin).href;
await mkdir(resolve(output, "functions/api/mcp/public.func"), { recursive: true });
await mkdir(resolve(output, "static"), { recursive: true });
await mkdir(resolve(output, "static/connectors"), { recursive: true });
const connectorAssets = [...CONNECTOR_HOSTS.map(host => host.logo.slice(1)), "connectors/LICENSE.txt"];
for (const asset of connectorAssets) {
  if (!/^connectors\/[a-z0-9-]+\.svg$|^connectors\/LICENSE\.txt$/u.test(asset)) throw new Error("Unexpected connector asset path");
  await copyFile(resolve(root, "public-clean", asset), resolve(output, "static", asset));
}
const bundle = await build({ entryPoints: [resolve(root, "infra/public-connector/entry.ts")],
  outfile: resolve(output, "functions/api/mcp/public.func/index.mjs"), bundle: true,
  platform: "node", target: "node24", format: "esm", minify: true, metafile: true,
  banner: { js: 'import { createRequire as __sajdaCreateRequire } from "node:module"; const require = __sajdaCreateRequire(import.meta.url);' },
  plugins: [{ name: "public-no-ai-boundary", setup(builder) {
    builder.onResolve({ filter: /^\.\/ai-gateway\.js$/ }, args => {
      if (resolve(args.importer) !== resolve(root, "api/_shared/contextual-naming.ts")) throw new Error("Unexpected AI module import");
      return { path: resolve(root, "infra/public-connector/no-ai.ts") };
    });
  } }],
  // Public mode cannot acquire private/AI/general provider credentials from team
  // envs. Only the new purpose-scoped SAJDA_CONNECTOR_CLOUDFLARE_* server settings
  // may reach the fixed read-only exact-price adapter; never embed their values.
  define: Object.fromEntries(["DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
    "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "TLDES_API_KEY", "PORKBUN_API_KEY", "PORKBUN_SECRET_API_KEY",
    "STRIPE_SECRET_KEY", "RESEND_API_KEY"].map(key => [`process.env.${key}`, "undefined"])),
});
const inputs = Object.keys(bundle.metafile.inputs).map(path => path.replaceAll("\\", "/"));
const forbidden = inputs.filter(path => /api\/(?:account|native|developer|auth|billing)|api\/_shared\/(?:account-server|mcp-product|developer-api-keys)|node_modules\/(?:pg|stripe|better-auth|@neondatabase)\//u.test(path));
if (forbidden.length) throw new Error(`Private dependencies entered the public release: ${forbidden.join(", ")}`);
await writeFile(resolve(output, "functions/api/mcp/public.func/.vc-config.json"), JSON.stringify({
  runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: true, maxDuration: 60,
}, null, 2));
await writeFile(resolve(output, "config.json"), JSON.stringify({ version: 3, routes: [
  { src: "/(.*)", headers: { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }, continue: true },
  { src: "/api/mcp/public", dest: "/api/mcp/public" },
  { handle: "filesystem" },
  { src: "/(.*)", status: 404, dest: "/404.html" },
] }, null, 2));
const kit = await buildConnectorKit(root, resolve(output, "static"));
await writeFile(resolve(output, "static/index.html"), renderConnectorHub(endpoint));
await writeFile(resolve(output, "static/404.html"), "<!doctype html><html lang=en><meta charset=utf-8><title>Not found</title><h1>Not found</h1><p>This service only provides Sajda's public domain connector.</p></html>");
await writeFile(resolve(output, "static/robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(resolve(staging, "vercel.json"), JSON.stringify({ version: 2, framework: null }, null, 2));
// Refuse accidental extra uploads. Vercel project linkage is the only permitted
// operator-owned file in staging; no .env file may accompany --prebuilt.
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async item => item.isDirectory()
    ? files(resolve(directory, item.name)) : [relative(staging, resolve(directory, item.name)).replaceAll("\\", "/")]))).flat();
}
const allowed = new Set(["vercel.json", ".vercel/project.json", ".vercel/README.txt", ".gitignore", ".vercel/output/config.json",
  ".vercel/output/functions/api/mcp/public.func/index.mjs", ".vercel/output/functions/api/mcp/public.func/.vc-config.json",
  ".vercel/output/static/index.html", ".vercel/output/static/404.html", ".vercel/output/static/robots.txt",
  ".vercel/output/static/downloads/sajda-connector.zip", ".vercel/output/static/downloads/sajda-connector.sha256",
  ".vercel/output/static/host-instructions.txt", ".vercel/output/static/policy.json", ".vercel/output/static/connector.json", ".vercel/output/static/llms.txt"]);
for (const asset of connectorAssets) allowed.add(`.vercel/output/static/${asset}`);
for (const file of await files(staging)) if (!allowed.has(file)) throw new Error(`Unreviewed release file: ${file}`);
console.log(JSON.stringify({ staging, endpoint, bundledInputs: inputs.length, privateDependencies: forbidden.length,
  route: "/api/mcp/public", accountRoutes: false, database: false, payments: false, kit }));

/** Minimal Vercel Build Output API artifact. Copies no project source, secrets,
 * database configuration, account routes or payment routes into the release. */
import { build } from "esbuild";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const staging = resolve(root, "tmp/public-connector-release");
const output = resolve(staging, ".vercel/output");
const origin = new URL(process.env.SAJDA_CONNECTOR_ORIGIN || "https://sajda-connector.vercel.app");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
  || !origin.hostname.endsWith(".vercel.app")) throw new Error("Use the verified dedicated Vercel production alias.");
const endpoint = new URL("/api/mcp/public", origin).href;
await mkdir(resolve(output, "functions/api/mcp/public.func"), { recursive: true });
await mkdir(resolve(output, "static"), { recursive: true });
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
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }, continue: true },
  { src: "/api/mcp/public", dest: "/api/mcp/public" },
  { handle: "filesystem" },
  { src: "/(.*)", status: 404, dest: "/404.html" },
] }, null, 2));
const claudeUrl = "https://claude.ai/customize/connectors?" + new URLSearchParams({ modal: "add-custom-connector", connectorName: "Sajda", connectorUrl: endpoint });
await writeFile(resolve(output, "static/index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sajda — Connect your AI assistant</title><style>body{font:17px/1.6 system-ui,sans-serif;color:#152238;background:#f4f8ff;max-width:780px;margin:auto;padding:32px 24px}h1{font-size:clamp(30px,6vw,48px);line-height:1.12;letter-spacing:-.04em}h2{font-size:23px;margin-top:36px}a{color:#0862c4}code{display:block;overflow-wrap:anywhere;background:white;border:1px solid #c7d7e9;padding:18px;border-radius:14px}blockquote{margin:24px 0;padding:18px;border-left:4px solid #1676ed;background:white}li{margin:14px 0}.note{color:#465973;font-size:15px}</style></head><body><p><strong>SAJDA · AI CONNECTOR</strong></p><h1>Find your next domain, inside your AI assistant.</h1><p>Ask for name ideas within a budget. Sajda checks registry status and compares available registrar price evidence.</p><blockquote>Suggest 10 suitable domain names for a planning app for founders. My budget is USD 30 per domain for the first year. Prefer .com, .app and .dev.</blockquote><h2>1. Connect Sajda</h2><p>Use this MCP server URL. Choose <strong>no authentication</strong> — no Sajda account or API key is needed.</p><code>${endpoint}</code><ul><li><strong>ChatGPT:</strong> enable Developer mode if your account permits it, then add Sajda in <a href="https://chatgpt.com/plugins">Plugins</a>. <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt">Official setup guide</a>.</li><li><strong>Claude:</strong> <a href="${claudeUrl.replaceAll("&", "&amp;")}">open the prefilled connector form</a> and confirm.</li><li><strong>Grok:</strong> open <a href="https://grok.com/connectors">Connectors</a>, select New Connector → Custom and paste the URL.</li></ul><h2>2. Ask for names</h2><p>Include what you are building, the preferred endings, your currency, and a first-year or yearly-renewal budget. Select Sajda in the conversation. You can ask it to recheck names before choosing.</p><h2>How Sajda finds the shortlist</h2><p>Sajda explores up to 120 name candidates and checks registry evidence. It then checks exact prices in batches when its registrar connection is active. It stops when enough confirmed budget matches are found, or reports the remaining shortfall and the reason it stopped.</p><h2>Know what the result means</h2><p>Published extension prices are <strong>conditional estimates, not exact checkout quotes</strong>. Premium pricing, tax and required extras may differ. Only confirmed exact-name offers count toward your requested shortlist. Other registry-checked ideas are shown separately with provisional extension-price estimates. Sajda returns fewer confirmed matches when checks or exact-price evidence are insufficient. A registry-not-found result does not reserve a domain or clear trademarks.</p><p>This connection is read-only. It cannot buy domains, access an account, save names, or read Trading data. Your assistant sends the search arguments to Sajda; registry and registrar services receive domain queries needed for checks. Avoid unnecessary confidential details.</p><p class="note">Public use has shared, best-effort rate limits. Setup options depend on the assistant's account/workspace rules. A working MCP endpoint is not a directory listing or a guarantee of every host's model behavior.</p><p class="note">Questions or problems? <a href="mailto:dev@hypbit.com">dev@hypbit.com</a></p></body></html>`);
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
  ".vercel/output/static/index.html", ".vercel/output/static/404.html", ".vercel/output/static/robots.txt"]);
for (const file of await files(staging)) if (!allowed.has(file)) throw new Error(`Unreviewed release file: ${file}`);
console.log(JSON.stringify({ staging, endpoint, bundledInputs: inputs.length, privateDependencies: forbidden.length,
  route: "/api/mcp/public", accountRoutes: false, database: false, payments: false }));

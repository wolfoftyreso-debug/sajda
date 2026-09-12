import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = [
  "infra/local-server/full-app-server.mjs",
  "infra/local-server/server.mjs",
  "infra/local-server/check-page.mjs",
  "infra/worker/worker.mjs",
  "scripts/build-vercel.mjs",
  "scripts/build-public-connector.mjs",
  "scripts/probe-public-mcp.mjs",
  "scripts/release-configuration.mjs",
  "scripts/check-vercel-types.mjs",
  "scripts/seo-routes.mjs",
  "scripts/generate-seo-static.mjs",
  "scripts/check-seo-static.mjs",
  "scripts/check-local-seo.mjs",
  "scripts/check-neon-build.mjs",
  "api/_shared/openapi-document.mjs",
  "api/_shared/fact-signals.mjs",
  "api/_shared/search-quality.mjs",
  "scripts/check-runtime.mjs",
  "scripts/runtime-http.mjs",
  "scripts/check-ui-contracts.mjs",
  "scripts/probe-search-quality.mjs",
  "scripts/migrate-neon.mjs",
  "scripts/check-neon-runtime.mjs",
  "scripts/check-lost-domains-store.mjs",
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", resolve(projectRoot, file)], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Node syntax: OK (${files.length} files)`);

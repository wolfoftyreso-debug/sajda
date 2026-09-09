import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { resolveSeoBuildOrigin, resolveSeoOrigin } from "./seo-routes.mjs";
import { assertProductionConfiguration } from "./release-configuration.mjs";

// Keep legacy browser persistence inert. Stale project variables must never
// reconnect it or expose a server secret through a VITE_ variable.
const legacyBrowserCompatEnv = {
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_ANON_KEY: "",
  VITE_SUPABASE_PUBLISHABLE_KEY: "",
  VITE_NEON_AUTH_URL: "",
  VITE_DATABASE_URL: "",
  VITE_DATABASE_URL_UNPOOLED: "",
  VITE_BETTER_AUTH_SECRET: "",
  VITE_RESEND_API_KEY: "",
  VITE_PORKBUN_API_KEY: "",
  VITE_PORKBUN_SECRET_API_KEY: "",
  VITE_CRON_SECRET: "",
};

/** Pure configuration gate. A public flag cannot enable an unconfigured server. */
export function createVercelBuildEnvironment(environment = process.env, deployment = {}) {
  assertProductionConfiguration(environment, deployment);
  const canonicalOrigin = resolveSeoOrigin(environment.SAJDA_CANONICAL_ORIGIN ?? "");
  const browserCanonicalOrigin = environment.VITE_SAJDA_CANONICAL_ORIGIN?.trim();
  if (browserCanonicalOrigin && resolveSeoOrigin(browserCanonicalOrigin) !== canonicalOrigin) {
    throw new Error("VITE_SAJDA_CANONICAL_ORIGIN must match SAJDA_CANONICAL_ORIGIN in a Vercel build.");
  }
  const hasAccountServer = typeof environment.BETTER_AUTH_SECRET === "string"
    && environment.BETTER_AUTH_SECRET.trim().length >= 32
    && typeof environment.DATABASE_URL === "string"
    && environment.DATABASE_URL.trim().length > 0;
  const buildEnvironment = {
    ...environment,
    VITE_SAJDA_CANONICAL_ORIGIN: canonicalOrigin,
    VITE_PUBLIC_SEARCH_MODE: "true",
    VITE_LOCAL_TEST_MODE: "false",
    VITE_SCAN_EXECUTION_MODE: "public-api",
    VITE_ACCOUNT_AUTH_ENABLED: hasAccountServer ? "true" : "false",
    ...legacyBrowserCompatEnv,
  };
  resolveSeoBuildOrigin(buildEnvironment);
  return buildEnvironment;
}

function runVercelBuild() {
  const deployment = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const buildEnvironment = createVercelBuildEnvironment(process.env, deployment);
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const outputDirectory = "dist-vercel";
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { stdio: "inherit", env: buildEnvironment });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };

  // Keep public output separate from the loopback full-app server's `dist`.
  run([resolve(projectRoot, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", outputDirectory]);
  // Curated static entries reuse Vite's actual asset links and canonical origin.
  run([resolve(projectRoot, "scripts", "generate-seo-static.mjs"), outputDirectory]);
  run([resolve(projectRoot, "scripts", "check-seo-static.mjs"), outputDirectory]);
  run([resolve(projectRoot, "scripts", "check-neon-build.mjs"), outputDirectory]);
}

// Importable by regression tests without building or exiting the test process.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runVercelBuild();

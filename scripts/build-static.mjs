import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { resolveSeoBuildOrigin, resolveSeoOrigin } from "./seo-routes.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = "dist";
// Local product verification must be explicit. A normal `npm run build`
// remains production-like; `start:local` opts into loopback-only test mode
// through this flag instead of relying on dotenv loading order.
const localTestBuild = process.argv.includes("--local-test");
// Vite reads dotenv files itself, while the static generator is a plain Node
// process. Read the canonical values once here and pass the validated pair to
// both commands so `.env.production*` cannot create a browser/static split.
const dotenvEnvironment = loadEnv("production", projectRoot, "");
const sourceEnvironment = { ...dotenvEnvironment, ...process.env };
const canonicalOrigin = resolveSeoOrigin(sourceEnvironment.SAJDA_CANONICAL_ORIGIN);
const configuredBrowserCanonicalOrigin = sourceEnvironment.VITE_SAJDA_CANONICAL_ORIGIN?.trim();

if (configuredBrowserCanonicalOrigin
  && resolveSeoOrigin(configuredBrowserCanonicalOrigin) !== canonicalOrigin) {
  throw new Error(
    "VITE_SAJDA_CANONICAL_ORIGIN must match SAJDA_CANONICAL_ORIGIN in a static SEO build.",
  );
}

const buildEnvironment = {
  ...process.env,
  SAJDA_CANONICAL_ORIGIN: canonicalOrigin,
  VITE_SAJDA_CANONICAL_ORIGIN: canonicalOrigin,
  ...(localTestBuild
    ? {
        VITE_LOCAL_TEST_MODE: "true",
        VITE_PUBLIC_SEARCH_MODE: "false",
        VITE_SCAN_EXECUTION_MODE: "local",
      }
    : {}),
};
resolveSeoBuildOrigin(buildEnvironment);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: buildEnvironment,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  resolve(projectRoot, "node_modules", "vite", "bin", "vite.js"),
  "build",
  "--outDir",
  outputDirectory,
]);
run(process.execPath, [resolve(projectRoot, "scripts", "generate-seo-static.mjs"), outputDirectory]);
run(process.execPath, [resolve(projectRoot, "scripts", "check-seo-static.mjs"), outputDirectory]);

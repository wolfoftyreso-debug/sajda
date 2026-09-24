import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { resolveSeoBuildOrigin, resolveSeoOrigin } from "./seo-routes.mjs";

/** Resolve dotenv and process settings once for Vite and the plain Node generator. */
export function createStaticBuildEnvironment(dotenvEnvironment, environment = process.env, localTestBuild = false) {
  const sourceEnvironment = { ...dotenvEnvironment, ...environment };
  const canonicalOrigin = resolveSeoOrigin(sourceEnvironment.SAJDA_CANONICAL_ORIGIN);
  const configuredBrowserCanonicalOrigin = sourceEnvironment.VITE_SAJDA_CANONICAL_ORIGIN?.trim();

  if (configuredBrowserCanonicalOrigin
    && resolveSeoOrigin(configuredBrowserCanonicalOrigin) !== canonicalOrigin) {
    throw new Error(
      "VITE_SAJDA_CANONICAL_ORIGIN must match SAJDA_CANONICAL_ORIGIN in a static SEO build.",
    );
  }

  const buildEnvironment = {
    ...environment,
    // Node does not read Vite dotenv files. Preserve an explicit indexing hold
    // and deployment context along with the canonical pair for every subprocess.
    ...(sourceEnvironment.SAJDA_SEO_INDEXING !== undefined
      ? { SAJDA_SEO_INDEXING: sourceEnvironment.SAJDA_SEO_INDEXING } : {}),
    ...(sourceEnvironment.VERCEL_ENV !== undefined
      ? { VERCEL_ENV: sourceEnvironment.VERCEL_ENV } : {}),
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
  return buildEnvironment;
}

function runStaticBuild() {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const outputDirectory = "dist";
  // Local product verification remains an explicit opt-in.
  const buildEnvironment = createStaticBuildEnvironment(
    loadEnv("production", projectRoot, ""), process.env, process.argv.includes("--local-test"),
  );
  const run = (args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: buildEnvironment,
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };

  run([resolve(projectRoot, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", outputDirectory]);
  run([resolve(projectRoot, "scripts", "generate-seo-static.mjs"), outputDirectory]);
  run([resolve(projectRoot, "scripts", "check-seo-static.mjs"), outputDirectory]);
}

// Importable by policy regressions without building or exiting the test process.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runStaticBuild();

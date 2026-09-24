import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isolatedRuntimeEnvironment } from "../scripts/check-local-runtime.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("package.json"));

test("application strict nullability and implicit-any checks remain enabled in the standard gate", () => {
  const typescript = read("tsconfig.app.json");
  assert.match(typescript, /"strict":\s*true/u);
  assert.match(typescript, /"noImplicitAny":\s*true/u);
  assert.match(manifest.scripts.typecheck, /tsc --noEmit -p tsconfig\.app\.json/u);
  assert.match(manifest.scripts.lint, /--max-warnings=0/u);
});

test("workflow actions are immutable and dependency update proposals stay bounded", () => {
  for (const path of [".github/workflows/ci.yml", ".github/workflows/ios.yml"]) {
    const actions = [...read(path).matchAll(/uses:\s+([^\s#]+)/gu)].map(match => match[1]);
    assert.ok(actions.length > 0);
    for (const action of actions) assert.match(action, /^actions\/[a-z-]+@[a-f0-9]{40}$/u);
  }
  const updates = read(".github/dependabot.yml");
  assert.match(updates, /package-ecosystem: github-actions/u);
  assert.match(updates, /package-ecosystem: npm/u);
  assert.equal((updates.match(/interval: weekly/gu) ?? []).length, 2);
  assert.match(updates, /open-pull-requests-limit: 2/u);
  assert.match(updates, /open-pull-requests-limit: 3/u);
  assert.match(updates, /allow:\s*\n\s+- dependency-type: direct\s*\n\s+ignore:\s*\n\s+- dependency-name: "\*"\s*\n\s+update-types:\s*\n\s+- version-update:semver-major/u);
});

test("the developer CI command tests the supported Vercel artifact before HTTP verification", () => {
  assert.equal(manifest.scripts["check:ci"], "npm run check && npm run build:vercel && npm run check:runtime:local");
  assert.match(manifest.scripts.test, /--test-concurrency=2\b/u);
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /run: npm run check:ci/u);
  assert.match(workflow, /run: npm ci --ignore-scripts/u);
  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /VERCEL_ENV: preview/u);
  assert.match(workflow, /SAJDA_SEO_INDEXING: noindex/u);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|vercel deploy|npm run build\s*$/mu);
  assert.ok(workflow.includes(`npm install --global ${manifest.packageManager} --ignore-scripts`));
});

test("local HTTP smoke never inherits secrets, production settings, proxy or Node preload hooks", () => {
  const result = isolatedRuntimeEnvironment({
    Path: "C:/node", SystemRoot: "C:/Windows", HOME: "/home/ci", TEMP: "/tmp", CI: "true",
    DATABASE_URL: "sentinel-secret", BETTER_AUTH_SECRET: "sentinel-secret", RESEND_API_KEY: "sentinel-secret",
    STRIPE_SECRET_KEY: "sentinel-secret", API_KEY: "sentinel-secret", SAJDA_VERCEL_CLI: "sentinel-secret",
    SAJDA_TEST_ORIGIN: "https://production.example", BETTER_AUTH_URL: "https://production.example",
    VERCEL_ENV: "production", VITE_ACCOUNT_AUTH_ENABLED: "true", SAJDA_REQUIRE_DATABASE: "true",
    NODE_OPTIONS: "--import unsafe.mjs", HTTPS_PROXY: "https://proxy.example",
  }, 32123);
  assert.deepEqual(result, {
    Path: "C:/node", SystemRoot: "C:/Windows", HOME: "/home/ci", TEMP: "/tmp", CI: "true",
    VERCEL_ENV: "preview", SAJDA_QA_PORT: "32123",
    SAJDA_TEST_ORIGIN: "http://127.0.0.1:32123", BETTER_AUTH_URL: "http://127.0.0.1:32123",
  });
  assert.doesNotMatch(JSON.stringify(result), /sentinel-secret|production|unsafe|proxy/u);
  for (const port of [0, 80, 65536, 4000.5, "4000", NaN]) {
    assert.throws(() => isolatedRuntimeEnvironment({}, port), /Invalid QA port/u);
  }
});

test("runtime smoke expects all six anonymous research tools and covers brand/package pages", () => {
  const smoke = read("scripts/check-runtime.mjs");
  const tools = ["business_names_recommend", "domains_suggest", "domains_check", "name_packages_search", "brand_index_assess", "brand_lookup"];
  const toolLine = smoke.split("\n").find(line => line.includes("publicTools.json()"));
  assert.ok(toolLine);
  for (const name of tools) assert.ok(toolLine.includes(`"${name}"`), name);
  assert.match(smoke, /"\/brand-index"/u);
  assert.match(smoke, /"\/name-packages"/u);
});

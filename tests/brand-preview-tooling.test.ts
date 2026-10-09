import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertBrandPreviewFixturesAvailable, brandPreviewDatabaseTarget, brandPreviewFixture, cleanupBrandPreviewFixtures,
  BRAND_PREVIEW_DATABASE_TARGETS } from "../scripts/brand-preview-policy.mjs";

const source = (name: string) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");

test("deployed report fixtures are recorded before allocation can lose its acknowledgment", () => {
  const probe = source("probe-brand-reports-deployed-preview.ts");
  const register = probe.indexOf("attemptedFixtures.push(fixture)");
  const allocate = probe.indexOf("INSERT INTO public.sajda_auth_user");
  assert.ok(register >= 0 && register < allocate, "An ambiguous INSERT must already have an exact cleanup binding");
  assert.match(probe, /cleanupBrandPreviewFixtures\(pool, attemptedFixtures\)/u);
  assert.doesNotMatch(probe, /created\.push\(account\)/u);
  assert.ok(probe.indexOf("if (cleanupFailed)") < probe.indexOf("console.info(JSON.stringify(verification)"),
    "A successful deployed story must not be reported before cleanup is verified");
});

test("the historical global Preview cron probe is fail-closed before any external capability", () => {
  const retired = source("probe-brand-monitors-deployed-preview.ts");
  assert.match(retired, /fixture_scoped_scheduler_required/u);
  assert.match(retired, /process\.exitCode = 1/u);
  assert.doesNotMatch(retired, /from |spawn\(|fetch\(|new Pool|\.query\(|process\.env|\/api\/cron\/brand-monitors/u);
});

const identifiers = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const fixturePlan = () => identifiers.map(brandPreviewFixture);
type Fixture = ReturnType<typeof brandPreviewFixture>;
function memoryDatabase(initial: { id: string; email: string }[] = [], mode = "ordinary") {
  const state = structuredClone(initial), operations: { sql: string; values: unknown[] }[] = [];
  let deletes = 0;
  return { state, operations, async query(sql: string, values: unknown[]) {
    operations.push({ sql, values });
    if (sql.startsWith("SELECT id,email")) {
      const [ids, emails] = values as string[][];
      return { rows: state.filter(row => ids.includes(row.id) || emails.includes(row.email)).map(row => ({ ...row })) };
    }
    assert.equal(sql, "DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id");
    deletes++;
    if (mode === "unacknowledged-before-delete" && deletes === 1 || mode === "always-unavailable") throw new Error("synthetic-transport-unavailable");
    const index = state.findIndex(row => row.id === values[0] && row.email === values[1]);
    const removed = index < 0 || mode === "acknowledged-no-effect" ? [] : state.splice(index, 1).map(row => ({ id: row.id }));
    if (mode === "unacknowledged-after-delete" && deletes === 1) throw new Error("synthetic-transport-unavailable");
    return { rows: removed };
  } };
}

test("lost allocation acknowledgment still cleans the predeclared exact owner and reconciles partial setup", async () => {
  const fixtures = fixturePlan(), attempted: Fixture[] = [];
  const database = memoryDatabase();
  await assertBrandPreviewFixturesAvailable(database, fixtures);
  attempted.push(fixtures[0]); database.state.push({ ...fixtures[0] }); // INSERT committed, its acknowledgment was lost.
  assert.deepEqual(await cleanupBrandPreviewFixtures(database, attempted), { retiredFixtures: 1, remainingFixtures: 0 });
  assert.equal(database.state.length, 0);
  const deletion = database.operations.find(operation => operation.sql.startsWith("DELETE"))!;
  assert.deepEqual(deletion.values, [fixtures[0].id, fixtures[0].email]);
  assert.equal(database.operations.some(operation => operation.values.flat().includes(fixtures[1].id)), true,
    "Availability checks may include both bindings, but unattempted owners must never be deleted");
  assert.equal(database.operations.filter(operation => operation.sql.startsWith("DELETE")).length, 1);
});

test("fixture availability and cleanup reject ID/email collisions before any deletion", async () => {
  const fixtures = fixturePlan();
  for (const rows of [[{ id: fixtures[0].id, email: "unrelated@example.test" }],
    [{ id: "foreign-owner", email: fixtures[0].email }], [{ ...fixtures[0] }, { ...fixtures[0] }]]) {
    const database = memoryDatabase(rows);
    await assert.rejects(() => cleanupBrandPreviewFixtures(database, fixtures), /brand_preview_fixture_binding_mismatch/u);
    assert.equal(database.operations.some(operation => operation.sql.startsWith("DELETE")), false);
  }
  const existing = memoryDatabase([{ ...fixtures[0] }]);
  await assert.rejects(() => assertBrandPreviewFixturesAvailable(existing, fixtures), /brand_preview_fixture_collision/u);
  assert.equal(existing.operations.some(operation => operation.sql.startsWith("DELETE")), false);
});

test("cleanup reconciles lost DELETE acknowledgments, retries exact deletion only once and never fakes completion", async () => {
  const fixtures = fixturePlan();
  for (const mode of ["ordinary", "unacknowledged-after-delete", "unacknowledged-before-delete"]) {
    const database = memoryDatabase(fixtures.map(fixture => ({ ...fixture })), mode);
    assert.deepEqual(await cleanupBrandPreviewFixtures(database, fixtures), { retiredFixtures: 2, remainingFixtures: 0 });
    assert.equal(database.state.length, 0);
    assert.equal(database.operations.filter(operation => operation.sql.startsWith("DELETE")).length,
      mode === "unacknowledged-before-delete" ? 3 : 2);
  }
  for (const mode of ["always-unavailable", "acknowledged-no-effect"]) {
    const database = memoryDatabase([{ ...fixtures[0] }], mode);
    await assert.rejects(() => cleanupBrandPreviewFixtures(database, [fixtures[0]]));
    assert.equal(database.state.length, 1);
    assert.ok(database.operations.filter(operation => operation.sql.startsWith("DELETE")).length <= 2);
  }
});

test("cleanup never accepts broad targets, duplicates, more than two owners or noncanonical synthetic email bindings", async () => {
  const fixtures = fixturePlan(), database = memoryDatabase();
  for (const plan of [[{ id: "foreign", email: "dev@hypbit.com" }], [{ ...fixtures[0], email: "dev@hypbit.com" }],
    [fixtures[0], fixtures[0]], [...fixtures, fixtures[0]], [{ ...fixtures[0], prefix: "%" }]]) {
    await assert.rejects(() => cleanupBrandPreviewFixtures(database, plan), /brand_preview_fixture_invalid/u);
  }
  assert.equal(database.operations.length, 0);
  assert.deepEqual(await cleanupBrandPreviewFixtures(database, []), { retiredFixtures: 0, remainingFixtures: 0 });
  assert.equal(database.operations.length, 0);
});

function targetConfiguration() {
  const linkedProject = { projectId: "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI", orgId: "team_GP2MTfBKmxj8ajYLvQtV7clA" };
  const manifest = (environment: "preview" | "production") => ({ version: 1, environment,
    vercelProjectId: linkedProject.projectId, vercelOrgId: linkedProject.orgId,
    neonProjectId: BRAND_PREVIEW_DATABASE_TARGETS[environment].neonProjectId,
    directHostname: BRAND_PREVIEW_DATABASE_TARGETS[environment].directHostname,
    databaseName: BRAND_PREVIEW_DATABASE_TARGETS.databaseName, role: BRAND_PREVIEW_DATABASE_TARGETS.role,
    productionHostname: BRAND_PREVIEW_DATABASE_TARGETS.production.directHostname,
    productionDatabaseName: BRAND_PREVIEW_DATABASE_TARGETS.databaseName });
  const environment = (name: "preview" | "production") => ({ VERCEL_ENV: name, NEON_PROJECT_ID: BRAND_PREVIEW_DATABASE_TARGETS[name].neonProjectId,
    SAJDA_PRODUCTION_NEON_PROJECT: BRAND_PREVIEW_DATABASE_TARGETS.production.neonProjectId,
    DATABASE_URL: `postgresql://neondb_owner:synthetic-password@${BRAND_PREVIEW_DATABASE_TARGETS[name].directHostname.replace(".", "-pooler.")}/neondb`,
    DATABASE_URL_UNPOOLED: `postgresql://neondb_owner:synthetic-password@${BRAND_PREVIEW_DATABASE_TARGETS[name].directHostname}/neondb` });
  return { linkedProject, preview: environment("preview"), production: environment("production"),
    previewManifest: manifest("preview"), productionManifest: manifest("production"),
    expectedHost: BRAND_PREVIEW_DATABASE_TARGETS.preview.directHostname.replace(".", "-pooler.") };
}

test("brand Preview target pins both reviewed manifests, fresh environment identity and credential pairs without connecting", () => {
  const input = targetConfiguration(), accepted = brandPreviewDatabaseTarget(input);
  assert.equal(new URL(accepted.connectionString).searchParams.get("sslmode"), "verify-full");
  assert.match(accepted.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(brandPreviewDatabaseTarget({ ...input, expectedFingerprint: accepted.fingerprint }).fingerprint, accepted.fingerprint);
  const invalid = [
    { ...input, preview: { ...input.preview, VERCEL_ENV: "production" } },
    { ...input, production: { ...input.production, VERCEL_ENV: "preview" } },
    { ...input, preview: { ...input.preview, NEON_PROJECT_ID: "foreign-project" } },
    { ...input, production: { ...input.production, SAJDA_PRODUCTION_NEON_PROJECT: "foreign-project" } },
    { ...input, linkedProject: { ...input.linkedProject, orgId: "foreign-org" } },
    { ...input, previewManifest: input.productionManifest, productionManifest: input.previewManifest },
    { ...input, previewManifest: { ...input.previewManifest, neonProjectId: "foreign-project" } },
    { ...input, previewManifest: { ...input.previewManifest, directHostname: BRAND_PREVIEW_DATABASE_TARGETS.production.directHostname } },
    { ...input, productionManifest: { ...input.productionManifest, role: "foreign-role" } },
    { ...input, productionManifest: { ...input.productionManifest, directHostname: input.previewManifest.directHostname } },
    { ...input, preview: { ...input.preview, DATABASE_URL_UNPOOLED: input.production.DATABASE_URL_UNPOOLED } },
    { ...input, preview: { ...input.preview, DATABASE_URL: input.preview.DATABASE_URL.replace("synthetic-password", "different-password") } },
    { ...input, preview: { ...input.preview, DATABASE_URL: input.preview.DATABASE_URL.replace("neondb_owner:", "foreign-role:") } },
    { ...input, preview: { ...input.preview, DATABASE_URL: input.preview.DATABASE_URL.replace("/neondb", "/foreign") } },
    { ...input, expectedHost: BRAND_PREVIEW_DATABASE_TARGETS.production.directHostname },
    { ...input, expectedFingerprint: "0".repeat(64) },
  ];
  for (const value of invalid) assert.throws(() => brandPreviewDatabaseTarget(value), /brand_preview_database_target_mismatch/u);
});

test("report runner rechecks exact manifest/config binding at cleanup and keeps secrets out of arguments", () => {
  const probe = source("probe-brand-reports-deployed-preview.ts");
  for (const basename of [".env.brand-reports.preview.local", ".env.brand-reports.production.local", "migration-target.preview.json", "migration-target.production.json"]) {
    assert.ok(probe.includes(basename));
  }
  assert.equal((probe.match(/databaseFence\(capturedTarget\.fingerprint\)/gu) ?? []).length, 2);
  assert.match(probe, /\.stdin\.end\(config\)/u);
  assert.doesNotMatch(probe, /--header|--data-binary|console\.[a-z]+\(.*(?:apiKey|connectionString|email)\b/u);
});

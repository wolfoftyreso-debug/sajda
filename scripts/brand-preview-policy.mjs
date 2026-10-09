/** Pure target and bounded fixture rules for opt-in brand Preview probes.
 * These functions never load credentials, allocate accounts or send requests.
 * Cleanup requires exactly predeclared id/email pairs; public failures never
 * contain provider details or fixture identities.
 */
import { createHash } from "node:crypto";
import { migrationTarget, MIGRATION_PROJECT } from "./migrate-neon.mjs";

export const BRAND_PREVIEW_DATABASE_TARGETS = Object.freeze({
  preview: Object.freeze({ neonProjectId: "spring-paper-89655503", directHostname: "ep-silent-breeze-b1bznlqd.c-5.eu-central-1.aws.neon.tech" }),
  production: Object.freeze({ neonProjectId: "damp-violet-87929357", directHostname: "ep-restless-water-b1kf6erk.c-5.eu-central-1.aws.neon.tech" }),
  databaseName: "neondb", role: "neondb_owner",
});
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));

export function brandPreviewDatabaseTarget({ preview, production, linkedProject, previewManifest, productionManifest, expectedHost, expectedFingerprint }) {
  const code = "brand_preview_database_target_mismatch";
  ensure(preview?.VERCEL_ENV === "preview" && production?.VERCEL_ENV === "production", code);
  ensure(linkedProject?.projectId === MIGRATION_PROJECT.projectId && linkedProject?.orgId === MIGRATION_PROJECT.orgId, code);
  for (const [environment, manifest] of [["preview", previewManifest], ["production", productionManifest]]) {
    const pinned = BRAND_PREVIEW_DATABASE_TARGETS[environment];
    ensure(manifest?.environment === environment && manifest.neonProjectId === pinned.neonProjectId
      && manifest.directHostname === pinned.directHostname && manifest.databaseName === BRAND_PREVIEW_DATABASE_TARGETS.databaseName
      && manifest.role === BRAND_PREVIEW_DATABASE_TARGETS.role
      && manifest.productionHostname === BRAND_PREVIEW_DATABASE_TARGETS.production.directHostname
      && manifest.productionDatabaseName === BRAND_PREVIEW_DATABASE_TARGETS.databaseName, code);
  }
  let target, database;
  try {
    target = migrationTarget(previewManifest, preview, linkedProject);
    migrationTarget(productionManifest, production, linkedProject);
    database = new URL(preview.DATABASE_URL);
  } catch { throw new Error(code); }
  ensure(database.hostname === expectedHost, code);
  const fingerprint = createHash("sha256").update(canonical(previewManifest) + "\n" + canonical(productionManifest)).digest("hex");
  ensure(expectedFingerprint === undefined || expectedFingerprint === fingerprint, code);
  return { connectionString: target.connectionString, fingerprint };
}

export function brandPreviewFixture(id) {
  ensure(typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id), "brand_preview_fixture_invalid");
  return Object.freeze({ id, email: `brand-deployed-preview-${id}@example.test` });
}
function fixturePlan(fixtures) {
  ensure(Array.isArray(fixtures) && fixtures.length <= 2, "brand_preview_fixture_invalid");
  const plan = fixtures.map(fixture => {
    const expected = brandPreviewFixture(fixture?.id);
    ensure(fixture.email === expected.email && Object.keys(fixture).length === 2, "brand_preview_fixture_invalid");
    return expected;
  });
  ensure(new Set(plan.map(fixture => fixture.id)).size === plan.length, "brand_preview_fixture_invalid");
  return plan;
}
async function boundRows(database, fixtures) {
  const result = await database.query("SELECT id,email FROM public.sajda_auth_user WHERE id=ANY($1::text[]) OR email=ANY($2::text[])",
    [fixtures.map(fixture => fixture.id), fixtures.map(fixture => fixture.email)]);
  ensure(Array.isArray(result.rows) && result.rows.length <= fixtures.length
    && new Set(result.rows.map(row => row.id)).size === result.rows.length
    && result.rows.every(row => fixtures.some(fixture => row.id === fixture.id && row.email === fixture.email)), "brand_preview_fixture_binding_mismatch");
  return result.rows;
}
export async function assertBrandPreviewFixturesAvailable(database, fixtures) {
  const plan = fixturePlan(fixtures);
  ensure(plan.length === 2, "brand_preview_fixture_invalid");
  ensure((await boundRows(database, plan)).length === 0, "brand_preview_fixture_collision");
}
/** Reconcile an INSERT that committed without an acknowledgment. A repeated
 * exact DELETE is safe after a lost acknowledgment; positive final reads prove
 * removal. Never infer absence from the allocation or deletion promises.
 */
export async function cleanupBrandPreviewFixtures(database, fixtures) {
  const plan = fixturePlan(fixtures);
  if (!plan.length) return { retiredFixtures: 0, remainingFixtures: 0 };
  const before = await boundRows(database, plan);
  for (const fixture of plan) {
    try {
      await database.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [fixture.id, fixture.email]);
    } catch {
      // Failed ACK is not failed DELETE. Recheck and retry at most once.
      const stillPresent = await boundRows(database, plan);
      if (stillPresent.some(row => row.id === fixture.id)) {
        await database.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [fixture.id, fixture.email]);
      }
    }
  }
  ensure((await boundRows(database, plan)).length === 0, "brand_preview_fixture_cleanup_unconfirmed");
  return { retiredFixtures: before.length, remainingFixtures: 0 };
}

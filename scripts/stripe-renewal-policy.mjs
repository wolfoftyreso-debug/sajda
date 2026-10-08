/** Pure, fail-closed target fences for the explicitly local TEST renewal probe.
 * Reviewed non-secret target identities are pinned independently of credentials.
 * This module performs no file, database, network, or provider operations.
 */
import { createHash } from "node:crypto";
import { migrationTarget, MIGRATION_PROJECT } from "./migrate-neon.mjs";

export const RENEWAL_DATABASE_TARGETS = Object.freeze({
  preview: Object.freeze({ neonProjectId: "spring-paper-89655503", directHostname: "ep-silent-breeze-b1bznlqd.c-5.eu-central-1.aws.neon.tech" }),
  production: Object.freeze({ neonProjectId: "damp-violet-87929357", directHostname: "ep-restless-water-b1kf6erk.c-5.eu-central-1.aws.neon.tech" }),
  databaseName: "neondb", role: "neondb_owner",
});
const requireTarget = condition => { if (!condition) throw new Error("renewal_database_target_mismatch"); };
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));

export function renewalDatabaseTarget({ preview, production, freshPreview, linkedProject, previewManifest, productionManifest, expectedFingerprint }) {
  requireTarget(preview?.VERCEL_ENV === "preview" && production?.VERCEL_ENV === "production" && freshPreview?.VERCEL_ENV === "preview");
  requireTarget(linkedProject?.projectId === MIGRATION_PROJECT.projectId && linkedProject?.orgId === MIGRATION_PROJECT.orgId);
  for (const [environment, manifest] of [["preview", previewManifest], ["production", productionManifest]]) {
    const expected = RENEWAL_DATABASE_TARGETS[environment];
    requireTarget(manifest?.environment === environment && manifest.neonProjectId === expected.neonProjectId
      && manifest.directHostname === expected.directHostname && manifest.databaseName === RENEWAL_DATABASE_TARGETS.databaseName
      && manifest.role === RENEWAL_DATABASE_TARGETS.role
      && manifest.productionHostname === RENEWAL_DATABASE_TARGETS.production.directHostname
      && manifest.productionDatabaseName === RENEWAL_DATABASE_TARGETS.databaseName);
  }
  let target, actual;
  try {
    target = migrationTarget(previewManifest, preview, linkedProject);
    actual = migrationTarget(previewManifest, freshPreview, linkedProject);
    migrationTarget(productionManifest, production, linkedProject);
  } catch { throw new Error("renewal_database_target_mismatch"); }
  // A fresh injected Preview process and the freshly pulled artifact must agree,
  // not merely point at some Neon database. Never report the connection string.
  requireTarget(target.connectionString === actual.connectionString);
  const fingerprint = createHash("sha256").update(canonical(previewManifest) + "\n" + canonical(productionManifest)).digest("hex");
  requireTarget(expectedFingerprint === undefined || expectedFingerprint === fingerprint);
  const database = new URL(preview.DATABASE_URL);
  database.searchParams.set("sslmode", "verify-full");
  return { database, fingerprint };
}

/** Classify navigation without returning any URL, origin, path or capability.
 * Foreign documents are always aborted; benign means an expected blocked
 * embed/stop-point, never that navigation or an actual application return ran.
 */
export function renewalNavigationFence(value, isTopLevel) {
  let url;
  try { url = new URL(value); } catch { /* Invalid navigation stays denied. */ }
  const valid = url?.protocol === "https:" && !url.username && !url.password && typeof isTopLevel === "boolean";
  const ownedPortal = valid && url.origin === "https://billing.stripe.com";
  const expectedReturn = valid && url.origin === "https://sajda.example.test" && url.pathname === "/plus"
    && url.search === "?billing=return" && !url.hash;
  const stripeEmbed = valid && ["https://js.stripe.com", "https://r.stripe.com", "https://m.stripe.network"].includes(url.origin);
  return { category: ownedPortal ? "owned_portal_origin" : expectedReturn ? "expected_safe_return" : stripeEmbed ? "known_stripe_embed" : "unrecognized_origin",
    isTopLevel: isTopLevel === true, expectedSafeReturn: expectedReturn === true,
    abort: !ownedPortal, unexpected: !ownedPortal && !(expectedReturn && isTopLevel === true || stripeEmbed && isTopLevel === false) };
}

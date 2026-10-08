/** Pure configuration fences for the opt-in Preview auth probe. No I/O. */
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
export const AUTH_LIFECYCLE_PROJECT = Object.freeze({ projectId: "prj_UO900Jp4qJF1eS4hkOrebIzwMVlI", orgId: "team_GP2MTfBKmxj8ajYLvQtV7clA" });

export function authLifecycleConfiguration({ preview, production, development, linkedProject, origin, expectedHost, expectedCommit, actualCommit, now = Date.now() }) {
  requireCondition(linkedProject?.projectId === AUTH_LIFECYCLE_PROJECT.projectId && linkedProject?.orgId === AUTH_LIFECYCLE_PROJECT.orgId, "wrong_project");
  requireCondition(typeof expectedCommit === "string" && /^[a-f0-9]{40}$/u.test(expectedCommit) && actualCommit === expectedCommit, "source_commit_mismatch");
  let target, database, productionDatabase, claims;
  try {
    target = new URL(origin); database = new URL(preview.DATABASE_URL); productionDatabase = new URL(production.DATABASE_URL);
    claims = JSON.parse(Buffer.from((development.VERCEL_OIDC_TOKEN ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch { throw new Error("invalid_private_configuration"); }
  requireCondition(target.protocol === "https:" && /^sajda-[a-z0-9]{9}-hypbit\.vercel\.app$/u.test(target.hostname)
    && target.pathname === "/" && !target.search && !target.hash && !target.port && !target.username && !target.password, "invalid_preview_origin");
  for (const connection of [database, productionDatabase]) requireCondition(["postgres:", "postgresql:"].includes(connection.protocol)
    && connection.hostname.endsWith(".neon.tech") && connection.username && connection.password && connection.pathname.length > 1 && !connection.hash, "invalid_database");
  requireCondition(typeof expectedHost === "string" && database.hostname === expectedHost, "preview_database_mismatch");
  const identity = value => `${value.hostname.replace("-pooler.", ".")}${value.pathname}`;
  requireCondition(identity(database) !== identity(productionDatabase), "production_database_forbidden");
  requireCondition(development.VERCEL_OIDC_TOKEN && claims.project_id === linkedProject.projectId && claims.owner_id === linkedProject.orgId
    && claims.environment === "development" && Number.isFinite(claims.exp) && claims.exp * 1000 > now + 300_000, "invalid_development_access");
  database.searchParams.set("sslmode", "verify-full"); database.searchParams.delete("options");
  return { origin: target.origin, database: database.toString(), protectionToken: development.VERCEL_OIDC_TOKEN };
}

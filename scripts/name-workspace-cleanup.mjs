/** Bounded cleanup for exactly two run-bound synthetic Preview SDK owners.
 * Receives an already fenced database. Never allocates or loads credentials.
 * A lost ACK is not proof of failure; only a positive reread proves absence.
 */
import { createHash } from "node:crypto";

const check = (condition, code) => { if (!condition) throw new Error(code); };
const invalid = "name_workspace_fixture_invalid", mismatch = "name_workspace_fixture_binding_mismatch";
const unconfirmed = "name_workspace_cleanup_unconfirmed";
const validId = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(id);

function fixturePlan(runId, users, testIp) {
  check(typeof runId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(runId), invalid);
  check(typeof testIp === "string" && /^2001:db8:[a-f0-9]{4}:[a-f0-9]{4}::1$/u.test(testIp), invalid);
  const emails = ["a", "b"].map(suffix => `name-workspace-${runId}-${suffix}@example.test`);
  check(Array.isArray(users) && users.length <= 2 && users.every(user => user && Object.keys(user).length === 2
    && validId(user.id) && emails.includes(user.email))
    && new Set(users.map(user => user.id)).size === users.length
    && new Set(users.map(user => user.email)).size === users.length, invalid);
  return { emails, owners: users.map(user => ({ id: user.id, email: user.email })) };
}
function validateRows(rows, emails, owners) {
  check(Array.isArray(rows) && rows.length <= 2 && rows.every(row => validId(row.id) && emails.includes(row.email)
    && owners.every(owner => owner.id !== row.id && owner.email !== row.email || owner.id === row.id && owner.email === row.email))
    && new Set(rows.map(row => row.id)).size === rows.length
    && new Set(rows.map(row => row.email)).size === rows.length, mismatch);
  return rows;
}
async function boundRows(database, emails, owners) {
  return validateRows((await database.query("SELECT id,email FROM public.sajda_auth_user WHERE email=ANY($1::text[]) OR id=ANY($2::text[])",
    [emails, owners.map(owner => owner.id)])).rows, emails, owners);
}
async function ownerRows(database, owner) {
  return validateRows((await database.query("SELECT id,email FROM public.sajda_auth_user WHERE id=$1 OR email=$2", [owner.id, owner.email])).rows, [owner.email], [owner]);
}
async function removeUser(database, owner) {
  if ((await ownerRows(database, owner)).length === 0) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await database.query("DELETE FROM public.sajda_auth_user WHERE id=$1 AND email=$2 RETURNING id", [owner.id, owner.email]); } catch { /* ACK unknown; reread. */ }
    try { if ((await ownerRows(database, owner)).length === 0) return true; }
    catch (error) { if (error.message === mismatch) throw error; }
  }
  return false;
}
async function zero(database, sql, values) {
  try {
    const rows = (await database.query(sql, values)).rows;
    return Array.isArray(rows) && rows.length === 1 && rows[0].count === 0;
  } catch { return false; }
}
async function removeAndConfirm(database, deletion, confirmation, values) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await database.query(deletion, values); } catch { /* ACK unknown; confirm before retry. */ }
    if (await zero(database, confirmation, values)) return true;
  }
  return false;
}

export async function cleanupNameWorkspaceFixtures(database, { runId, users, testIp }) {
  const { emails, owners } = fixturePlan(runId, users, testIp);
  let allocated;
  try { allocated = await boundRows(database, emails, owners); }
  catch (error) { throw new Error(error.message === mismatch ? mismatch : unconfirmed); }
  // Include SDK ids already acknowledged even if their user row is now absent.
  // Unknown ids may only be reconciled by one of these two exact fixture emails.
  for (const row of allocated) if (!owners.some(owner => owner.email === row.email)) owners.push({ id: row.id, email: row.email });
  let verified = true;
  for (const owner of owners) {
    try {
      if (!await removeUser(database, owner)) verified = false;
      if (!await removeAndConfirm(database, "DELETE FROM public.sajda_auth_verification WHERE value=$1",
        "SELECT count(*)::integer AS count FROM public.sajda_auth_verification WHERE value=$1", [owner.id])) verified = false;
      for (const table of ["sajda.name_projects", "sajda.name_project_domains"])
        if (!await zero(database, `SELECT count(*)::integer AS count FROM ${table} WHERE owner_id=$1`, [owner.id])) verified = false;
      for (const table of ["sajda_auth_account", "sajda_auth_session"])
        if (!await zero(database, `SELECT count(*)::integer AS count FROM public.${table} WHERE "userId"=$1`, [owner.id])) verified = false;
      for (const scope of ["name-projects", "saved-domains"]) {
        const hash = createHash("sha256").update(scope === "name-projects" ? `name-projects:preview:${owner.id}` : `saved-domains:${owner.id}`).digest("hex");
        const deletion = scope === "name-projects"
          ? "DELETE FROM sajda.function_rate_limits WHERE scope='name-projects' AND subject_hash=$1"
          : "DELETE FROM sajda.function_rate_limits WHERE scope='saved-domains' AND subject_hash=$1";
        const confirmation = scope === "name-projects"
          ? "SELECT count(*)::integer AS count FROM sajda.function_rate_limits WHERE scope='name-projects' AND subject_hash=$1"
          : "SELECT count(*)::integer AS count FROM sajda.function_rate_limits WHERE scope='saved-domains' AND subject_hash=$1";
        if (!await removeAndConfirm(database, deletion, confirmation, [hash])) verified = false;
      }
    } catch { verified = false; /* Continue the other independently bound owner. */ }
  }
  const keys = ["/sign-up/email", "/verify-email"].map(route => `${testIp}|${route}`);
  if (!await removeAndConfirm(database, "DELETE FROM public.sajda_auth_rate_limit WHERE key=ANY($1::text[])",
    "SELECT count(*)::integer AS count FROM public.sajda_auth_rate_limit WHERE key=ANY($1::text[])", [keys])) verified = false;
  try { if ((await boundRows(database, emails, owners)).length !== 0) verified = false; } catch { verified = false; }
  check(verified, unconfirmed);
  return { retiredFixtures: allocated.length, remainingFixtures: 0 };
}

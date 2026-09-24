import { createHash } from "node:crypto";
import { Pool } from "pg";
import { NAME_PROJECT_LIMIT, nameProjectBriefSchema, nameProjectInputSchema, nameProjectSchema, type NameProject, type NameProjectInput } from "../../shared/name-projects.js";
import { AccountAccessError } from "./account-error.js";

export interface NameProjectsClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface NameProjectsPool { connect(): Promise<NameProjectsClient> }
const unavailable = () => new AccountAccessError("name_projects_unavailable", 503,
  "Name projects are temporarily unavailable. A save may have completed; retry the same save before editing again.");
const conflict = () => new AccountAccessError("project_conflict", 409,
  "This project changed in another session. Reload it before saving again.");
const hash = (input: string) => createHash("sha256").update(input).digest("hex");
// jsonb::text includes separator spaces. A compact HTTP envelope can fit while
// its stored payload exceeds the existing database constraint. Reject that as
// editable input, not an uncertain write which a client would retry forever.
function jsonbTextSize(value: unknown): number {
  const serialize = (item: unknown): string => Array.isArray(item) ? `[${item.map(serialize).join(", ")}]`
    : item !== null && typeof item === "object" ? `{${Object.entries(item).filter(([, nested]) => nested !== undefined).map(([key, nested]) => `${JSON.stringify(key)}: ${serialize(nested)}`).join(", ")}}`
      : JSON.stringify(item);
  return Buffer.byteLength(serialize(value), "utf8");
}
let pool: Pool | undefined;
let poolUrl: string | undefined;
function runtimePool(connection: string): NameProjectsPool {
  if (pool && poolUrl === connection) return pool;
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  if (pool) void pool.end().catch(() => undefined);
  pool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  pool.on("error", () => console.error(JSON.stringify({ event: "name_projects_database_failed" })));
  poolUrl = connection;
  return pool;
}
function checkedOwner(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
  }
  return value;
}
function instant(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString();
}
function parsedRow(row: Record<string, unknown>, owner: string, namespace: string): NameProject {
  if (row.owner_id !== owner || row.namespace !== namespace || !row.payload || typeof row.payload !== "object"
    || Array.isArray(row.payload) || typeof row.last_input_hash !== "string" || !/^[a-f0-9]{64}$/u.test(row.last_input_hash)) throw unavailable();
  const createdAt = instant(row.created_at), updatedAt = instant(row.updated_at);
  if (updatedAt < createdAt) throw unavailable();
  const parsed = nameProjectSchema.parse({ ...row.payload, id: row.id, version: row.version,
    shortlistDomains: row.shortlist_domains, createdAt, updatedAt }) as NameProject;
  if (new Set(parsed.shortlistDomains).size !== parsed.shortlistDomains.length) throw unavailable();
  return parsed;
}
// This read uses both ownership FKs. A saved original deleted elsewhere drops
// out of the shortlist automatically; no stale snapshot is presented as live.
const columns = `p.namespace, p.owner_id, p.id::text, p.payload, p.version, p.last_input_hash, p.created_at, p.updated_at,
  ARRAY(SELECT d.domain FROM sajda.name_project_domains d
    JOIN sajda.saved_domains s ON s.user_id=d.owner_id AND s.domain=d.domain
    WHERE d.namespace=p.namespace AND d.owner_id=p.owner_id AND d.project_id=p.id ORDER BY d.position) AS shortlist_domains`;

export function createNameProjectsStore(deps: { pool?: NameProjectsPool; environment?: () => NodeJS.ProcessEnv } = {}) {
  async function transaction<T>(write: boolean, run: (client: NameProjectsClient, namespace: string) => Promise<T>): Promise<T> {
    let client: NameProjectsClient | undefined, destroy = false;
    try {
      const env = deps.environment?.() ?? process.env;
      const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
      if (!namespace || !["development", "preview", "production"].includes(namespace) || (!deps.pool && !env.DATABASE_URL)) throw unavailable();
      client = await (deps.pool ?? runtimePool(env.DATABASE_URL!)).connect();
      await client.query(write ? "BEGIN" : "BEGIN READ ONLY");
      await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
      const result = await run(client, namespace);
      await client.query("COMMIT"); return result;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { client?.release(destroy); }
  }
  async function requireOwner(client: NameProjectsClient, owner: string) {
    const result = await client.query(`/* projects:owner */ SELECT id AS owner_id FROM public.sajda_auth_user
      WHERE id=$1 AND "emailVerified"=true FOR KEY SHARE`, [owner]);
    if (result.rows.length !== 1 || result.rows[0].owner_id !== owner) {
      throw new AccountAccessError("invalid_session", 401, "Sign in with your verified Sajda account again.");
    }
  }
  async function list(client: NameProjectsClient, owner: string, namespace: string) {
    const result = await client.query(`/* projects:list */ SELECT ${columns} FROM sajda.name_projects p
      WHERE p.owner_id=$1 AND p.namespace=$2 ORDER BY p.updated_at DESC, p.id DESC LIMIT $3`, [owner, namespace, NAME_PROJECT_LIMIT]);
    if (result.rows.length > NAME_PROJECT_LIMIT) throw unavailable();
    const projects = result.rows.map(row => parsedRow(row, owner, namespace));
    if (new Set(projects.map(project => project.id)).size !== projects.length) throw unavailable();
    return projects;
  }
  return {
    async limit(ownerId: string) {
      const owner = checkedOwner(ownerId);
      const count = await transaction(true, async (client, namespace) => {
        const result = await client.query(`/* projects:limit */ INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
          VALUES('name-projects',$1,date_trunc('minute',statement_timestamp()),1)
          ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET
            request_count=LEAST(sajda.function_rate_limits.request_count+1,61),updated_at=statement_timestamp()
          RETURNING request_count`, [hash(`name-projects:${namespace}:${owner}`)]);
        const value = Number(result.rows[0]?.request_count);
        if (!Number.isSafeInteger(value) || value < 1) throw unavailable();
        return value;
      });
      if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many project requests. Wait a minute and retry.");
    },
    async read(ownerId: string): Promise<NameProject[]> {
      const owner = checkedOwner(ownerId);
      // The owner is verified without locking because READ ONLY cannot lock.
      return transaction(false, async (client, namespace) => {
        const result = await client.query(`/* projects:read-owner */ SELECT id AS owner_id FROM public.sajda_auth_user WHERE id=$1 AND "emailVerified"=true`, [owner]);
        if (result.rows.length !== 1 || result.rows[0].owner_id !== owner) throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
        return list(client, owner, namespace);
      });
    },
    async save(ownerId: string, raw: NameProjectInput): Promise<NameProject[]> {
      const owner = checkedOwner(ownerId);
      const parsed = nameProjectInputSchema.safeParse(raw);
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Enter valid project details and saved-domain references.");
      const input = parsed.data;
      const { id, expectedVersion, shortlistDomains, ...suppliedPayload } = input;
      const inputHash = hash(JSON.stringify(input));
      return transaction(true, async (client, namespace) => {
        await client.query("/* projects:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sajda.name-projects.v1:${namespace}:${owner}`]);
        await requireOwner(client, owner);
        const current = await client.query(`/* projects:current */ SELECT ${columns} FROM sajda.name_projects p
          WHERE p.owner_id=$1 AND p.namespace=$2 AND p.id=$3::uuid FOR UPDATE OF p`, [owner, namespace, id]);
        if (current.rows.length > 1) throw unavailable();
        const existing = current.rows[0];
        const existingProject = existing ? parsedRow(existing, owner, namespace) : null;
        const payload = { ...suppliedPayload, ...(suppliedPayload.brandShortlist === undefined && existingProject?.brandShortlist !== undefined
          ? { brandShortlist: existingProject.brandShortlist } : {}) };
        if (jsonbTextSize(payload) > 32768) throw new AccountAccessError("invalid_request", 400, "This project is too large. Shorten notes or remove a saved package before saving again.");
        if (existing) {
          const project = existingProject!;
          if (project.version !== expectedVersion) {
            if (project.version !== expectedVersion + 1 || existing.last_input_hash !== inputHash) throw conflict();
            const persistedBrief = nameProjectBriefSchema.parse(existing.payload);
            const originalOrder = project.shortlistDomains.map(domain => shortlistDomains.indexOf(domain));
            if (JSON.stringify(persistedBrief) !== JSON.stringify(payload)
              || originalOrder.some((position, index) => position < 0 || index > 0 && position <= originalOrder[index - 1])) throw conflict();
            // A saved-domain deletion may have removed a reference since this
            // operation committed. A retry returns current state, never restores it.
            return list(client, owner, namespace);
          }
        } else {
          if (expectedVersion !== 0) throw conflict();
          const total = await client.query("/* projects:count */ SELECT count(*)::integer AS count FROM sajda.name_projects WHERE owner_id=$1 AND namespace=$2", [owner, namespace]);
          const count = total.rows[0]?.count;
          if (!Number.isSafeInteger(count) || Number(count) < 0) throw unavailable();
          if (Number(count) >= NAME_PROJECT_LIMIT) throw new AccountAccessError("project_limit", 409, "This workspace has reached its project storage limit. Update an existing project to continue.");
        }
        if (shortlistDomains.length) {
          // Lock the actual saved rows so concurrent deletion either completes
          // first or waits until the FK-protected shortlist commits.
          const saved = await client.query(`/* projects:saved */ SELECT domain FROM sajda.saved_domains
            WHERE user_id=$1 AND domain=ANY($2::text[]) ORDER BY domain FOR KEY SHARE`, [owner, shortlistDomains]);
          if (saved.rows.length !== shortlistDomains.length || saved.rows.some(row => typeof row.domain !== "string" || !shortlistDomains.includes(row.domain))
            || new Set(saved.rows.map(row => row.domain)).size !== shortlistDomains.length) {
            throw new AccountAccessError("saved_domain_required", 409, "Save each domain to this account before adding it to a project. Reload if a saved domain was removed.");
          }
        }
        const params = [owner, namespace, id, JSON.stringify(payload), inputHash];
        const result = existing
          ? await client.query(`/* projects:update */ UPDATE sajda.name_projects SET payload=$4::jsonb,last_input_hash=$5,version=version+1,updated_at=statement_timestamp()
              WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid AND version=$6 RETURNING id`, [...params, expectedVersion])
          : await client.query(`/* projects:insert */ INSERT INTO sajda.name_projects(namespace,owner_id,id,payload,last_input_hash)
              VALUES($2,$1,$3::uuid,$4::jsonb,$5) RETURNING id`, params);
        if (result.rows.length !== 1 || result.rows[0].id !== id) throw conflict();
        await client.query("/* projects:unlink */ DELETE FROM sajda.name_project_domains WHERE owner_id=$1 AND namespace=$2 AND project_id=$3::uuid", [owner, namespace, id]);
        if (shortlistDomains.length) await client.query(`/* projects:link */ INSERT INTO sajda.name_project_domains(namespace,owner_id,project_id,domain,position)
          SELECT $2,$1,$3::uuid,domain,(ordinality-1)::integer FROM unnest($4::text[]) WITH ORDINALITY AS shortlist(domain,ordinality)`, [owner, namespace, id, shortlistDomains]);
        return list(client, owner, namespace);
      });
    },
  };
}
export const nameProjectsStore = createNameProjectsStore();

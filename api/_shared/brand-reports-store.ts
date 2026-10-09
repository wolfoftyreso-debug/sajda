import { createHash } from "node:crypto";
import { Pool } from "pg";
import { assessBrandPresence, brandIndexInputSchema } from "../../shared/brand-presence-index.js";
import { BRAND_REPORT_LIMIT, BRAND_REPORT_MAX_BYTES, BRAND_REPORT_VERSION_LIMIT, brandReportSaveSchema,
  brandReportSelectorSchema, brandReportSnapshotSchema, brandReportSummarySchema, brandReportVersionSummarySchema,
  type BrandReportSaveInput, type BrandReportSelector, type BrandReportSnapshot } from "../../shared/brand-reports.js";
import { AccountAccessError } from "./account-error.js";

export interface BrandReportsClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface BrandReportsPool { connect(): Promise<BrandReportsClient> }
const unavailable = () => new AccountAccessError("brand_reports_unavailable", 503,
  "Brand reports are temporarily unavailable. A save may have completed; retry the same save before editing again.");
const notFound = () => new AccountAccessError("report_not_found", 404, "This report is not available in your account.");
const conflict = () => new AccountAccessError("report_conflict", 409,
  "This report changed in another session. Reload the latest version before saving again.");
const invalid = () => new AccountAccessError("invalid_request", 400, "Enter valid report details and original self-assessment declarations.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
// Match PostgreSQL's JSONB separator overhead before attempting a write.
function jsonbTextSize(value: unknown): number {
  const serialize = (item: unknown): string => Array.isArray(item) ? `[${item.map(serialize).join(", ")}]`
    : item !== null && typeof item === "object" ? `{${Object.entries(item).filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => `${JSON.stringify(key)}: ${serialize(nested)}`).join(", ")}}` : JSON.stringify(item);
  return Buffer.byteLength(serialize(value), "utf8");
}
let pool: Pool | undefined;
let poolUrl: string | undefined;
function runtimePool(connection: string): BrandReportsPool {
  if (pool && poolUrl === connection) return pool;
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  if (pool) void pool.end().catch(() => undefined);
  pool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  pool.on("error", () => console.error(JSON.stringify({ event: "brand_reports_database_failed" })));
  poolUrl = connection;
  return pool;
}
function checkedOwner(owner: string): string {
  if (typeof owner !== "string" || !owner.trim() || owner.length > 200) {
    throw new AccountAccessError("invalid_session", 401, "Sign in to your Sajda account again.");
  }
  return owner;
}
function instant(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString();
}
function checkOwnership(row: Record<string, unknown>, owner: string, namespace: string): void {
  if (row.owner_id !== owner || row.namespace !== namespace) throw unavailable();
}
function summary(row: Record<string, unknown>, owner: string, namespace: string) {
  checkOwnership(row, owner, namespace);
  return brandReportSummarySchema.parse({ id: row.id, title: row.title, version: row.version,
    createdAt: instant(row.created_at), updatedAt: instant(row.updated_at) });
}
function snapshot(row: Record<string, unknown>, owner: string, namespace: string, now: number): BrandReportSnapshot {
  checkOwnership(row, owner, namespace);
  const assessment = brandIndexInputSchema.parse(row.assessment);
  return brandReportSnapshotSchema.parse({ id: row.report_id, title: row.title, version: row.version,
    savedAt: instant(row.saved_at), assessment, result: assessBrandPresence(assessment, now) });
}
const snapshotColumns = "v.namespace, v.owner_id, v.report_id::text, v.version, v.title, v.assessment, v.saved_at";

export function createBrandReportsStore(deps: {
  pool?: BrandReportsPool; environment?: () => NodeJS.ProcessEnv; now?: () => number;
} = {}) {
  async function transaction<T>(write: boolean, run: (client: BrandReportsClient, namespace: string) => Promise<T>): Promise<T> {
    let client: BrandReportsClient | undefined, destroy = false;
    try {
      const env = deps.environment?.() ?? process.env;
      const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
      if (!namespace || !["development", "preview", "production"].includes(namespace) || (!deps.pool && !env.DATABASE_URL)) throw unavailable();
      client = await (deps.pool ?? runtimePool(env.DATABASE_URL!)).connect();
      await client.query(write ? "BEGIN" : "BEGIN READ ONLY");
      await client.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
      const result = await run(client, namespace);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { client?.release(destroy); }
  }
  async function requireOwner(client: BrandReportsClient, owner: string, write = false) {
    const result = await client.query(`/* brand-reports:owner */ SELECT id AS owner_id FROM public.sajda_auth_user
      WHERE id=$1 AND "emailVerified"=true ${write ? "FOR KEY SHARE" : ""}`, [owner]);
    if (result.rows.length !== 1 || result.rows[0].owner_id !== owner) {
      throw new AccountAccessError("invalid_session", 401, "Sign in with your verified Sajda account again.");
    }
  }
  function selector(value: BrandReportSelector): BrandReportSelector {
    const result = brandReportSelectorSchema.safeParse(value);
    if (!result.success) throw invalid();
    return result.data;
  }
  async function readSnapshot(client: BrandReportsClient, owner: string, namespace: string, input: BrandReportSelector) {
    const result = await client.query(`/* brand-reports:get */ SELECT ${snapshotColumns} FROM sajda.brand_report_versions v
      JOIN sajda.brand_reports p ON p.namespace=v.namespace AND p.owner_id=v.owner_id AND p.id=v.report_id
      WHERE v.owner_id=$1 AND v.namespace=$2 AND v.report_id=$3::uuid AND v.version=COALESCE($4::integer,p.version)`,
    [owner, namespace, input.id, input.version ?? null]);
    if (!result.rows.length) throw notFound();
    if (result.rows.length !== 1) throw unavailable();
    return snapshot(result.rows[0], owner, namespace, deps.now?.() ?? Date.now());
  }
  return {
    async limit(ownerId: string): Promise<void> {
      const owner = checkedOwner(ownerId);
      const count = await transaction(true, async (client, namespace) => {
        const result = await client.query(`/* brand-reports:limit */ INSERT INTO sajda.function_rate_limits(scope,subject_hash,window_started_at,request_count)
          VALUES('brand-reports',$1,date_trunc('minute',statement_timestamp()),1)
          ON CONFLICT(scope,subject_hash,window_started_at) DO UPDATE SET
            request_count=LEAST(sajda.function_rate_limits.request_count+1,61),updated_at=statement_timestamp()
          RETURNING request_count`, [hash(`brand-reports:${namespace}:${owner}`)]);
        const value = Number(result.rows[0]?.request_count);
        if (!Number.isSafeInteger(value) || value < 1) throw unavailable();
        return value;
      });
      if (count > 60) throw new AccountAccessError("rate_limited", 429, "Too many report requests. Wait a minute and retry.");
    },
    async list(ownerId: string) {
      const owner = checkedOwner(ownerId);
      return transaction(false, async (client, namespace) => {
        await requireOwner(client, owner);
        const result = await client.query(`/* brand-reports:list */ SELECT namespace,owner_id,id::text,title,version,created_at,updated_at
          FROM sajda.brand_reports WHERE owner_id=$1 AND namespace=$2 ORDER BY updated_at DESC,id DESC LIMIT $3`,
        [owner, namespace, BRAND_REPORT_LIMIT + 1]);
        if (result.rows.length > BRAND_REPORT_LIMIT) throw unavailable();
        const reports = result.rows.map(row => summary(row, owner, namespace));
        if (new Set(reports.map(report => report.id)).size !== reports.length) throw unavailable();
        return reports;
      });
    },
    async get(ownerId: string, raw: BrandReportSelector): Promise<BrandReportSnapshot> {
      const owner = checkedOwner(ownerId), input = selector(raw);
      return transaction(false, async (client, namespace) => {
        await requireOwner(client, owner);
        return readSnapshot(client, owner, namespace, input);
      });
    },
    async history(ownerId: string, id: string) {
      const owner = checkedOwner(ownerId), input = selector({ id });
      return transaction(false, async (client, namespace) => {
        await requireOwner(client, owner);
        const result = await client.query(`/* brand-reports:history */ SELECT ${snapshotColumns} FROM sajda.brand_report_versions v
          WHERE v.owner_id=$1 AND v.namespace=$2 AND v.report_id=$3::uuid ORDER BY v.version DESC LIMIT $4`,
        [owner, namespace, input.id, BRAND_REPORT_VERSION_LIMIT + 1]);
        if (!result.rows.length) throw notFound();
        if (result.rows.length > BRAND_REPORT_VERSION_LIMIT) throw unavailable();
        const versions = result.rows.map(row => {
          checkOwnership(row, owner, namespace);
          return brandReportVersionSummarySchema.parse({ id: row.report_id, title: row.title, version: row.version, savedAt: instant(row.saved_at) });
        });
        if (new Set(versions.map(item => item.version)).size !== versions.length) throw unavailable();
        return versions;
      });
    },
    async save(ownerId: string, raw: BrandReportSaveInput): Promise<BrandReportSnapshot> {
      const owner = checkedOwner(ownerId), parsed = brandReportSaveSchema.safeParse(raw);
      if (!parsed.success) throw invalid();
      const input = parsed.data;
      if (jsonbTextSize(input.assessment) > BRAND_REPORT_MAX_BYTES) {
        throw new AccountAccessError("request_too_large", 413, "This report is too large. Shorten the declarations or sources before saving.");
      }
      const inputHash = hash(JSON.stringify(input));
      return transaction(true, async (client, namespace) => {
        await client.query("/* brand-reports:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sajda.brand-reports.v1:${namespace}:${owner}`]);
        await requireOwner(client, owner, true);
        const receipt = await client.query(`/* brand-reports:receipt */ SELECT ${snapshotColumns},r.input_hash
          FROM sajda.brand_report_requests r JOIN sajda.brand_report_versions v
            ON v.namespace=r.namespace AND v.owner_id=r.owner_id AND v.report_id=r.report_id AND v.version=r.version
          WHERE r.owner_id=$1 AND r.namespace=$2 AND r.request_key=$3::uuid`, [owner, namespace, input.requestKey]);
        if (receipt.rows.length > 1) throw unavailable();
        if (receipt.rows[0]) {
          if (receipt.rows[0].input_hash !== inputHash) {
            throw new AccountAccessError("report_request_conflict", 409, "This save identifier was already used for different report details. Reload before starting a new save.");
          }
          const original = snapshot(receipt.rows[0], owner, namespace, deps.now?.() ?? Date.now());
          if (original.id !== input.id || original.version !== input.expectedVersion + 1 || original.title !== input.title
            || JSON.stringify(original.assessment) !== JSON.stringify(input.assessment)) throw unavailable();
          // A late retry returns its original immutable revision, never the latest
          // report and never re-applies a stale payload after subsequent edits.
          return original;
        }
        const current = await client.query(`/* brand-reports:current */ SELECT namespace,owner_id,id::text,title,version,created_at,updated_at
          FROM sajda.brand_reports WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid FOR UPDATE`, [owner, namespace, input.id]);
        if (current.rows.length > 1) throw unavailable();
        const existing = current.rows[0] ? summary(current.rows[0], owner, namespace) : null;
        if (!existing) {
          if (input.expectedVersion !== 0) throw notFound();
          const total = await client.query("/* brand-reports:count */ SELECT count(*)::integer AS count FROM sajda.brand_reports WHERE owner_id=$1 AND namespace=$2", [owner, namespace]);
          const count = total.rows[0]?.count;
          if (!Number.isSafeInteger(count) || Number(count) < 0) throw unavailable();
          if (Number(count) >= BRAND_REPORT_LIMIT) {
            throw new AccountAccessError("report_limit", 409, "Your account has reached its report storage limit. Update an existing report to continue.");
          }
        } else if (existing.version !== input.expectedVersion) throw conflict();
        if (existing && existing.version >= BRAND_REPORT_VERSION_LIMIT) {
          throw new AccountAccessError("report_version_limit", 409, "This report has reached its revision limit. Create a separate report to continue; the existing history is retained.");
        }
        const nextVersion = input.expectedVersion + 1;
        const report = existing
          ? await client.query(`/* brand-reports:update */ UPDATE sajda.brand_reports SET title=$4,version=$5,updated_at=statement_timestamp()
              WHERE owner_id=$1 AND namespace=$2 AND id=$3::uuid AND version=$6 RETURNING id::text`,
            [owner, namespace, input.id, input.title, nextVersion, input.expectedVersion])
          : await client.query(`/* brand-reports:insert */ INSERT INTO sajda.brand_reports(namespace,owner_id,id,title,version)
              VALUES($2,$1,$3::uuid,$4,$5) RETURNING id::text`, [owner, namespace, input.id, input.title, nextVersion]);
        if (report.rows.length !== 1 || report.rows[0].id !== input.id) throw conflict();
        const saved = await client.query(`/* brand-reports:version */ INSERT INTO sajda.brand_report_versions(namespace,owner_id,report_id,version,title,assessment)
          VALUES($2,$1,$3::uuid,$4,$5,$6::jsonb) RETURNING namespace,owner_id,report_id::text,version,title,assessment,saved_at`,
        [owner, namespace, input.id, nextVersion, input.title, JSON.stringify(input.assessment)]);
        if (saved.rows.length !== 1) throw unavailable();
        const result = snapshot(saved.rows[0], owner, namespace, deps.now?.() ?? Date.now());
        const ledger = await client.query(`/* brand-reports:record-receipt */ INSERT INTO sajda.brand_report_requests(namespace,owner_id,request_key,report_id,version,input_hash)
          VALUES($2,$1,$3::uuid,$4::uuid,$5,$6) RETURNING request_key::text`, [owner, namespace, input.requestKey, input.id, nextVersion, inputHash]);
        if (ledger.rows.length !== 1 || ledger.rows[0].request_key !== input.requestKey) throw unavailable();
        return result;
      });
    },
  };
}
export const brandReportsStore = createBrandReportsStore();

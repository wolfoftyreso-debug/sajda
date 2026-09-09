import { createHash } from "node:crypto";
import { parse } from "tldts";
import { discoverSource } from "./lost-domains-engine.js";
import { safeHttpsUrl } from "./lost-domains-fetch.js";

export class SourceCatalogError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SourceCatalogError"; }
}
export interface ReviewedSource {
  id: string; name: string; url: string; host: string;
  review: { basis: "owner_permission" | "published_terms"; reference: string; reviewer: string; reviewedAt: string; expiresAt: string };
}
export interface SourceManifest { version: 1; sources: ReviewedSource[] }
export interface SourceProbe { id: string; sourceUrl: string; observedAt: string; candidateCount: number;
  excludedCount: number; evidenceHash: string; registrabilityChecked: false }
export interface SourceCatalogClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface SourceCatalogPool { connect(): Promise<SourceCatalogClient> }
const stop = (code: string): never => { throw new SourceCatalogError(code); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const plain = (value: unknown, max: number): value is string => typeof value === "string" && value === value.trim()
  && value.length > 0 && value.length <= max && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : stop("invalid_manifest");
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(",") !== keys.sort().join(",")) stop("invalid_manifest");
}
function timestamp(value: unknown): string {
  if (!plain(value, 30) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return stop("invalid_review");
  const time = new Date(value);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== value.replace(/(?<!\.\d{3})Z$/u, ".000Z")) return stop("invalid_review");
  return time.toISOString();
}
/** Robots is a live crawl constraint, not evidence of a commercial data licence. */
export function validateSourceManifest(value: unknown, now = Date.now()): SourceManifest {
  const manifest = object(value); exactKeys(manifest, ["version", "sources"]);
  if (manifest.version !== 1 || !Array.isArray(manifest.sources) || manifest.sources.length < 1 || manifest.sources.length > 24) return stop("invalid_manifest");
  const sources = manifest.sources.map(raw => {
    const row = object(raw); exactKeys(row, ["id", "name", "url", "host", "review"]);
    if (!plain(row.id, 36) || !uuid.test(row.id) || !plain(row.name, 120) || !plain(row.url, 2048) || !plain(row.host, 253)) return stop("invalid_source");
    let url: URL;
    try { url = safeHttpsUrl(row.url); } catch { return stop("invalid_source"); }
    const domain = parse(url.hostname, { allowPrivateDomains: true });
    if (url.href !== row.url || url.hostname !== row.host || url.search || url.hash || !domain.isIcann || domain.isPrivate
      || ["example.com", "example.net", "example.org"].includes(domain.domain ?? "")) return stop("invalid_source");
    const review = object(row.review); exactKeys(review, ["basis", "reference", "reviewer", "reviewedAt", "expiresAt"]);
    if (!["owner_permission", "published_terms"].includes(String(review.basis)) || !plain(review.reference, 220)
      || !plain(review.reviewer, 80) || !/^[a-z0-9_.:@-]+$/iu.test(review.reviewer)) return stop("invalid_review");
    if (review.basis === "published_terms") {
      try { const terms = safeHttpsUrl(review.reference); if (terms.search || terms.pathname === "/robots.txt") return stop("invalid_review"); }
      catch { return stop("invalid_review"); }
    } else if (/^https:\/\//iu.test(review.reference)) {
      try { const permission = safeHttpsUrl(review.reference); if (permission.search || permission.hash) return stop("invalid_review"); }
      catch { return stop("invalid_review"); }
    } else if (!/^(?:ticket|permission):[a-z0-9_.:/-]+$/iu.test(review.reference)) return stop("invalid_review");
    const reviewedAt = timestamp(review.reviewedAt), expiresAt = timestamp(review.expiresAt);
    if (Date.parse(reviewedAt) > now || Date.parse(reviewedAt) < now - 30 * 86_400_000 || Date.parse(expiresAt) <= now
      || Date.parse(expiresAt) > Date.parse(reviewedAt) + 30 * 86_400_000) return stop("review_expired");
    return { id: row.id.toLowerCase(), name: row.name, url: url.href, host: url.hostname,
      review: { basis: review.basis as ReviewedSource["review"]["basis"], reference: review.reference, reviewer: review.reviewer, reviewedAt, expiresAt } };
  });
  if (new Set(sources.map(row => row.id)).size !== sources.length || new Set(sources.map(row => row.url)).size !== sources.length) return stop("duplicate_source");
  return { version: 1, sources };
}
export function sourceManifestHash(manifest: SourceManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
function reviewReference(source: ReviewedSource, probe?: SourceProbe): string {
  const value = JSON.stringify({ v: 1, basis: source.review.basis, ref: source.review.reference, by: source.review.reviewer,
    ...(probe ? { observed: probe.observedAt, evidence: probe.evidenceHash } : {}) });
  if (value.length > 500) return stop("review_reference_too_long");
  return value;
}
function sameReview(value: unknown, source: ReviewedSource): boolean {
  try {
    const old = JSON.parse(String(value));
    return old.v === 1 && old.basis === source.review.basis && old.ref === source.review.reference && old.by === source.review.reviewer;
  } catch { return false; }
}
const storedDate = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();

/** Operator-only check: source HTML/robots only. Never checks discovered domains. */
export async function probeSourceManifest(value: unknown, deps: { discover?: typeof discoverSource; now?: () => number } = {}): Promise<SourceProbe[]> {
  const now = deps.now ?? Date.now, manifest = validateSourceManifest(value, now()), probes: SourceProbe[] = [];
  for (const source of manifest.sources) {
    const result = await (deps.discover ?? discoverSource)({ url: source.url, allowedHost: source.host, maxLinks: 20 });
    const observed = Date.parse(result.observedAt);
    if (!Number.isFinite(observed) || observed > now() + 1000 || observed < now() - 60_000 || result.candidates.length > 20) return stop("invalid_probe");
    // Hash a minimal provenance snapshot; no page contents, query tokens or
    // raw anchor text enter operator logs or the approved-source table.
    const evidenceHash = createHash("sha256").update(JSON.stringify({ url: source.url, observedAt: result.observedAt,
      links: result.candidates.map(({ domain, sourceUrl, targetUrl, sensitive }) => ({ domain, sourceUrl, targetUrl, sensitive })) })).digest("hex");
    probes.push({ id: source.id, sourceUrl: source.url, observedAt: result.observedAt, candidateCount: result.candidates.length,
      excludedCount: result.candidates.filter(row => row.sensitive).length, evidenceHash, registrabilityChecked: false });
  }
  return probes;
}

/** No table creation, grants, schedules or billing. Registration is disabled. */
export async function applySourceManifest(value: unknown, action: "register" | "enable", pool: SourceCatalogPool,
  deps: { discover?: typeof discoverSource; now?: () => number } = {}) {
  const now = deps.now ?? Date.now, manifest = validateSourceManifest(value, now());
  if (!["register", "enable"].includes(action)) return stop("invalid_action");
  // Fresh evidence is collected in-process, never accepted from manifest/CLI.
  // Network work occurs before the bounded transaction, not while holding locks.
  const probes = action === "enable" ? await probeSourceManifest(manifest, deps) : [];
  validateSourceManifest(manifest, now());
  let client: SourceCatalogClient | undefined, destroy = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='4000ms'; SET LOCAL lock_timeout='1500ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('sajda.lost.source-catalog.v1',0))");
    const changes: { id: string; enabled: boolean; changed: boolean }[] = [];
    for (const source of manifest.sources) {
      const rows = await client.query("SELECT * FROM sajda.lost_domain_sources WHERE id=$1::uuid OR url=$2 FOR UPDATE", [source.id, source.url]);
      const old = rows.rows[0];
      if (old && (rows.rows.length !== 1 || String(old.id) !== source.id || old.url !== source.url || old.host !== source.host
        || old.name !== source.name || old.robots_url !== new URL("/robots.txt", source.url).href
        || storedDate(old.policy_reviewed_at) !== source.review.reviewedAt
        || storedDate(old.policy_expires_at) !== source.review.expiresAt || !sameReview(old.review_reference, source))) return stop("existing_source_conflict");
      if (action === "register") {
        if (!old) await client.query(`INSERT INTO sajda.lost_domain_sources
          (id,name,url,host,robots_url,enabled,robots_policy,policy_reviewed_at,policy_expires_at,review_reference)
          VALUES($1::uuid,$2,$3,$4,$5,false,'allowed',$6::timestamptz,$7::timestamptz,$8)`,
        [source.id, source.name, source.url, source.host, new URL("/robots.txt", source.url).href,
          source.review.reviewedAt, source.review.expiresAt, reviewReference(source)]);
        changes.push({ id: source.id, enabled: old?.enabled === true, changed: !old });
      } else {
        if (!old || old.robots_policy !== "allowed") return stop("source_not_registered");
        const probe = probes.find(row => row.id === source.id)!;
        if (Date.parse(probe.observedAt) < now() - 60_000) return stop("probe_expired");
        await client.query("UPDATE sajda.lost_domain_sources SET enabled=true,review_reference=$2 WHERE id=$1::uuid", [source.id, reviewReference(source, probe)]);
        changes.push({ id: source.id, enabled: true, changed: old.enabled !== true });
      }
    }
    await client.query("COMMIT");
    return { action, manifestHash: sourceManifestHash(manifest), changes, probes, grantsChanged: false, schedulerChanged: false, billingChanged: false };
  } catch (error) {
    try { await client?.query("ROLLBACK"); } catch { destroy = true; }
    if (error instanceof SourceCatalogError) throw error;
    return stop("catalog_database_unavailable");
  } finally { client?.release(destroy); }
}

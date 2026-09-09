import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Pool } from "pg";
import { TRADING_CAPACITY } from "../../shared/trading-capacity.js";
import { isTradingMarketFit, type TradingMarketFit } from "../../shared/trading-market-fit.js";
import { isTradingArchiveEvidence, type TradingArchiveEvidence } from "../../shared/trading-archive.js";
import type { TradingDossierObservation } from "../../shared/trading-dossier.js";
import { canonicalTradingRegistrarDomain, isTradingRegistrarEvidence, type TradingRegistrarEvidence } from "../../shared/trading-registrar.js";
import { isLostDomainOpportunity, type LostDomainOpportunity } from "../../shared/lost-domain-opportunity.js";
import { observationHistories, rotateSources, selectDiscoveryCandidates, type DomainObservationHistory,
  type HistoricalObservation, type PreviousDomainCheck } from "./lost-domains-intelligence.js";

export const LOST_DOMAIN_LIMITS = Object.freeze({ dailyGlobalRuns: 10, dailyOwnerRuns: 2,
  sourceLimit: TRADING_CAPACITY.sourceLimit, candidateLimit: TRADING_CAPACITY.candidateLimit,
  candidatesPerSource: TRADING_CAPACITY.candidatesPerSource, reportLimit: TRADING_CAPACITY.reportLimit,
  attemptsPerItem: 3, attemptsPerRun: TRADING_CAPACITY.attemptsPerRun, dailyGlobalAttempts: 6000, dailyOwnerAttempts: 1800,
  leaseSeconds: 45, manualCooldownSeconds: 300, runLifetimeSeconds: TRADING_CAPACITY.runLifetimeSeconds });

export type LostRunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
export interface LostAccess { allowed: boolean; expiresAt: string | null; dailyRefresh: boolean }
export interface LostSource { id: string; name: string; url: string; host: string; robotsUrl: string;
  policyReviewedAt: string; policyExpiresAt: string }
export interface LostCandidate { domain: string; sourceUrl: string; targetUrl: string; anchor: string; sensitive: boolean }
export interface LostAssessment extends LostCandidate {
  registrar?: TradingRegistrarEvidence;
  marketFit?: TradingMarketFit;
  archive?: TradingArchiveEvidence;
  observationHistory?: DomainObservationHistory;
  opportunity?: LostDomainOpportunity;
  opportunityScore?: number;
  registryStatus: "registered" | "registry_not_found" | "unknown";
  registrability: "unverified"; confirmedRegistrable: false;
  evidence: Array<{ kind: string; observedAt: string; expiresAt: string; source: string; method: string; outcome: string;
    details?: Record<string, string | number | boolean | string[]> }>;
  risk: { level: "review" | "excluded"; reasons: string[] };
  potentialScore: number; confidenceScore: number;
  reviewStatus: "review_candidate" | "registered" | "inconclusive" | "excluded";
}
export interface LostRun { id: string; status: LostRunStatus; createdAt: string; updatedAt:string; finishedAt: string | null;
  capacity?: { sourceLimit: number; candidateLimit: number };
  verificationCount?: number; completedVerificationCount?: number;
  verificationRound?: number; verificationMaxRounds?: number; nextCheckAt?: string | null;
  totalWork: number; completedWork: number; failedWork: number; assessmentCount: number;
  sourceCount: number; candidateCount: number; completedCount: number; failedCount: number;
  qualifiedCount: 0; failureCode: string | null }
export interface LostWorkLease { ownerId: string; runId: string; workId: string; token: string; fence: number;
  verification?: boolean;
  verificationRound?: number;
  kind: "source" | "candidate"; source: LostSource; candidate: LostCandidate | null; expiresAt: string }
export type LostWorkResult = { kind: "source"; candidates: LostCandidate[]; evidence: Record<string, unknown> }
  | { kind: "candidate"; assessment: LostAssessment; qualified?: boolean; score?: number };
export interface LostDashboard { access: LostAccess; sources: LostSource[]; runs: LostRun[]; activeRun: LostRun | null;
  quoteUpdates?: Record<string,LostQuoteUpdate>;
  supersededDomains?: string[];
  researchObservations?: Record<string, TradingDossierObservation[]>;
  sourceApprovals?: Record<string, boolean>;
  latestReport: { run: LostRun; assessments: LostAssessment[] } | null }
export interface LostQuoteUpdate { status:"pending"|"succeeded"|"failed"; requestedAt:string; failureCode?:string|null; evidence?:TradingRegistrarEvidence|null }
export interface LostQuoteLease { id:string; ownerId:string; runId:string; assessmentId:string; domain:string; token:string; requestedAt:string; leaseUntil:string }
export interface LostStoreClient { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void }
export interface LostStorePool { connect(): Promise<LostStoreClient> }
export class LostDomainsStoreError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "LostDomainsStoreError"; }
}

const fail = (code: string, status = 503): never => { throw new LostDomainsStoreError(code, status); };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function owner(value: string): string { return typeof value === "string" && value.length >= 1 && value.length <= 200 ? value : fail("invalid_owner", 400); }
function uuid(value: string): string { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : fail("invalid_id", 400); }
function integer(value: unknown): number {
  const n = typeof value === "number" || typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : fail("lost_domains_unavailable");
}
function runLimit(value: unknown, legacy: number, maximum: number): number {
  // Older test/adaptor snapshots can omit limits; PostgreSQL rows cannot.
  const limit = value === undefined ? legacy : integer(value);
  return limit >= 1 && limit <= maximum ? limit : fail("lost_domains_unavailable");
}
function iso(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : new Date(NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fail("lost_domains_unavailable");
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail("invalid_evidence", 400);
}
function boundedJson(value: unknown, bytes = 32768): string {
  const encoded = JSON.stringify(value);
  return encoded && Buffer.byteLength(encoded, "utf8") <= bytes ? encoded : fail("invalid_evidence", 400);
}
function safeUrl(value: unknown): URL {
  try {
    if (typeof value !== "string" || value.length > 2048) throw new Error();
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port
      || isIP(url.hostname) || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/iu.test(url.hostname)) throw new Error();
    return url;
  } catch { return fail("invalid_source", 400); }
}
export function validateLostCandidate(value: unknown, source: LostSource): LostCandidate {
  const row = object(value);
  const domain = typeof row.domain === "string" ? row.domain.toLowerCase() : "";
  if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/u.test(domain)) fail("invalid_candidate", 400);
  const observedSource = safeUrl(row.sourceUrl);
  if (observedSource.hostname !== source.host || typeof row.anchor !== "string" || row.anchor.length > 500 || typeof row.sensitive !== "boolean") fail("invalid_candidate", 400);
  // Links may originally use http; normalise only for validation, not evidence.
  const target = safeUrl(typeof row.targetUrl === "string" ? row.targetUrl.replace(/^http:\/\//u, "https://") : row.targetUrl);
  if (target.hostname !== domain && !target.hostname.endsWith(`.${domain}`)) fail("invalid_candidate", 400);
  return { domain, sourceUrl: String(row.sourceUrl), targetUrl: String(row.targetUrl), anchor: String(row.anchor), sensitive: row.sensitive===true };
}
export function validateLostAssessment(value: unknown, candidate: LostCandidate): LostAssessment {
  const row = object(value);
  for (const key of ["domain", "sourceUrl", "targetUrl", "anchor", "sensitive"] as const) {
    if (row[key] !== candidate[key]) fail("invalid_assessment", 400);
  }
  if (!["registered", "registry_not_found", "unknown"].includes(String(row.registryStatus))
    || row.registrability !== "unverified" || row.confirmedRegistrable !== false
    || !["review_candidate", "registered", "inconclusive", "excluded"].includes(String(row.reviewStatus))) fail("invalid_assessment", 400);
  for (const key of ["potentialScore", "confidenceScore"]) if (typeof row[key] !== "number" || !Number.isInteger(row[key]) || Number(row[key]) < 0 || Number(row[key]) > 100) fail("invalid_assessment", 400);
  if (row.opportunity !== undefined && (!isLostDomainOpportunity(row.opportunity) || row.opportunityScore !== row.opportunity.score)
    || row.opportunity === undefined && row.opportunityScore !== undefined) fail("invalid_assessment", 400);
  if (row.marketFit !== undefined && (!isTradingMarketFit(row.marketFit) || row.marketFit.domain !== candidate.domain)) fail("invalid_assessment",400);
  if (row.archive !== undefined && (!isTradingArchiveEvidence(row.archive) || row.archive.domain !== candidate.domain)) fail("invalid_assessment",400);
  if (row.registrar !== undefined && (!isTradingRegistrarEvidence(row.registrar) || row.registrar.domain !== candidate.domain)) fail("invalid_assessment",400);
  const risk = object(row.risk);
  if (!["review", "excluded"].includes(String(risk.level)) || !Array.isArray(risk.reasons)
    || risk.reasons.length > 30 || risk.reasons.some(v => typeof v !== "string" || v.length > 500)) fail("invalid_assessment", 400);
  if(candidate.sensitive && (row.reviewStatus!=='excluded' || risk.level!=='excluded')) fail('invalid_assessment',400);
  if (!Array.isArray(row.evidence) || (!row.evidence.length && row.reviewStatus !== 'excluded') || row.evidence.length > 30) fail("invalid_assessment", 400);
  for (const raw of row.evidence as unknown[]) {
    const evidence = object(raw);
    if(!['target_http','dns','mail','registry'].includes(String(evidence.kind))) fail('invalid_assessment',400);
    for (const key of ["kind", "source", "method", "outcome"]) if (typeof evidence[key] !== "string" || !evidence[key] || String(evidence[key]).length > 2048) fail("invalid_assessment", 400);
    if (Date.parse(iso(evidence.expiresAt)) <= Date.parse(iso(evidence.observedAt))) fail("invalid_assessment", 400);
  }
  boundedJson(row);
  // Preserve structured engine evidence; a caller's qualified/score flag is
  // deliberately not stored. No registrar means confirmedRegistrable=false.
  return JSON.parse(JSON.stringify({ ...row, ...candidate, confirmedRegistrable: false })) as LostAssessment;
}

let runtimePool: Pool | undefined;
let runtimeUrl: string | undefined;
function poolFor(url: string): LostStorePool {
  if (runtimePool && runtimeUrl === url) return runtimePool;
  if (runtimePool) void runtimePool.end().catch(() => undefined);
  const target = new URL(url);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) fail("lost_domains_unavailable");
  target.searchParams.set("sslmode", "verify-full"); target.searchParams.delete("options");
  runtimePool = new Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  runtimePool.on("error", () => console.error(JSON.stringify({ event: "lost_domains_database_failed" })));
  runtimeUrl = url;
  return runtimePool;
}

export function createLostDomainsStore(deps: { pool?: LostStorePool; environment?: () => NodeJS.ProcessEnv } = {}) {
  function configuration() {
    const env = deps.environment?.() ?? process.env;
    const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
    if (!namespace || !["development", "preview", "production"].includes(namespace) || (!deps.pool && !env.DATABASE_URL)) fail("lost_domains_unavailable");
    return { namespace:namespace as string, pool: deps.pool ?? poolFor(env.DATABASE_URL!) };
  }
  async function query<T>(fn: (client: LostStoreClient, namespace: string) => Promise<T>, mutate = false): Promise<T> {
    const { namespace, pool } = configuration();
    let client: LostStoreClient | undefined, destroy = false;
    try {
      client = await pool.connect();
      await client.query(mutate ? "BEGIN" : "BEGIN READ ONLY");
      await client.query("SET LOCAL lock_timeout = '1500ms'; SET LOCAL statement_timeout = '4000ms'; SET LOCAL idle_in_transaction_session_timeout = '8000ms'");
      if (mutate) await client.query("/* lost:lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`sajda.lost.v1:${namespace}`]);
      const result = await fn(client, namespace);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { destroy = true; }
      if (error instanceof LostDomainsStoreError) throw error;
      return fail("lost_domains_unavailable");
    } finally { client?.release(destroy); }
  }
  async function access(client: LostStoreClient, ownerId: string, namespace: string): Promise<LostAccess> {
    const result = await client.query(`/* lost:access */ SELECT max(a.expires_at) AS expires_at,
      bool_or(a.daily_refresh AND a.revoked_at IS NULL AND a.valid_from<=statement_timestamp() AND a.expires_at>statement_timestamp()) AS daily_refresh,
      bool_or(a.revoked_at IS NULL AND a.valid_from <= statement_timestamp() AND a.expires_at > statement_timestamp()
       AND u."emailVerified" = true) AS allowed
      FROM sajda.lost_domain_effective_access a JOIN public.sajda_auth_user u ON u.id = a.owner_id
      WHERE a.owner_id = $1 AND a.namespace=$2 GROUP BY a.owner_id`, [owner(ownerId),namespace]);
    const row = result.rows[0];
    return { allowed: row?.allowed === true, expiresAt: row ? iso(row.expires_at) : null, dailyRefresh: row?.allowed === true && row.daily_refresh === true };
  }
  async function sources(client: LostStoreClient): Promise<LostSource[]> {
    const result = await client.query(`/* lost:sources */ SELECT id::text, name, url, host, robots_url, policy_reviewed_at, policy_expires_at
      FROM sajda.lost_domain_sources WHERE enabled AND robots_policy = 'allowed'
        AND policy_reviewed_at <= statement_timestamp() AND policy_expires_at > statement_timestamp()
        AND policy_reviewed_at >= statement_timestamp() - interval '30 days' ORDER BY id LIMIT 100`);
    return result.rows.flatMap(row => {
      try {
        const url = safeUrl(row.url), robots = safeUrl(row.robots_url);
        if (url.hostname !== row.host || url.search || robots.origin !== url.origin || robots.pathname !== "/robots.txt" || robots.search) return [];
        return [{ id: uuid(String(row.id)), name: String(row.name), url: String(row.url), host: String(row.host),
          robotsUrl: String(row.robots_url), policyReviewedAt: iso(row.policy_reviewed_at), policyExpiresAt: iso(row.policy_expires_at) }];
      } catch { return []; }
    });
  }
  async function quoteCandidate(client:LostStoreClient,namespace:string,ownerId:string,runId:string,domain:string,assessmentId?:string) {
    const result=await client.query(`/* lost:quote-candidate */ SELECT a.id::text AS assessment_id,a.assessment,a.observed_at,
      w.candidate,w.source_id::text,w.source_snapshot FROM sajda.lost_domain_assessments a
      JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
      JOIN sajda.lost_domain_work_items w ON w.id=a.work_id AND w.owner_id=a.owner_id AND w.run_id=a.run_id
      WHERE r.namespace=$1 AND a.owner_id=$2 AND a.run_id=$3::uuid AND a.domain=$4
        AND r.status IN ('succeeded','partial') AND ($5::uuid IS NULL OR a.id=$5::uuid)
      ORDER BY w.verification_round DESC,a.observed_at DESC,a.id DESC LIMIT 1`,[namespace,ownerId,runId,domain,assessmentId??null]);
    const row=result.rows[0]; if(!row) fail("quote_candidate_unavailable",404);
    const source=(await sources(client)).find(item=>item.id===row.source_id),saved=object(row.source_snapshot);
    if(!source || saved.id!==source.id || saved.url!==source.url || saved.host!==source.host || saved.robotsUrl!==source.robotsUrl) return fail("quote_candidate_unavailable",409);
    const candidate=validateLostCandidate(row.candidate,source),assessment=validateLostAssessment(row.assessment,candidate);
    if(candidate.domain!==domain || candidate.sensitive || assessment.sensitive || assessment.risk.level!=="review"
      || assessment.reviewStatus!=="review_candidate" || assessment.registryStatus!=="registry_not_found") fail("quote_candidate_unavailable",409);
    const newer=await client.query(`/* lost:quote-contradictions */ SELECT 1 FROM sajda.lost_domain_assessments a
      JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
      WHERE r.namespace=$1 AND a.owner_id=$2 AND a.domain=$3 AND a.id<>$4::uuid
        AND (a.observed_at>$5::timestamptz OR (a.observed_at=$5::timestamptz AND a.id>$4::uuid))
        AND (a.assessment->>'registryStatus' IS DISTINCT FROM 'registry_not_found'
          OR a.assessment->>'reviewStatus' IS DISTINCT FROM 'review_candidate'
          OR a.assessment->'risk'->>'level' IS DISTINCT FROM 'review'
          OR a.assessment->>'sensitive' IS DISTINCT FROM 'false') LIMIT 1`,[namespace,ownerId,domain,row.assessment_id,iso(row.observed_at)]);
    if(newer.rows.length) fail("quote_candidate_unavailable",409);
    return {assessmentId:uuid(String(row.assessment_id)),candidate};
  }
  function run(row: Record<string, unknown>): LostRun {
    return { id: String(row.id), status: row.status as LostRunStatus, createdAt: iso(row.created_at),updatedAt:iso(row.updated_at), finishedAt: row.finished_at ? iso(row.finished_at) : null,
      capacity: {sourceLimit:runLimit(row.source_limit,3,24),candidateLimit:runLimit(row.candidate_limit,60,600)},
      verificationCount:integer(row.verification_count??0),completedVerificationCount:integer(row.completed_verification_count??0),
      verificationRound:integer(row.verification_round??0),verificationMaxRounds:runLimit(row.verification_max_rounds,1,3),
      nextCheckAt:row.next_check_at ? iso(row.next_check_at) : null,
      totalWork: integer(row.total_work), completedWork: integer(row.completed_work), failedWork: integer(row.failed_work),
      assessmentCount: integer(row.assessment_count), sourceCount:integer(row.source_count),candidateCount:integer(row.candidate_count),
      completedCount:integer(row.completed_count),failedCount:integer(row.failed_count),
      qualifiedCount: 0, failureCode: typeof row.failure_code === "string" ? row.failure_code : null };
  }
  async function runs(client: LostStoreClient, namespace: string, ownerId: string, id?:string, reportOnly=false): Promise<LostRun[]> {
    const result = await client.query(`/* lost:runs */ SELECT r.id::text, r.status, r.created_at, r.finished_at, r.failure_code,r.source_limit,r.candidate_limit,
      r.verification_round,r.verification_max_rounds,
      (SELECT min(w.next_attempt_at) FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.owner_id=r.owner_id
        AND w.status IN ('queued','retry_wait')) AS next_check_at,
      GREATEST(r.created_at,r.started_at,r.finished_at,(SELECT max(w.completed_at) FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id)) AS updated_at,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id = r.id AND w.owner_id = r.owner_id) AS total_work,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id = r.id AND w.owner_id = r.owner_id AND w.status = 'succeeded') AS completed_work,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id = r.id AND w.owner_id = r.owner_id AND w.status IN ('failed','cancelled')) AS failed_work,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.kind='source') AS source_count,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.kind='candidate' AND NOT w.verification) AS candidate_count,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.kind='candidate' AND NOT w.verification AND w.status IN ('succeeded','failed','cancelled')) AS completed_count,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.kind='candidate' AND NOT w.verification AND w.status IN ('failed','cancelled')) AS failed_count,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.verification) AS verification_count,
      (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.verification AND w.status IN ('succeeded','failed','cancelled')) AS completed_verification_count,
      (SELECT count(*)::int FROM sajda.lost_domain_assessments a WHERE a.run_id = r.id AND a.owner_id = r.owner_id) AS assessment_count
      FROM sajda.lost_domain_runs r WHERE r.namespace = $1 AND r.owner_id = $2 AND ($3::uuid IS NULL OR r.id=$3::uuid)
        AND (NOT $4::boolean OR (r.status IN ('succeeded','partial') AND EXISTS(SELECT 1 FROM sajda.lost_domain_assessments a WHERE a.run_id=r.id AND a.owner_id=r.owner_id)))
      ORDER BY r.created_at DESC, r.id DESC LIMIT 20`, [namespace, owner(ownerId),id??null,reportOnly]);
    return result.rows.map(run);
  }
  async function settle(client: LostStoreClient, namespace: string) {
    // Each round is a durable queue, not a sleep inside a serverless function.
    // Only a successful, still-eligible preceding round may progress; a failed
    // or contradictory latest check must never resurrect an older negative.
    // Historical runs retain one immediate pass; new runs persist their gaps.
    await client.query(`/* lost:verification-pass */ WITH ready AS (
      UPDATE sajda.lost_domain_runs r SET verification_queued=true,verification_round=verification_round+1
      WHERE r.namespace=$1 AND r.status IN ('queued','running') AND r.verification_round<r.verification_max_rounds
        AND r.created_at+make_interval(secs=>r.run_lifetime_seconds)>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.status IN ('queued','leased','retry_wait'))
        AND (SELECT count(*) FROM sajda.lost_domain_attempts attempt WHERE attempt.namespace=r.namespace
          AND attempt.run_id=r.id AND attempt.owner_id=r.owner_id)<r.attempt_limit
        AND EXISTS(SELECT 1 FROM sajda.lost_domain_effective_access e JOIN public.sajda_auth_user u ON u.id=e.owner_id
          WHERE e.owner_id=r.owner_id AND e.namespace=r.namespace AND e.revoked_at IS NULL AND e.valid_from<=clock_timestamp()
            AND e.expires_at>clock_timestamp() AND u."emailVerified"=true)
      RETURNING r.id,r.owner_id,r.verification_round,r.verification_gap_seconds[r.verification_round] AS gap_seconds,
        r.created_at+make_interval(secs=>r.run_lifetime_seconds) AS deadline
    ) INSERT INTO sajda.lost_domain_work_items(id,owner_id,run_id,kind,source_id,source_snapshot,identity_key,candidate,verification,verification_round,next_attempt_at)
      SELECT gen_random_uuid(),r.owner_id,r.id,'candidate',choice.source_id,choice.source_snapshot,
        'verify:'||r.verification_round::text||':'||choice.work_id::text,choice.candidate,true,r.verification_round,
        GREATEST(clock_timestamp(),choice.observed_at+make_interval(secs=>r.gap_seconds))
      FROM ready r CROSS JOIN LATERAL (
        SELECT w.id AS work_id,w.source_id,w.source_snapshot,w.candidate,a.domain,a.observed_at
        FROM sajda.lost_domain_work_items w
        JOIN LATERAL (
          SELECT latest.id,latest.status,latest.verification_round FROM sajda.lost_domain_work_items latest
          WHERE latest.run_id=w.run_id AND latest.owner_id=w.owner_id AND latest.kind='candidate'
            AND latest.candidate->>'domain'=w.candidate->>'domain'
          ORDER BY latest.verification_round DESC,latest.created_at DESC,latest.id DESC LIMIT 1
        ) previous ON previous.status='succeeded' AND previous.verification_round=r.verification_round-1
        JOIN sajda.lost_domain_assessments a ON a.work_id=previous.id AND a.owner_id=w.owner_id AND a.run_id=w.run_id
        JOIN sajda.lost_domain_sources s ON s.id=w.source_id
        WHERE w.run_id=r.id AND w.owner_id=r.owner_id AND NOT w.verification
          AND a.assessment->>'registryStatus'='registry_not_found' AND a.assessment->>'reviewStatus'='review_candidate'
          AND a.assessment->'risk'->>'level'='review' AND a.assessment->>'sensitive'='false'
          AND a.assessment->'opportunity'->>'tier' IN ('priority_review','review')
          AND a.observed_at+make_interval(secs=>r.gap_seconds)<r.deadline
          AND s.enabled AND s.robots_policy='allowed' AND s.policy_expires_at>clock_timestamp()
          AND s.policy_reviewed_at<=clock_timestamp() AND s.policy_reviewed_at>=clock_timestamp()-interval '30 days'
          AND s.url=w.source_snapshot->>'url' AND s.host=w.source_snapshot->>'host' AND s.robots_url=w.source_snapshot->>'robotsUrl'
        ORDER BY CASE WHEN a.assessment->'opportunity'->>'tier'='priority_review' THEN 0 ELSE 1 END,
          COALESCE((a.assessment->'marketFit'->>'score')::int,0) DESC,a.potential_score DESC,a.domain
        LIMIT 30
      ) choice ON CONFLICT(run_id,kind,identity_key) DO NOTHING`,[namespace]);
    await client.query(`/* lost:settle */ UPDATE sajda.lost_domain_runs r SET
      status = CASE WHEN EXISTS(SELECT 1 FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.status IN ('failed','cancelled'))
        OR EXISTS(SELECT 1 FROM sajda.lost_domain_assessments a WHERE a.run_id=r.id
          AND a.assessment->>'registryStatus'='unknown' AND a.assessment->>'reviewStatus'<>'excluded')
        THEN CASE WHEN EXISTS(SELECT 1 FROM sajda.lost_domain_assessments a WHERE a.run_id=r.id
          AND (a.assessment->>'registryStatus'<>'unknown' OR a.assessment->>'reviewStatus'='excluded')) THEN 'partial' ELSE 'failed' END
        ELSE 'succeeded' END, finished_at = clock_timestamp(),
      failure_code=COALESCE(r.failure_code,(SELECT w.failure_code FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.status IN ('failed','cancelled') ORDER BY w.id LIMIT 1),
        CASE WHEN EXISTS(SELECT 1 FROM sajda.lost_domain_assessments a WHERE a.run_id=r.id
          AND a.assessment->>'registryStatus'='unknown' AND a.assessment->>'reviewStatus'<>'excluded') THEN 'registry_inconclusive' END)
      WHERE r.namespace=$1 AND r.status IN ('queued','running')
        AND NOT EXISTS(SELECT 1 FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.status IN ('queued','leased','retry_wait'))`, [namespace]);
  }
  async function recover(client: LostStoreClient, namespace: string) {
    await client.query(`/* lost:recover */ UPDATE sajda.lost_domain_work_items w SET
      status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END, lease_token=NULL, lease_until=NULL,
      next_attempt_at=clock_timestamp(), failure_code='lease_expired'
      FROM sajda.lost_domain_runs r WHERE w.run_id=r.id AND r.namespace=$1 AND w.status='leased' AND w.lease_until<=clock_timestamp()`, [namespace]);
    await client.query(`/* lost:expired-access */ UPDATE sajda.lost_domain_work_items w SET status='cancelled',lease_token=NULL,lease_until=NULL,failure_code='access_expired'
      FROM sajda.lost_domain_runs r WHERE w.run_id=r.id AND r.namespace=$1 AND r.status IN ('queued','running')
      AND w.status IN ('queued','leased','retry_wait') AND NOT EXISTS(SELECT 1 FROM sajda.lost_domain_effective_access a
        JOIN public.sajda_auth_user u ON u.id=a.owner_id WHERE a.owner_id=r.owner_id AND a.revoked_at IS NULL
        AND a.namespace=r.namespace AND a.valid_from<=clock_timestamp() AND a.expires_at>clock_timestamp() AND u."emailVerified"=true)`, [namespace]);
    await client.query(`/* lost:run-deadline */ UPDATE sajda.lost_domain_work_items w SET status='failed',lease_token=NULL,lease_until=NULL,failure_code='run_deadline'
      FROM sajda.lost_domain_runs r WHERE w.run_id=r.id AND r.namespace=$1 AND r.status IN ('queued','running')
        AND r.created_at<clock_timestamp()-make_interval(secs=>r.run_lifetime_seconds) AND w.status IN ('queued','leased','retry_wait')`, [namespace]);
    await settle(client, namespace);
  }

  const store = {
    readAccess: (ownerId: string) => query((client,namespace) => access(client, ownerId,namespace)),
    listSources: () => query(client => sources(client)),
    async beginQuoteRefresh(ownerId:string,runId:string,domainInput:string,requestKey:string):Promise<{reused:boolean;lease:LostQuoteLease|null}> {
      owner(ownerId);runId=uuid(runId);requestKey=uuid(requestKey);
      const domain=typeof domainInput==="string"?canonicalTradingRegistrarDomain(domainInput):null;
      if(!domain || domain!==domainInput) return fail("invalid_candidate",400);
      return query(async(client,namespace)=>{
        if(!(await access(client,ownerId,namespace)).allowed) fail("plus_required",403);
        await client.query(`/* lost:quote-recover */ UPDATE sajda.lost_domain_quote_requests SET status='failed',lease_token=NULL,lease_until=NULL,
          finished_at=clock_timestamp(),failure_code='quote_request_expired'
          WHERE namespace=$1 AND owner_id=$2 AND status='pending' AND lease_until<=clock_timestamp()`,[namespace,ownerId]);
        const previous=await client.query(`/* lost:quote-idempotency */ SELECT run_id::text,domain FROM sajda.lost_domain_quote_requests
          WHERE namespace=$1 AND owner_id=$2 AND request_key=$3::uuid`,[namespace,ownerId,requestKey]);
        if(previous.rows[0]) {
          if(previous.rows[0].run_id!==runId || previous.rows[0].domain!==domain) fail("quote_request_conflict",409);
          return {reused:true,lease:null};
        }
        const target=await quoteCandidate(client,namespace,ownerId,runId,domain);
        const usage=await client.query(`/* lost:quote-budget */ SELECT count(*) FILTER(WHERE requested_at>clock_timestamp()-interval '24 hours')::int AS daily_count,
          bool_or(status='pending') AS pending,bool_or(domain=$3 AND requested_at>clock_timestamp()-interval '60 seconds') AS cooling
          FROM sajda.lost_domain_quote_requests WHERE namespace=$1 AND owner_id=$2
            AND (requested_at>clock_timestamp()-interval '24 hours' OR status='pending')`,[namespace,ownerId,domain]);
        if(integer(usage.rows[0]?.daily_count)>=60) fail("quote_daily_limit",429);
        if(usage.rows[0]?.pending===true) fail("quote_in_progress",409);
        if(usage.rows[0]?.cooling===true) fail("quote_cooldown",429);
        const id=randomUUID(),token=randomUUID();
        const inserted=await client.query(`/* lost:quote-start */ INSERT INTO sajda.lost_domain_quote_requests
          (id,namespace,owner_id,run_id,assessment_id,domain,request_key,lease_token,lease_until)
          VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::uuid,$8::uuid,clock_timestamp()+interval '20 seconds')
          RETURNING requested_at,lease_until`,[id,namespace,ownerId,runId,target.assessmentId,domain,requestKey,token]);
        if(!inserted.rows[0]) fail("lost_domains_unavailable");
        return {reused:false,lease:{id,ownerId,runId,assessmentId:target.assessmentId,domain,token,
          requestedAt:iso(inserted.rows[0].requested_at),leaseUntil:iso(inserted.rows[0].lease_until)}};
      },true);
    },
    async finishQuoteRefresh(lease:LostQuoteLease,evidence:TradingRegistrarEvidence|null,failureCode?:string):Promise<{applied:boolean}> {
      uuid(lease.id);uuid(lease.token);owner(lease.ownerId);uuid(lease.runId);uuid(lease.assessmentId);
      if(evidence && (!isTradingRegistrarEvidence(evidence) || evidence.domain!==lease.domain)) fail("invalid_evidence",400);
      if(failureCode!==undefined && !/^[a-z_]{1,60}$/u.test(failureCode)) fail("invalid_evidence",400);
      return query(async(client,namespace)=>{
        const pending=await client.query(`/* lost:quote-owned */ SELECT id::text,run_id::text,assessment_id::text,domain,lease_token::text,status,requested_at,
          lease_until>clock_timestamp() AS live,clock_timestamp() AS server_now FROM sajda.lost_domain_quote_requests
          WHERE namespace=$1 AND owner_id=$2 AND id=$3::uuid FOR UPDATE`,[namespace,lease.ownerId,lease.id]);
        const row=pending.rows[0];
        if(!row || row.status!=="pending") return {applied:false};
        if(row.run_id!==lease.runId || row.assessment_id!==lease.assessmentId || row.domain!==lease.domain || row.lease_token!==lease.token) fail("quote_request_conflict",409);
        let denial:string|null=row.live===true?null:"quote_request_expired";
        if(!(await access(client,lease.ownerId,namespace)).allowed) denial="plus_required";
        if(!denial) {
          try { await quoteCandidate(client,namespace,lease.ownerId,lease.runId,lease.domain,lease.assessmentId); }
          catch(error) { if(error instanceof LostDomainsStoreError && error.code==="quote_candidate_unavailable") denial=error.code;else throw error; }
        }
        if(evidence && (Date.parse(evidence.checkedAt)<Date.parse(iso(row.requested_at))-5000
          || Date.parse(evidence.checkedAt)>Date.parse(iso(row.server_now))+5000)) fail("invalid_evidence",400);
        const successful=!denial && evidence?.status==="checked";
        const code=denial??(successful?null:failureCode??evidence?.reason??"provider_unavailable");
        const completion=await client.query(`/* lost:quote-finish */ UPDATE sajda.lost_domain_quote_requests SET
          status=CASE WHEN lease_until<=clock_timestamp() THEN 'failed' ELSE $4 END,finished_at=clock_timestamp(),
          failure_code=CASE WHEN lease_until<=clock_timestamp() THEN 'quote_request_expired' ELSE $5 END,
          lease_token=NULL,lease_until=NULL WHERE namespace=$1 AND owner_id=$2 AND id=$3::uuid AND status='pending'
          RETURNING status,failure_code`,
        [namespace,lease.ownerId,lease.id,successful?"succeeded":"failed",code]);
        if(!completion.rows[0]) fail("lost_domains_unavailable");
        if(!denial && evidence && completion.rows[0].failure_code!=="quote_request_expired") await client.query(`/* lost:quote-observation */ INSERT INTO sajda.lost_domain_quote_observations
          (request_id,namespace,owner_id,domain,evidence) VALUES($1::uuid,$2,$3,$4,$5::jsonb) ON CONFLICT(request_id) DO NOTHING`,
        [lease.id,namespace,lease.ownerId,lease.domain,boundedJson(evidence,8192)]);
        return {applied:true};
      },true);
    },
    async startRun(ownerId: string, requestKey: string): Promise<{ run: LostRun; reused: boolean }> {
      owner(ownerId);
      if (typeof requestKey !== "string" || !/^[a-z0-9_.:-]{8,100}$/iu.test(requestKey)) fail("invalid_request_key", 400);
      return query(async (client, namespace) => {
        if (!(await access(client, ownerId,namespace)).allowed) fail("plus_required", 403);
        await recover(client, namespace);
        const previous = await client.query("/* lost:idempotency */ SELECT id::text FROM sajda.lost_domain_runs WHERE namespace=$1 AND owner_id=$2 AND request_key=$3", [namespace, ownerId, requestKey]);
        if (previous.rows[0]) {
          const existing = (await runs(client, namespace, ownerId,String(previous.rows[0].id)))[0];
          if (!existing) fail("request_expired", 409);
          return { run: existing, reused: true };
        }
        const recent = await runs(client, namespace, ownerId);
        const active = recent.find(value => ["queued", "running"].includes(value.status));
        if (active) fail('run_in_progress',409);
        const catalog = await sources(client);
        const sourceHistory = await client.query(`/* lost:source-history */ SELECT w.source_id::text, max(r.created_at) AS attempted_at
          FROM sajda.lost_domain_work_items w JOIN sajda.lost_domain_runs r ON r.id=w.run_id AND r.owner_id=w.owner_id
          WHERE r.namespace=$1 AND r.owner_id=$2 AND w.kind='source' GROUP BY w.source_id`, [namespace,ownerId]);
        const approved = rotateSources(catalog, sourceHistory.rows.map(row => ({ sourceId: String(row.source_id), attemptedAt: iso(row.attempted_at) })), LOST_DOMAIN_LIMITS.sourceLimit);
        if (!approved.length) fail("sources_unavailable", 503);
        const usage = await client.query(`/* lost:run-budget */ SELECT count(*)::int AS global_count,
          count(*) FILTER(WHERE owner_id=$2)::int AS owner_count,
          bool_or(owner_id=$2 AND created_at>clock_timestamp()-interval '5 minutes') AS cooling
          FROM sajda.lost_domain_runs WHERE namespace=$1 AND created_at>clock_timestamp()-interval '24 hours'`, [namespace, ownerId]);
        if (integer(usage.rows[0]?.global_count)>=LOST_DOMAIN_LIMITS.dailyGlobalRuns || integer(usage.rows[0]?.owner_count)>=LOST_DOMAIN_LIMITS.dailyOwnerRuns) fail("daily_limit",429);
        if (usage.rows[0]?.cooling===true) fail("refresh_cooldown",429);
        const campaign = await client.query(`/* lost:campaign */ INSERT INTO sajda.lost_domain_campaigns(id,namespace,owner_id)
          VALUES($1::uuid,$2,$3) ON CONFLICT(namespace,owner_id) DO UPDATE SET owner_id=EXCLUDED.owner_id RETURNING id::text`, [randomUUID(), namespace, ownerId]);
        const id = randomUUID();
        await client.query(`/* lost:new-run */ INSERT INTO sajda.lost_domain_runs(id,namespace,owner_id,campaign_id,request_key,
          engine_version,source_limit,candidate_limit,attempt_limit,candidates_per_source,run_lifetime_seconds,verification_queued,
          verification_round,verification_max_rounds,verification_gap_seconds)
          VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,false,0,$12,$13::int[])`,
        [id,namespace,ownerId,campaign.rows[0].id,requestKey,TRADING_CAPACITY.profile,LOST_DOMAIN_LIMITS.sourceLimit,
          LOST_DOMAIN_LIMITS.candidateLimit,LOST_DOMAIN_LIMITS.attemptsPerRun,LOST_DOMAIN_LIMITS.candidatesPerSource,LOST_DOMAIN_LIMITS.runLifetimeSeconds,
          TRADING_CAPACITY.verificationMaxRounds,[...TRADING_CAPACITY.verificationGapSeconds]]);
        for (const source of approved) await client.query(`/* lost:source-work */ INSERT INTO sajda.lost_domain_work_items
          (id,owner_id,run_id,kind,source_id,source_snapshot,identity_key)
          VALUES($1::uuid,$2,$3::uuid,'source',$4::uuid,$5::jsonb,$4::text)`, [randomUUID(),ownerId,id,source.id,boundedJson(source,8192)]);
        return { run: (await runs(client, namespace, ownerId)).find(value => value.id===id)!, reused: false };
      }, true);
    },
    async getDashboard(ownerId: string): Promise<LostDashboard> {
      return query(async (client,namespace) => {
        const permission = await access(client,ownerId,namespace), approved = await sources(client);
        if (!permission.allowed) return { access:permission,sources:approved,runs:[],activeRun:null,latestReport:null };
        const history = await runs(client,namespace,ownerId);
        const latest = (await runs(client,namespace,ownerId,undefined,true))[0];
        const rows = latest ? await client.query(`/* lost:report */ SELECT DISTINCT ON (a.domain) a.assessment,w.source_id,w.source_snapshot FROM sajda.lost_domain_assessments a
          JOIN sajda.lost_domain_work_items w ON w.id=a.work_id AND w.owner_id=a.owner_id AND w.run_id=a.run_id
          WHERE a.owner_id=$1 AND a.run_id=$2::uuid ORDER BY a.domain,w.verification_round DESC,a.observed_at DESC,a.id DESC LIMIT 600`,[ownerId,latest.id]) : {rows:[]};
        const assessments = rows.rows.map(row => row.assessment as LostAssessment);
        const quoteUpdates:Record<string,LostQuoteUpdate>=Object.create(null);
        if(latest && assessments.length) {
          const quotes=await client.query(`/* lost:quote-updates */ SELECT DISTINCT ON(q.domain) q.domain,q.requested_at,
            CASE WHEN q.status='pending' AND q.lease_until<=clock_timestamp() THEN 'failed' ELSE q.status END AS status,
            CASE WHEN q.status='pending' AND q.lease_until<=clock_timestamp() THEN 'quote_request_expired' ELSE q.failure_code END AS failure_code,
            previous.evidence FROM sajda.lost_domain_quote_requests q
            LEFT JOIN LATERAL(SELECT o.evidence FROM sajda.lost_domain_quote_observations o
              JOIN sajda.lost_domain_quote_requests completed ON completed.id=o.request_id AND completed.owner_id=o.owner_id AND completed.namespace=o.namespace
              WHERE completed.namespace=q.namespace AND completed.owner_id=q.owner_id AND completed.run_id=q.run_id AND completed.domain=q.domain
                AND completed.status='succeeded' AND o.evidence->>'status'='checked'
              ORDER BY completed.requested_at DESC,completed.id DESC LIMIT 1) previous ON true
            WHERE q.namespace=$1 AND q.owner_id=$2 AND q.run_id=$3::uuid AND q.domain=ANY($4::text[])
            ORDER BY q.domain,q.requested_at DESC,q.id DESC LIMIT 600`,[namespace,ownerId,latest.id,assessments.map(item=>item.domain)]);
          const domains=new Set(assessments.map(item=>item.domain));
          for(const row of quotes.rows) {
            const domain=String(row.domain);
            if(!domains.has(domain) || !["pending","succeeded","failed"].includes(String(row.status))) continue;
            const evidence=isTradingRegistrarEvidence(row.evidence) && row.evidence.domain===domain?row.evidence:null;
            quoteUpdates[domain]={status:row.status==="succeeded" && !evidence?"failed":row.status as LostQuoteUpdate["status"],requestedAt:iso(row.requested_at),
              failureCode:row.status==="succeeded" && !evidence?"invalid_evidence":typeof row.failure_code==="string" && /^[a-z_]{1,60}$/u.test(row.failure_code)?row.failure_code:null,evidence};
          }
        }
        const sourceApprovals: Record<string,boolean> = Object.create(null);
        const researchObservations: Record<string,TradingDossierObservation[]> = Object.create(null);
        const supersededDomains:string[]=[];
        for (const row of rows.rows) {
          const result=row.assessment as LostAssessment, saved=row.source_snapshot as LostSource|undefined;
          sourceApprovals[result.domain]=approved.some(source=>source.id===row.source_id && saved?.id===source.id
            && saved.url===source.url && saved.host===source.host && saved.robotsUrl===source.robotsUrl);
        }
        if (latest && assessments.length) {
          const observed = await client.query(`/* lost:observation-history */ SELECT a.domain,a.run_id::text,a.observed_at,
            a.assessment->>'registryStatus' AS registry_status,a.assessment->>'sourceUrl' AS source_url
            FROM sajda.lost_domain_assessments a JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
            WHERE r.namespace=$1 AND a.owner_id=$2 AND a.domain=ANY($3::text[])
              AND a.observed_at>=statement_timestamp()-interval '180 days'
              AND a.observed_at<=$4::timestamptz ORDER BY a.observed_at DESC LIMIT 24000`,
          [namespace,ownerId,assessments.map(row => row.domain),latest.finishedAt ?? latest.updatedAt]);
          const histories = observationHistories(observed.rows.map(row => ({ domain:String(row.domain),runId:String(row.run_id),
            observedAt:iso(row.observed_at),sourceUrl:String(row.source_url),registryStatus:row.registry_status as HistoricalObservation["registryStatus"] })),latest.id);
          for (let i=0;i<assessments.length;i++) {
            const history=histories.get(assessments[i].domain);
            if(history) assessments[i]={...assessments[i],observationHistory:history};
          }
          // Bounded, full evidence snapshots. Aggregate counts above are never
          // substituted for actual time-separated technical observations.
          const deepDomains=assessments.filter(row=>row.registryStatus==="registry_not_found"
            && row.risk.level!=="excluded" && !row.sensitive)
            .sort((a,b)=>(b.marketFit?.score??0)-(a.marketFit?.score??0) || a.domain.localeCompare(b.domain))
            .slice(0,60).map(row=>row.domain);
          if(deepDomains.length) {
            // Keep the last complete report readable, but never present its
            // technical readiness as current after a newer account-owned check.
            // Cancelled/active/failed runs may hold newer contradictory facts.
            const newer=await client.query(`/* lost:superseded-observations */ SELECT DISTINCT a.domain
              FROM sajda.lost_domain_assessments a JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
              WHERE r.namespace=$1 AND a.owner_id=$2 AND a.domain=ANY($3::text[])
                AND a.observed_at>$4::timestamptz AND a.observed_at<=statement_timestamp()
              LIMIT 60`,[namespace,ownerId,deepDomains,latest.finishedAt??latest.updatedAt]);
            for(const row of newer.rows) {
              const domain=String(row.domain);
              if(deepDomains.includes(domain) && !supersededDomains.includes(domain)) supersededDomains.push(domain);
            }
            const full=await client.query(`/* lost:research-observations */
              SELECT domains.domain,recent.observed_at,recent.registry_status,recent.source_url,recent.target_url,recent.evidence
              FROM unnest($3::text[]) AS domains(domain)
              CROSS JOIN LATERAL (
                SELECT a.observed_at,a.assessment->>'registryStatus' AS registry_status,
                  a.assessment->>'sourceUrl' AS source_url,a.assessment->>'targetUrl' AS target_url,
                  a.assessment->'evidence' AS evidence
                FROM sajda.lost_domain_assessments a
                JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
                WHERE r.namespace=$1 AND a.owner_id=$2 AND a.domain=domains.domain
                  AND a.observed_at>=statement_timestamp()-interval '72 hours'
                  AND a.observed_at<=$4::timestamptz
                ORDER BY a.observed_at DESC,a.id DESC LIMIT 4
              ) recent`,[namespace,ownerId,deepDomains,latest.finishedAt??latest.updatedAt]);
            for(const row of full.rows) {
              const domain=String(row.domain);
              if(!deepDomains.includes(domain) || !Array.isArray(row.evidence)
                || !["registered","registry_not_found","unknown"].includes(String(row.registry_status))) continue;
              const history=researchObservations[domain]??=[];
              if(history.length<4) history.push({domain,observedAt:iso(row.observed_at),
                registryStatus:row.registry_status as TradingDossierObservation["registryStatus"],
                sourceUrl:String(row.source_url),targetUrl:String(row.target_url),
                evidence:row.evidence.slice(0,30) as TradingDossierObservation["evidence"]});
            }
          }
        }
        return {access:permission,sources:approved,runs:history,activeRun:history.find(value => ["queued","running"].includes(value.status))??null,
          ...(Object.keys(quoteUpdates).length?{quoteUpdates}:{}),
          researchObservations,sourceApprovals,...(supersededDomains.length?{supersededDomains}:{}),
          latestReport:latest ? {run:latest,assessments} : null};
      });
    },
    async claimWork(ownerId?: string, runId?: string): Promise<LostWorkLease | null> {
      if (ownerId !== undefined) owner(ownerId);
      if (runId !== undefined) uuid(runId);
      if(ownerId!==undefined && runId===undefined) fail('run_required',400);
      return query(async (client,namespace) => {
        await recover(client,namespace);
        const live = await client.query(`/* lost:global-lease */ SELECT 1 FROM sajda.lost_domain_work_items w
          JOIN sajda.lost_domain_runs r ON r.id=w.run_id WHERE r.namespace=$1 AND w.status='leased' AND w.lease_until>clock_timestamp() LIMIT 1`,[namespace]);
        if (live.rows.length) return null;
        const due = await client.query(`/* lost:claim-next */ SELECT w.*,w.id::text AS work_id,r.namespace,r.attempt_limit FROM sajda.lost_domain_work_items w
          JOIN sajda.lost_domain_runs r ON r.id=w.run_id AND r.owner_id=w.owner_id
          WHERE r.namespace=$1 AND r.status IN ('queued','running') AND w.status IN ('queued','retry_wait') AND w.next_attempt_at<=clock_timestamp()
            AND ($2::text IS NULL OR w.owner_id=$2) AND ($3::uuid IS NULL OR w.run_id=$3::uuid)
            AND (w.kind='source' OR NOT EXISTS(SELECT 1 FROM sajda.lost_domain_work_items source_work
              WHERE source_work.run_id=w.run_id AND source_work.kind='source' AND source_work.status IN ('queued','leased','retry_wait')))
          ORDER BY CASE WHEN w.kind='source' THEN 0 ELSE 1 END,w.created_at,w.id LIMIT 1 FOR UPDATE OF w SKIP LOCKED`,[namespace,ownerId??null,runId??null]);
        const work = due.rows[0];
        if (!work) return null;
        if(!(await access(client,String(work.owner_id),namespace)).allowed) return null;
        const approved = (await sources(client)).find(value => value.id===work.source_id);
        const snapshot = work.source_snapshot as LostSource;
        if (!approved || approved.url!==snapshot.url || approved.host!==snapshot.host || approved.robotsUrl!==snapshot.robotsUrl) {
          await client.query("UPDATE sajda.lost_domain_work_items SET status='failed',failure_code='source_not_approved' WHERE id=$1::uuid AND owner_id=$2",[work.work_id,work.owner_id]);
          await settle(client,namespace); return null;
        }
        const usage = await client.query(`/* lost:attempt-budget */ SELECT
          count(*) FILTER(WHERE started_at>clock_timestamp()-interval '24 hours')::int AS global_count,
          count(*) FILTER(WHERE owner_id=$2 AND started_at>clock_timestamp()-interval '24 hours')::int AS owner_count,
          count(*) FILTER(WHERE run_id=$3::uuid AND owner_id=$2)::int AS run_count,
          min(started_at) FILTER(WHERE started_at>clock_timestamp()-interval '24 hours')+interval '24 hours 1 second' AS global_retry_at,
          min(started_at) FILTER(WHERE owner_id=$2 AND started_at>clock_timestamp()-interval '24 hours')+interval '24 hours 1 second' AS owner_retry_at
          FROM sajda.lost_domain_attempts WHERE namespace=$1
            AND (started_at>clock_timestamp()-interval '24 hours' OR (run_id=$3::uuid AND owner_id=$2))`,[namespace,work.owner_id,work.run_id]);
        const used = usage.rows[0];
        if (integer(used?.run_count)>=runLimit(work.attempt_limit,80,LOST_DOMAIN_LIMITS.attemptsPerRun)) {
          await client.query("UPDATE sajda.lost_domain_work_items SET status='failed',failure_code='attempt_budget' WHERE owner_id=$1 AND run_id=$2::uuid AND status IN ('queued','retry_wait')",[work.owner_id,work.run_id]);
          await settle(client,namespace); return null;
        }
        const globalFull=integer(used?.global_count)>=LOST_DOMAIN_LIMITS.dailyGlobalAttempts;
        const ownerFull=integer(used?.owner_count)>=LOST_DOMAIN_LIMITS.dailyOwnerAttempts;
        if(globalFull || ownerFull) {
          // Daily budgets roll over; they do not erase a multi-day run. Waiting
          // consumes no lease/attempt, never shortens provider or temporal gaps,
          // and remains capped by the original server-owned run deadline.
          const retryTimes=[Date.now()+60000];
          if(globalFull && used?.global_retry_at) retryTimes.push(Date.parse(iso(used.global_retry_at)));
          if(ownerFull && used?.owner_retry_at) retryTimes.push(Date.parse(iso(used.owner_retry_at)));
          await client.query(`/* lost:daily-budget-wait */ UPDATE sajda.lost_domain_work_items w SET
            status='retry_wait',failure_code='daily_budget',
            next_attempt_at=LEAST(r.created_at+make_interval(secs=>r.run_lifetime_seconds),
              GREATEST(w.next_attempt_at,clock_timestamp()+interval '1 minute',$4::timestamptz))
            FROM sajda.lost_domain_runs r WHERE w.run_id=r.id AND r.namespace=$1 AND w.owner_id=$2 AND w.run_id=$3::uuid
              AND w.status IN ('queued','retry_wait')`,[namespace,work.owner_id,work.run_id,new Date(Math.max(...retryTimes)).toISOString()]);
          return null;
        }
        const token=randomUUID();
        const claimed=await client.query(`/* lost:lease */ UPDATE sajda.lost_domain_work_items SET status='leased',attempts=attempts+1,fence=fence+1,
          lease_token=$3::uuid,lease_until=clock_timestamp()+interval '45 seconds' WHERE id=$1::uuid AND owner_id=$2 AND attempts<3 RETURNING fence,lease_until`,[work.work_id,work.owner_id,token]);
        if (!claimed.rows[0]) fail("lost_domains_unavailable");
        const fence=integer(claimed.rows[0].fence);
        await client.query("INSERT INTO sajda.lost_domain_attempts(work_id,fence,owner_id,run_id,namespace) VALUES($1::uuid,$2,$3,$4::uuid,$5)",[work.work_id,fence,work.owner_id,work.run_id,namespace]);
        await client.query("UPDATE sajda.lost_domain_runs SET status='running',started_at=COALESCE(started_at,clock_timestamp()) WHERE id=$1::uuid AND owner_id=$2",[work.run_id,work.owner_id]);
        return {ownerId:String(work.owner_id),runId:String(work.run_id),workId:String(work.work_id),token,fence,kind:work.kind as "source"|"candidate",
          verification:work.verification===true,verificationRound:integer(work.verification_round??(work.verification===true?1:0)),
          source:approved,candidate:work.candidate as LostCandidate|null,expiresAt:iso(claimed.rows[0].lease_until)};
      },true);
    },
    async finishWork(lease: LostWorkLease, result: LostWorkResult): Promise<{applied:boolean;runStatus:LostRunStatus|null}> {
      owner(lease.ownerId); uuid(lease.runId); uuid(lease.workId); uuid(lease.token);
      return query(async (client,namespace) => {
        await recover(client,namespace);
        if (!(await access(client,lease.ownerId,namespace)).allowed) return {applied:false,runStatus:null};
        const rows=await client.query(`/* lost:finish-read */ SELECT w.*,r.candidate_limit,r.candidates_per_source FROM sajda.lost_domain_work_items w
          JOIN sajda.lost_domain_runs r ON r.id=w.run_id WHERE w.id=$1::uuid AND w.run_id=$2::uuid AND w.owner_id=$3 AND r.namespace=$4`,[lease.workId,lease.runId,lease.ownerId,namespace]);
        const work=rows.rows[0];
        if (!work || result.kind!==work.kind || integer(work.fence)!==lease.fence) return {applied:false,runStatus:null};
        const source=(await sources(client)).find(value=>value.id===work.source_id);
        const snapshot=work.source_snapshot as LostSource;
        if (!source || source.url!==snapshot.url || source.host!==snapshot.host || source.robotsUrl!==snapshot.robotsUrl) return {applied:false,runStatus:null};
        let candidates:LostCandidate[]=[], assessment:LostAssessment|undefined;
        if (result.kind==='source') {
          if (!Array.isArray(result.candidates) || result.candidates.length>60) fail("invalid_evidence",400);
          const unique=new Map<string,LostCandidate>();
          for (const raw of result.candidates) { const value=validateLostCandidate(raw,source); const previous=unique.get(value.domain);
            if(!previous) unique.set(value.domain,value); else if(value.sensitive) previous.sensitive=true; }
          candidates=[...unique.values()]; boundedJson(object(result.evidence));
        } else assessment=validateLostAssessment(result.assessment,work.candidate as LostCandidate);
        const hash=createHash('sha256').update(boundedJson(result.kind==='source'?{candidates,evidence:result.evidence}:assessment,196608)).digest('hex');
        if (work.status==='succeeded' && work.completion_token===lease.token && work.result_hash===hash) {
          return {applied:true,runStatus:(await runs(client,namespace,lease.ownerId)).find(v=>v.id===lease.runId)?.status??null};
        }
        const current=await client.query(`/* lost:fence-check */ SELECT 1 FROM sajda.lost_domain_work_items
          WHERE id=$1::uuid AND owner_id=$2 AND status='leased' AND lease_token=$3::uuid AND fence=$4 AND lease_until>clock_timestamp()`,[lease.workId,lease.ownerId,lease.token,lease.fence]);
        if (!current.rows.length) return {applied:false,runStatus:null};
        if(result.kind==='source') {
          // A sensitive reference may have fallen outside a previous source's
          // selection quota. Retain that warning even if this source first queues it.
          const sensitiveHistory=await client.query(`/* lost:prior-sensitive */ SELECT DISTINCT link->>'domain' AS domain
            FROM sajda.lost_domain_work_items w CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.source_evidence->'links','[]'::jsonb)) link
            WHERE w.owner_id=$1 AND w.run_id=$2::uuid AND w.kind='source' AND w.status='succeeded'
              AND link->>'sensitive'='true'`,[lease.ownerId,lease.runId]);
          const sensitiveDomains=new Set(sensitiveHistory.rows.map(row=>String(row.domain)));
          candidates=candidates.map(value=>sensitiveDomains.has(value.domain)?{...value,sensitive:true}:value);
          // All source work finishes before candidate claims. A sensitive
          // observation from ANY source wins; never overwrite provenance or
          // clear a previous warning when a second source repeats a domain.
          await client.query(`/* lost:merge-sensitive */ UPDATE sajda.lost_domain_work_items w
            SET candidate=jsonb_set(w.candidate,'{sensitive}','true'::jsonb)
            FROM jsonb_to_recordset($3::jsonb) input(domain text,sensitive boolean)
            WHERE w.owner_id=$1 AND w.run_id=$2::uuid AND w.kind='candidate' AND w.identity_key=input.domain
              AND input.sensitive AND w.status IN ('queued','retry_wait')`,[lease.ownerId,lease.runId,boundedJson(candidates,196608)]);
          const priorChecks = await client.query(`/* lost:previous-checks */ SELECT DISTINCT ON (a.domain) a.domain,a.observed_at,a.assessment->>'registryStatus' AS registry_status
            FROM sajda.lost_domain_assessments a JOIN sajda.lost_domain_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
            WHERE r.namespace=$1 AND a.owner_id=$2 AND a.domain=ANY($3::text[])
            ORDER BY a.domain,a.observed_at DESC`,[namespace,lease.ownerId,candidates.map(row=>row.domain)]);
          const queued = await client.query(`/* lost:queued-domains */ SELECT identity_key FROM sajda.lost_domain_work_items
            WHERE owner_id=$1 AND run_id=$2::uuid AND kind='candidate'`,[lease.ownerId,lease.runId]);
          const alreadyQueued = new Set(queued.rows.map(row=>String(row.identity_key)));
          const selected = selectDiscoveryCandidates(candidates.filter(row=>!alreadyQueued.has(row.domain)),priorChecks.rows.map(row=>({domain:String(row.domain),observedAt:iso(row.observed_at),
            registryStatus:row.registry_status as PreviousDomainCheck["registryStatus"]})),Date.now(),runLimit(work.candidates_per_source,20,60));
          await client.query(`/* lost:candidate-work */ INSERT INTO sajda.lost_domain_work_items
            (id,owner_id,run_id,kind,source_id,source_snapshot,identity_key,candidate)
            SELECT input.id,$1,$2::uuid,'candidate',$3::uuid,$4::jsonb,input.candidate->>'domain',input.candidate
            FROM jsonb_to_recordset($5::jsonb) AS input(id uuid,candidate jsonb)
            WHERE NOT EXISTS(SELECT 1 FROM sajda.lost_domain_work_items w WHERE w.run_id=$2::uuid AND w.kind='candidate' AND w.identity_key=input.candidate->>'domain')
            LIMIT GREATEST(0,$6::int-(SELECT count(*)::int FROM sajda.lost_domain_work_items WHERE run_id=$2::uuid AND kind='candidate'))
            ON CONFLICT(run_id,kind,identity_key) DO NOTHING`,[lease.ownerId,lease.runId,source.id,boundedJson(snapshot,8192),boundedJson(selected.map(candidate=>({id:randomUUID(),candidate})),196608),
              runLimit(work.candidate_limit,60,LOST_DOMAIN_LIMITS.candidateLimit)]);
        } else {
          await client.query(`/* lost:assessment */ INSERT INTO sajda.lost_domain_assessments
            (id,owner_id,run_id,work_id,domain,potential_score,confidence_score,qualified,assessment,observed_at)
            VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,false,$8::jsonb,clock_timestamp())`,[randomUUID(),lease.ownerId,lease.runId,lease.workId,assessment!.domain,assessment!.potentialScore,assessment!.confidenceScore,boundedJson(assessment)]);
        }
        await client.query(`/* lost:complete */ UPDATE sajda.lost_domain_work_items SET status='succeeded',completed_at=clock_timestamp(),
          completion_token=lease_token,result_hash=$5,lease_token=NULL,lease_until=NULL,source_evidence=$6::jsonb
          WHERE id=$1::uuid AND owner_id=$2 AND lease_token=$3::uuid AND fence=$4`,[lease.workId,lease.ownerId,lease.token,lease.fence,hash,result.kind==='source'?boundedJson(result.evidence):null]);
        await settle(client,namespace);
        return {applied:true,runStatus:(await runs(client,namespace,lease.ownerId)).find(value=>value.id===lease.runId)?.status??null};
      },true);
    },
    async failWork(lease:LostWorkLease, code:string, retryable=true, notBeforeISO?:string):Promise<{applied:boolean;runStatus:LostRunStatus|null}> {
      owner(lease.ownerId);uuid(lease.workId);uuid(lease.token);uuid(lease.runId);
      const safeCode=/^[a-z_]{1,60}$/u.test(code)?code:'provider_failed';
      if(notBeforeISO!==undefined) {
        const timestamp=Date.parse(notBeforeISO),now=Date.now();
        if(typeof notBeforeISO!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(notBeforeISO)
          || !Number.isFinite(timestamp) || timestamp<=now || timestamp>now+86400000) fail('invalid_retry_time',400);
      }
      return query(async(client,namespace)=>{
        await recover(client,namespace);
        const result=await client.query(`/* lost:fail */ UPDATE sajda.lost_domain_work_items w SET
          status=CASE WHEN $6::boolean AND attempts<3 THEN 'retry_wait' ELSE 'failed' END,
          next_attempt_at=LEAST(r.created_at+make_interval(secs=>r.run_lifetime_seconds),GREATEST(clock_timestamp()+interval '30 seconds'*attempts,$9::timestamptz)),
          failure_code=$5,lease_token=NULL,lease_until=NULL
          FROM sajda.lost_domain_runs r WHERE w.run_id=r.id AND r.namespace=$7 AND w.id=$1::uuid AND w.owner_id=$2
            AND w.lease_token=$3::uuid AND w.fence=$4 AND w.run_id=$8::uuid AND w.status='leased' AND w.lease_until>clock_timestamp() RETURNING w.id`,
        [lease.workId,lease.ownerId,lease.token,lease.fence,safeCode,retryable,namespace,lease.runId,notBeforeISO??null]);
        await settle(client,namespace);
        return {applied:result.rows.length===1,runStatus:(await runs(client,namespace,lease.ownerId)).find(value=>value.id===lease.runId)?.status??null};
      },true);
    },
    async cancelRun(ownerId:string,runId:string):Promise<boolean> {
      owner(ownerId);uuid(runId);
      return query(async(client,namespace)=>{
        const result=await client.query(`/* lost:cancel-run */ UPDATE sajda.lost_domain_runs SET status='cancelled',finished_at=clock_timestamp(),failure_code='user_cancelled'
          WHERE owner_id=$1 AND id=$2::uuid AND namespace=$3 AND status IN ('queued','running') RETURNING id`,[ownerId,runId,namespace]);
        if(result.rows.length) await client.query("UPDATE sajda.lost_domain_work_items SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE owner_id=$1 AND run_id=$2::uuid AND status IN ('queued','leased','retry_wait')",[ownerId,runId]);
        return result.rows.length===1;
      },true);
    },
    async scheduleDailyRuns():Promise<{started:number;reused:number;skipped:number}> {
      const eligible=await query(async(client,namespace)=>client.query(`/* lost:daily-owners */ SELECT a.owner_id,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day
        FROM sajda.lost_domain_effective_access a JOIN public.sajda_auth_user u ON u.id=a.owner_id
        WHERE a.namespace=$1 AND a.daily_refresh AND a.revoked_at IS NULL AND a.valid_from<=clock_timestamp() AND a.expires_at>clock_timestamp()
          AND u."emailVerified"=true AND NOT EXISTS(SELECT 1 FROM sajda.lost_domain_runs r WHERE r.owner_id=a.owner_id AND r.namespace=$1
            AND r.created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
          ORDER BY a.owner_id LIMIT 10`,[namespace]));
      let started=0,reused=0,skipped=0;
      for(const row of eligible.rows) {
        if(started>=1) break;
        try { const value=await store.startRun(String(row.owner_id),`daily:${String(row.day)}`); if(value.reused) reused++;else started++; }
        catch(error) { if(!(error instanceof LostDomainsStoreError)) throw error; skipped++; }
      }
      return {started,reused,skipped};
    },
  };
  return store;
}

export const lostDomainsStore = createLostDomainsStore();

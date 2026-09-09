import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "@/lib/accountRequestScope";
import { isLostDomainOpportunity, type LostDomainOpportunity } from "../../shared/lost-domain-opportunity";
import { isTradingMarketFit, type TradingMarketFit } from "../../shared/trading-market-fit";
import { isTradingArchiveEvidence, type TradingArchiveEvidence } from "../../shared/trading-archive";
import { TRADING_CAPACITY } from "../../shared/trading-capacity";
import { isTradingDossier, type TradingDossier } from "../../shared/trading-dossier";
import { isTradingAcquisition, type TradingAcquisition } from "../../shared/trading-acquisition";
import { isTradingRegistrarEvidence, type TradingRegistrarEvidence } from "../../shared/trading-registrar";

export type LostRunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
export interface LostDomainRun {
  id: string;
  status: LostRunStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceCount: number;
  candidateCount: number;
  completedCount: number;
  failedCount: number;
  capacity?: { sourceLimit: number; candidateLimit: number };
  verificationCount?: number;
  completedVerificationCount?: number;
  verificationRound?: number;
  verificationMaxRounds?: number;
  nextCheckAt?: string | null;
}
export interface LostDomainEvidence {
  kind: "target_http" | "dns" | "mail" | "registry";
  source: string;
  method: string;
  observedAt: string;
  expiresAt: string;
  outcome: string;
}
export interface LostDomainAssessment {
  opportunity?: LostDomainOpportunity;
  opportunityScore?: number;
  marketFit?: TradingMarketFit;
  archive?: TradingArchiveEvidence;
  dossier?: TradingDossier;
  acquisition?: TradingAcquisition;
  registrar?: TradingRegistrarEvidence;
  observationHistory?: {
    firstObservedAt: string; lastObservedAt: string; observations: number; independentSources: number;
    previousRegistryStatus: "registered" | "registry_not_found" | "unknown" | null;
    previousObservedAt: string | null; registryChanged: boolean; windowDays: 180;
  };
  domain: string;
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  sensitive: boolean;
  registryStatus: "registered" | "registry_not_found" | "unknown";
  registrability: "unverified";
  confirmedRegistrable: false;
  reviewStatus: "review_candidate" | "registered" | "inconclusive" | "excluded";
  evidence: LostDomainEvidence[];
  risk: { level: "review" | "excluded"; reasons: string[] };
  potentialScore: number;
  confidenceScore: number;
}
export interface LostDomainsSnapshot {
  accountId: string;
  requestId: string;
  access: boolean;
  enabled: boolean;
  sourcesAvailable: number;
  activeRun: LostDomainRun | null;
  latestRun: LostDomainRun | null;
  latestAttempt: LostDomainRun | null;
  candidates: LostDomainAssessment[];
  candidatesOmitted?: number;
  quoteRefreshEnabled?: boolean;
  quoteUpdates?: Record<string, LostDomainQuoteUpdate>;
}
export interface LostDomainQuoteUpdate {
  status: "pending" | "succeeded" | "failed";
  requestedAt: string;
  failureCode?: string | null;
  evidence?: TradingRegistrarEvidence | null;
}
export type LostDomainsAction = { action: "start"; requestKey: string }
  | { action: "advance" | "cancel"; runId: string }
  | { action: "refresh_quote"; runId: string; domain: string; requestKey: string };
const quoteFailureCodes = ["quote_unavailable", "quote_in_progress", "quote_cooldown", "quote_daily_limit", "quote_candidate_unavailable", "quote_request_conflict", "quote_request_expired"] as const;
export type LostDomainsErrorCode = "unauthenticated" | "account_changed" | "plus_required" | "email_verification_required"
  | "unavailable" | "disabled" | "no_sources" | "rate_limited" | "run_conflict" | "invalid_response" | typeof quoteFailureCodes[number];
export class LostDomainsError extends Error {
  constructor(readonly code: LostDomainsErrorCode, readonly requestId?: string) {
    super("Lost Domains could not confirm this request. Refresh the report before trying again.");
    this.name = "LostDomainsError";
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestId = /^req_[A-Za-z0-9_-]{16}$/u;
const domainName = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const string = (value: unknown, max = 2048): value is string => typeof value === "string" && value.length <= max;
const date = (value: unknown): value is string => string(value, 40) && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000;
const score = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
const oneOf = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === "string" && values.includes(value as T);
function safeUrl(value: unknown): value is string {
  if (!string(value, 2048)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
function invalid(): never { throw new LostDomainsError("invalid_response"); }
function parseRun(value: unknown): LostDomainRun | null {
  if (value === null) return null;
  const run = object(value);
  if (!run || !string(run.id) || !uuid.test(run.id) || !oneOf(run.status, ["queued", "running", "succeeded", "partial", "failed", "cancelled"])
    || !date(run.createdAt) || !date(run.updatedAt) || !(run.completedAt === null || date(run.completedAt))
    || ![run.sourceCount, run.candidateCount, run.completedCount, run.failedCount].every(count)) return invalid();
  const active = run.status === "queued" || run.status === "running";
  if (active !== (run.completedAt === null) || Number(run.completedCount) > Number(run.candidateCount)
    || Number(run.failedCount) > Number(run.completedCount) || Number(run.sourceCount) > TRADING_CAPACITY.sourceLimit
    || Number(run.candidateCount) > TRADING_CAPACITY.candidateLimit) return invalid();
  let capacity: LostDomainRun["capacity"];
  if (run.capacity !== undefined) {
    const limits = object(run.capacity);
    if (!limits || Object.keys(limits).length !== 2 || !count(limits.sourceLimit) || limits.sourceLimit < 1 || limits.sourceLimit > TRADING_CAPACITY.sourceLimit
      || !count(limits.candidateLimit) || limits.candidateLimit < 1 || limits.candidateLimit > TRADING_CAPACITY.candidateLimit
      || Number(run.sourceCount) > limits.sourceLimit || Number(run.candidateCount) > limits.candidateLimit) return invalid();
    capacity = { sourceLimit: limits.sourceLimit, candidateLimit: limits.candidateLimit };
  }
  let verification: Pick<LostDomainRun,"verificationCount"|"completedVerificationCount"|"verificationRound"|"verificationMaxRounds"|"nextCheckAt"> = {};
  if (run.verificationCount !== undefined || run.completedVerificationCount !== undefined) {
    if (!count(run.verificationCount) || run.verificationCount > TRADING_CAPACITY.reportLimit * Number(run.verificationMaxRounds ?? 1) || !count(run.completedVerificationCount)
      || run.completedVerificationCount > run.verificationCount) return invalid();
    verification = { verificationCount: run.verificationCount, completedVerificationCount: run.completedVerificationCount };
  }
  if (run.verificationRound !== undefined || run.verificationMaxRounds !== undefined || run.nextCheckAt !== undefined) {
    if (!count(run.verificationRound) || run.verificationRound > 3 || !count(run.verificationMaxRounds)
      || run.verificationMaxRounds < 1 || run.verificationMaxRounds > 3 || run.verificationRound > run.verificationMaxRounds
      || !(run.nextCheckAt === null || date(run.nextCheckAt)) || !active && run.nextCheckAt !== null
      || date(run.nextCheckAt) && Date.parse(run.nextCheckAt) < Date.parse(run.createdAt)
      || Number(run.verificationCount ?? 0) > run.verificationMaxRounds * TRADING_CAPACITY.reportLimit) return invalid();
    verification = { ...verification, verificationRound: run.verificationRound, verificationMaxRounds: run.verificationMaxRounds, nextCheckAt: run.nextCheckAt as string | null };
  }
  return { id: run.id, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt, completedAt: run.completedAt as string | null,
    sourceCount: run.sourceCount as number, candidateCount: run.candidateCount as number,
    completedCount: run.completedCount as number, failedCount: run.failedCount as number, ...(capacity ? { capacity } : {}), ...verification };
}
function parseAssessment(value: unknown): LostDomainAssessment {
  const row = object(value), risk = object(row?.risk);
  if (!row || !string(row.domain, 253) || !domainName.test(row.domain) || !safeUrl(row.sourceUrl) || !safeUrl(row.targetUrl)
    || !string(row.anchor, 160) || typeof row.sensitive !== "boolean" || row.registrability !== "unverified" || row.confirmedRegistrable !== false
    || !oneOf(row.registryStatus, ["registered", "registry_not_found", "unknown"])
    || !oneOf(row.reviewStatus, ["review_candidate", "registered", "inconclusive", "excluded"])
    || !Array.isArray(row.evidence) || row.evidence.length > 20 || !risk || !oneOf(risk.level, ["review", "excluded"])
    || !Array.isArray(risk.reasons) || risk.reasons.length > 30 || !risk.reasons.every(reason => string(reason, 1000))
    || !score(row.potentialScore) || !score(row.confidenceScore)) return invalid();
  const evidence = row.evidence.map(value => {
    const item = object(value);
    if (!item || !oneOf(item.kind, ["target_http", "dns", "mail", "registry"]) || !string(item.source) || !string(item.method, 120)
      || !date(item.observedAt) || !date(item.expiresAt) || !string(item.outcome, 1000)
      || Date.parse(item.expiresAt) < Date.parse(item.observedAt)) return invalid();
    // Deliberately omit provider-specific details; never render arbitrary objects/HTML.
    return { kind: item.kind, source: item.source, method: item.method, observedAt: item.observedAt, expiresAt: item.expiresAt, outcome: item.outcome };
  });
  if (row.reviewStatus === "review_candidate" && (row.registryStatus !== "registry_not_found" || risk.level === "excluded" || row.sensitive)) return invalid();
  if (row.opportunity !== undefined && (!isLostDomainOpportunity(row.opportunity) || row.opportunityScore !== row.opportunity.score)
    || row.opportunity === undefined && row.opportunityScore !== undefined) return invalid();
  if (row.marketFit !== undefined && (!isTradingMarketFit(row.marketFit) || row.marketFit.domain !== row.domain)
    || row.archive !== undefined && (!isTradingArchiveEvidence(row.archive) || row.archive.domain !== row.domain)) return invalid();
  if (row.dossier !== undefined && (!isTradingDossier(row.dossier) || row.dossier.domain !== row.domain)
    || row.acquisition !== undefined && (!isTradingAcquisition(row.acquisition) || row.acquisition.domain !== row.domain)) return invalid();
  if (row.registrar !== undefined && (!isTradingRegistrarEvidence(row.registrar) || row.registrar.domain !== row.domain)) return invalid();
  let observationHistory: LostDomainAssessment["observationHistory"];
  if (row.observationHistory !== undefined) {
    const history=object(row.observationHistory);
    if (!history || !date(history.firstObservedAt) || !date(history.lastObservedAt)
      || Date.parse(history.firstObservedAt)>Date.parse(history.lastObservedAt)
      || !count(history.observations) || history.observations<1 || !count(history.independentSources) || history.independentSources>history.observations
      || ![null,"registered","registry_not_found","unknown"].includes(history.previousRegistryStatus as string|null)
      || !(history.previousObservedAt===null || date(history.previousObservedAt))
      || (history.previousObservedAt===null)!==(history.previousRegistryStatus===null)
      || history.previousObservedAt!==null && Date.parse(String(history.previousObservedAt))>Date.parse(history.lastObservedAt)
      || typeof history.registryChanged!=="boolean" || history.windowDays!==180
      || history.registryChanged && (history.previousRegistryStatus===null || history.previousRegistryStatus==="unknown" || row.registryStatus==="unknown" || history.previousRegistryStatus===row.registryStatus)) return invalid();
    observationHistory={firstObservedAt:history.firstObservedAt,lastObservedAt:history.lastObservedAt,observations:history.observations,
      independentSources:history.independentSources,previousRegistryStatus:history.previousRegistryStatus as "registered"|"registry_not_found"|"unknown"|null,
      previousObservedAt:history.previousObservedAt as string|null,registryChanged:history.registryChanged,windowDays:180};
  }
  return { domain: row.domain, sourceUrl: row.sourceUrl, targetUrl: row.targetUrl, anchor: row.anchor, sensitive: row.sensitive,
    registryStatus: row.registryStatus, registrability: "unverified", confirmedRegistrable: false, reviewStatus: row.reviewStatus,
    evidence, risk: { level: risk.level, reasons: risk.reasons as string[] }, potentialScore: row.potentialScore, confidenceScore: row.confidenceScore,
    ...(row.opportunity ? {opportunity:row.opportunity as LostDomainOpportunity,opportunityScore:row.opportunityScore as number}:{}),
    ...(row.marketFit ? { marketFit: row.marketFit as TradingMarketFit } : {}),
    ...(row.archive ? { archive: row.archive as TradingArchiveEvidence } : {}),
    ...(row.dossier ? { dossier: row.dossier as TradingDossier } : {}),
    ...(row.acquisition ? { acquisition: row.acquisition as TradingAcquisition } : {}),
    ...(row.registrar ? { registrar: row.registrar as TradingRegistrarEvidence } : {}),
    ...(observationHistory ? {observationHistory}: {}) };
}

export function parseLostDomainsSnapshot(value: unknown, accountId: string): LostDomainsSnapshot {
  const payload = object(value);
  if (string(payload?.accountId) && payload.accountId !== accountId) throw new LostDomainsError("account_changed");
  if (!accountId || !payload || payload.accountId !== accountId || !string(payload.requestId) || !requestId.test(payload.requestId)
    || typeof payload.access !== "boolean" || typeof payload.enabled !== "boolean" || !count(payload.sourcesAvailable)
    || !Array.isArray(payload.candidates) || payload.candidates.length > TRADING_CAPACITY.candidateLimit || payload.error !== undefined || payload.code !== undefined || payload.ok === false) return invalid();
  if (payload.candidatesOmitted !== undefined && (!count(payload.candidatesOmitted)
    || payload.candidatesOmitted + payload.candidates.length > TRADING_CAPACITY.candidateLimit)) return invalid();
  const activeRun = parseRun(payload.activeRun), latestRun = parseRun(payload.latestRun), latestAttempt = parseRun(payload.latestAttempt);
  if (activeRun && !["queued", "running"].includes(activeRun.status) || latestRun && !["succeeded", "partial"].includes(latestRun.status)) return invalid();
  const candidates = payload.candidates.map(parseAssessment);
  if (new Set(candidates.map(row => row.domain)).size !== candidates.length || (candidates.length > 0 || Number(payload.candidatesOmitted ?? 0) > 0) && !latestRun
    || !payload.access && (activeRun || latestRun || latestAttempt || candidates.length || payload.candidatesOmitted)) return invalid();
  if (payload.quoteRefreshEnabled !== undefined && typeof payload.quoteRefreshEnabled !== "boolean") return invalid();
  let quoteUpdates: Record<string, LostDomainQuoteUpdate> | undefined;
  if (payload.quoteUpdates !== undefined) {
    const updates = object(payload.quoteUpdates), domains = new Set(candidates.map(row => row.domain));
    if (!updates || Object.keys(updates).length > TRADING_CAPACITY.candidateLimit || !payload.access && Object.keys(updates).length) return invalid();
    quoteUpdates = {};
    for (const [domain, raw] of Object.entries(updates)) {
      const row = object(raw);
      if (!domains.has(domain) || !row || Object.keys(row).some(key => !["status", "requestedAt", "failureCode", "evidence"].includes(key))
        || !oneOf(row.status, ["pending", "succeeded", "failed"]) || !date(row.requestedAt)
        || !(row.failureCode === undefined || row.failureCode === null || string(row.failureCode, 80) && /^[a-z][a-z0-9_]*$/u.test(row.failureCode))
        || row.evidence !== undefined && row.evidence !== null && (!isTradingRegistrarEvidence(row.evidence) || row.evidence.domain !== domain || row.evidence.status !== "checked")
        || row.status === "succeeded" && !row.evidence) return invalid();
      quoteUpdates[domain] = { status: row.status, requestedAt: row.requestedAt,
        ...(row.failureCode !== undefined ? { failureCode: row.failureCode as string | null } : {}),
        ...(row.evidence !== undefined ? { evidence: row.evidence as TradingRegistrarEvidence | null } : {}) };
    }
  }
  return { accountId, requestId: payload.requestId, access: payload.access, enabled: payload.enabled,
    sourcesAvailable: payload.sourcesAvailable, activeRun, latestRun, latestAttempt, candidates,
    ...(payload.quoteRefreshEnabled !== undefined ? { quoteRefreshEnabled: payload.quoteRefreshEnabled as boolean } : {}),
    ...(quoteUpdates !== undefined ? { quoteUpdates } : {}),
    ...(payload.candidatesOmitted !== undefined ? { candidatesOmitted: payload.candidatesOmitted as number } : {}) };
}

/** The freshness rule is independent of whether a row fits in the displayed 30. */
export function isFreshReviewCandidate(row: LostDomainAssessment, now = Date.now()): boolean {
  return row.reviewStatus === "review_candidate" && row.registryStatus === "registry_not_found"
    && !row.sensitive && row.risk.level!=="excluded"
    && row.dossier?.status!=="reject" && row.acquisition?.status!=="excluded" && row.registrar?.availability!=="unavailable"
    && (!row.opportunity || ["priority_review","review"].includes(row.opportunity.tier))
    && row.evidence.some(item => {
      const observed = Date.parse(item.observedAt), expires = Date.parse(item.expiresAt);
      return item.kind === "registry" && item.method === "rdap" && item.outcome === "registry_not_found"
        && observed <= now && observed >= now - 15 * 60_000 && expires > now && expires <= observed + 15 * 60_000;
    });
}
export function freshReviewCandidates(candidates: LostDomainAssessment[], now = Date.now()): LostDomainAssessment[] {
  return candidates.filter(row => isFreshReviewCandidate(row, now)).slice(0, 30);
}
function safeFailure(error: unknown): Error {
  if (error instanceof LostDomainsError || error instanceof Error && error.name === "AbortError") return error;
  const failure = object(error);
  const trace = string(failure?.requestId) && requestId.test(failure.requestId) ? failure.requestId : undefined;
  if (failure?.code === "account_changed") return new LostDomainsError("account_changed", trace);
  if (failure?.status === 401) return new LostDomainsError("unauthenticated", trace);
  if (failure?.code === "email_verification_required") return new LostDomainsError("email_verification_required", trace);
  if (["plus_required", "premium_required"].includes(String(failure?.code))) return new LostDomainsError("plus_required", trace);
  if (oneOf(failure?.code, quoteFailureCodes)) return new LostDomainsError(failure.code, trace);
  if (failure?.status === 429) return new LostDomainsError("rate_limited", trace);
  if (["engine_disabled", "lost_domains_disabled", "feature_disabled"].includes(String(failure?.code))) return new LostDomainsError("disabled", trace);
  if (["no_sources", "sources_unavailable"].includes(String(failure?.code))) return new LostDomainsError("no_sources", trace);
  if (failure?.status === 409) return new LostDomainsError("run_conflict", trace);
  return new LostDomainsError("unavailable", trace);
}
async function request(options: AccountRequestScope, action?: LostDomainsAction): Promise<LostDomainsSnapshot> {
  const scope = { accountId: options.accountId, signal: options.signal };
  if (!scope.accountId) throw new LostDomainsError("unauthenticated");
  if (action && (!oneOf(action.action, ["start", "advance", "cancel", "refresh_quote"])
    || !uuid.test(action.action === "start" ? action.requestKey : action.runId)
    || action.action === "refresh_quote" && (!uuid.test(action.requestKey) || !domainName.test(action.domain)))) throw new LostDomainsError("invalid_response");
  const body = action && (action.action === "start" ? { action: action.action, requestKey: action.requestKey }
    : action.action === "refresh_quote" ? { action: action.action, runId: action.runId, domain: action.domain, requestKey: action.requestKey }
    : { action: action.action, runId: action.runId });
  try {
    const payload = await accountRequest<unknown>("/api/account/lost-domains", { ...scope, ...(body ? { method: "POST", body } : {}) });
    const result = parseLostDomainsSnapshot(payload, scope.accountId);
    scope.signal?.throwIfAborted();
    const session = await readAccountSession();
    scope.signal?.throwIfAborted();
    if (!session || !Number.isFinite(session.expires_at) || Number(session.expires_at) <= Date.now() / 1000) throw new LostDomainsError("unauthenticated");
    assertAccountSessionOwner(session.user.id, scope.accountId);
    return result;
  } catch (error) { throw safeFailure(error); }
}
export const getLostDomains = (scope: AccountRequestScope) => request(scope);
export const changeLostDomains = (scope: AccountRequestScope, action: LostDomainsAction) => request(scope, action);

import { AccountAccessError } from "./account-auth.js";
import { lostDomainsStore, LostDomainsStoreError, type LostRun, type LostWorkLease } from "./lost-domains-store.js";
import { createLostDomainsEngine, rankAssessments, type Assessment } from "./lost-domains-engine.js";
import { permitLostRegistry, deferLostRegistry, lostRegistryRetryAt } from "./lost-domains-providers.js";
import { inspectDomainArchive, isArchiveEnrichmentEnabled } from "./lost-domains-archive.js";
import { analyzeTradingMarketFit } from "../../shared/trading-market-fit.js";
import { TRADING_CAPACITY } from "../../shared/trading-capacity.js";
import { analyzeTradingDossier } from "../../shared/trading-dossier.js";
import { evaluateTradingAcquisition } from "../../shared/trading-acquisition.js";
import { registrarAcquisitionEvidence } from "../../shared/trading-registrar.js";
import { inspectDomainRegistrar, isRegistrarEnrichmentEnabled } from "./lost-domains-registrar.js";

const liveEngine = createLostDomainsEngine({ registryGate: permitLostRegistry, registryBackoff: deferLostRegistry });
function presentRun(run: LostRun | null) {
  if (!run) return null;
  return { id: run.id, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt,
    completedAt: run.finishedAt, sourceCount: run.sourceCount, candidateCount: run.candidateCount,
    completedCount: run.completedCount, failedCount: run.failedCount,...(run.capacity?{capacity:run.capacity}:{}),
    ...(run.verificationCount!==undefined?{verificationCount:run.verificationCount,completedVerificationCount:run.completedVerificationCount??0}:{}),
    ...(run.verificationRound!==undefined?{verificationRound:run.verificationRound,verificationMaxRounds:run.verificationMaxRounds??1,
      nextCheckAt:run.nextCheckAt??null}:{}) };
}
export function boundedTradingReport(rows: Assessment[], maxBytes=2_800_000) {
  const candidates:Assessment[]=[];
  let bytes=2;
  for(const row of rows.slice(0,TRADING_CAPACITY.candidateLimit)) {
    const size=Buffer.byteLength(JSON.stringify(row),"utf8")+(candidates.length?1:0);
    if(bytes+size>maxBytes) break;
    candidates.push(row);bytes+=size;
  }
  return {candidates,candidatesOmitted:Math.max(0,rows.length-candidates.length)};
}
function accountError(error: unknown): never {
  if (error instanceof LostDomainsStoreError) {
    const messages: Record<string, string> = {
      plus_required: "Lost Domains requires active Sajda Trading access.",
      sources_unavailable: "No reviewed sources are enabled yet. Your previous report is preserved.",
      daily_limit: "The daily review budget has been reached. Try again later.",
      refresh_cooldown: "A review was recently started. Wait before refreshing again.",
      request_expired: "This review request is no longer available. Reload the workspace.",
      quote_candidate_unavailable: "This candidate can no longer be refreshed. Review its source and latest safety checks.",
      quote_daily_limit: "The daily limit of 60 price refreshes has been reached. Try again tomorrow.",
      quote_cooldown: "This domain was recently checked. Wait one minute before requesting another price.",
      quote_in_progress: "A price refresh is already running. Refresh the report to see its status.",
      quote_request_conflict: "This request identifier belongs to a different candidate. Reload the report.",
    };
    throw new AccountAccessError(error.code, error.status, messages[error.code] ?? "The review could not be updated. Your previous report is preserved.");
  }
  throw error;
}

export function createLostDomainsService(deps: {
  store?: typeof lostDomainsStore;
  engine?: Pick<typeof liveEngine, "discoverSource" | "inspectCandidate">;
  registryRetryAt?: typeof lostRegistryRetryAt;
  archive?: typeof inspectDomainArchive;
  archiveEnabled?: () => boolean;
  registrar?: typeof inspectDomainRegistrar;
  registrarEnabled?: () => boolean;
  now?: () => number;
} = {}) {
  const store = deps.store ?? lostDomainsStore, engine = deps.engine ?? liveEngine;
  const quoteEnabled=()=> (deps.registrarEnabled??isRegistrarEnrichmentEnabled)() && (deps.registrar!==undefined
    || /^pk1_(?!sb_)[A-Za-z0-9_-]{16,256}$/u.test(globalThis.process.env.PORKBUN_API_KEY??"")
      && /^sk1_(?!sb_)[A-Za-z0-9_-]{16,256}$/u.test(globalThis.process.env.PORKBUN_SECRET_API_KEY??""));
  async function process(lease: LostWorkLease): Promise<boolean> {
    let result: Parameters<typeof store.finishWork>[1];
    try {
      if (lease.kind === "source") {
        const discovery = await engine.discoverSource({ url: lease.source.url, allowedHost: lease.source.host, maxLinks: 60,rotationKey:lease.runId });
        result = { kind: "source", candidates: discovery.candidates, evidence: {
          sourceUrl: lease.source.url, observedAt: discovery.observedAt, method: "robots_checked_https_html",
          links: discovery.candidates.map(({ domain, sensitive }) => ({ domain, sensitive })),
        } };
      } else {
        if (!lease.candidate) throw new Error("Missing server-owned candidate");
        result = { kind: "candidate", assessment: await engine.inspectCandidate(lease.candidate) };
      }
    } catch (error) {
      const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "provider_failed";
      const code = /^[a-z_]{1,60}$/u.test(raw) ? raw : "provider_failed";
      const retryable = !["invalid_source", "invalid_candidate", "blocked_address", "invalid_url", "robots_disallowed", "robots_delay", "response_too_large"].includes(code);
      const failed = await store.failWork(lease, code, retryable);
      console.info(JSON.stringify({ event: "lost_domains_work_failed", runId: lease.runId, workId: lease.workId, code, applied: failed.applied }));
      return failed.applied;
    }
    if (result.kind === "candidate") {
      const registry = result.assessment.evidence.find(item => item.kind === "registry");
      if (registry?.outcome === "rate_limited") {
        let retryAt: string | null = null;
        try { retryAt = await (deps.registryRetryAt ?? lostRegistryRetryAt)(registry.source); } catch { /* A conservative delay still prevents an immediate retry. */ }
        const observedRetry = typeof registry.details?.retryAt === "string" ? Date.parse(registry.details.retryAt) : 0;
        const storedRetry = retryAt ? Date.parse(retryAt) : 0;
        const next = Math.max(Date.now() + 60_000, Number.isFinite(storedRetry) ? storedRetry : 0,
          Number.isFinite(observedRetry) ? observedRetry : 0);
        return (await store.failWork(lease, "registry_rate_limited", true, new Date(Math.min(next, Date.now() + 24 * 60 * 60_000)).toISOString())).applied;
      }
      if (registry?.method === "rdap" && registry.outcome === "unknown" && result.assessment.risk.level !== "excluded") {
        return (await store.failWork(lease, "registry_unavailable", true)).applied;
      }
      result.assessment.marketFit=analyzeTradingMarketFit(result.assessment.domain);
      // Metadata enrichment is limited to the final 30 verification slots.
      // It never consumes the primary provider retry budget or alters availability.
      if (lease.verification && (lease.verificationRound===undefined || lease.verificationRound>=3)
        && result.assessment.reviewStatus==="review_candidate"
        && result.assessment.risk.level!=="excluded" && !result.assessment.sensitive
        && result.assessment.marketFit.score>=60 && (deps.archiveEnabled??isArchiveEnrichmentEnabled)()) {
        const deadline=Math.min(Date.now()+4000,Date.parse(lease.expiresAt)-5000);
        if(deadline>Date.now()+500) {
          try { result.assessment.archive=await (deps.archive??inspectDomainArchive)(result.assessment.domain,{deadline}); }
          catch {
            // Preserve a successfully completed registry/DNS check on optional
            // enrichment failure. Never silently turn missing history into proof.
            result.assessment.archive={source:"common_crawl",domain:result.assessment.domain,status:"unknown",reason:"unavailable",
              checkedAt:new Date().toISOString(),sourceUrl:null,collection:null,sampleCount:null,
              earliestSampleAt:null,latestSampleAt:null,sampleStatuses:[],priorExistence:null,sampleLimit:5,collectionLimit:1};
          }
        }
      }
      // Exact-domain price observation only in the last durable round. The
      // read-only provider cannot register or purchase a name; shared throttles
      // and a caller deadline keep this optional step inside the current lease.
      if(lease.verification && lease.verificationRound===TRADING_CAPACITY.verificationMaxRounds
        && result.assessment.reviewStatus==="review_candidate" && result.assessment.risk.level!=="excluded"
        && !result.assessment.sensitive && (deps.registrarEnabled??isRegistrarEnrichmentEnabled)()) {
        const remaining=Math.min(4000,Date.parse(lease.expiresAt)-Date.now()-5000);
        if(remaining>500) {
          try { result.assessment.registrar=await (deps.registrar??inspectDomainRegistrar)(result.assessment.domain,
            {signal:AbortSignal.timeout(remaining)}); }
          catch { console.info(JSON.stringify({event:"lost_domains_registrar_enrichment_failed",runId:lease.runId,workId:lease.workId})); }
        }
      }
    }
    // A lost DB response is NOT converted into a second provider request. The
    // lease/idempotent completion protocol owns recovery after uncertain commits.
    const completion = await store.finishWork(lease, result);
    console.info(JSON.stringify({ event: "lost_domains_work_completed", runId: lease.runId, workId: lease.workId,
      kind: lease.kind, applied: completion.applied, status: completion.runStatus }));
    return completion.applied;
  }
  const service = {
    async read(ownerId: string) {
      try {
        const dashboard = await store.getDashboard(ownerId);
        if (!dashboard.access.allowed) return { access: false, sourcesAvailable: 0, activeRun: null, latestRun: null, latestAttempt: null, candidates: [] as Assessment[] };
        const assessments = (dashboard.latestReport?.assessments ?? []).map(item=>{
          const updated=dashboard.quoteUpdates?.[item.domain]?.evidence;
          return updated && (!item.registrar || Date.parse(updated.checkedAt)>=Date.parse(item.registrar.checkedAt))
            ? {...item,registrar:updated}:item;
        }) as Assessment[];
        const ranking = rankAssessments(assessments);
        // Keep dated diagnostics visible even when evidence expires; never
        // retimestamp old results or silently replace the previous good report.
        const now=(deps.now??Date.now)();
        const enriched=[...ranking.review,...ranking.excluded].map(item=>{
          const dossier=analyzeTradingDossier(item,{now,observations:dashboard.researchObservations?.[item.domain],
            sourceApproved:dashboard.sourceApprovals?.[item.domain]===true,superseded:dashboard.supersededDomains?.includes(item.domain)});
          // Exact registrar observations have their own five-minute expiry.
          // Reviewed comparables/history/rights are not invented from name-fit.
          const acquisition=evaluateTradingAcquisition({domain:item.domain,...registrarAcquisitionEvidence(item.registrar),
            excluded:item.risk.level==="excluded" || dossier.status==="reject"},now);
          return {...item,dossier,acquisition};
        }).sort((a,b)=>Number(a.dossier.status==="reject" || a.acquisition.status==="excluded")
          -Number(b.dossier.status==="reject" || b.acquisition.status==="excluded"));
        const {candidates,candidatesOmitted}=boundedTradingReport(enriched);
        const visible=new Set(candidates.map(item=>item.domain));
        const quoteUpdates=Object.fromEntries(Object.entries(dashboard.quoteUpdates??{}).filter(([domain])=>visible.has(domain)));
        return { access: true, sourcesAvailable: dashboard.sources.length, activeRun: presentRun(dashboard.activeRun),
          latestRun: presentRun(dashboard.latestReport?.run ?? null), latestAttempt: presentRun(dashboard.runs[0] ?? null), candidates,
          quoteRefreshEnabled:quoteEnabled(),...(Object.keys(quoteUpdates).length?{quoteUpdates}:{}),
          ...(candidatesOmitted?{candidatesOmitted}:{}) };
      } catch (error) { return accountError(error); }
    },
    async start(ownerId: string, requestKey: string) {
      try { return await store.startRun(ownerId, requestKey); } catch (error) { return accountError(error); }
    },
    async refreshQuote(ownerId:string,runId:string,domain:string,requestKey:string) {
      try {
        if(!quoteEnabled()) throw new AccountAccessError("quote_unavailable",503,"Exact price refresh is not connected. Your research report is unchanged.");
        const request=await store.beginQuoteRefresh(ownerId,runId,domain,requestKey);
        if(request.reused || !request.lease) return false;
        const lease=request.lease,remaining=Math.min(4000,Date.parse(lease.leaseUntil)-Date.now()-5000);
        let evidence:Awaited<ReturnType<typeof inspectDomainRegistrar>>|null=null;
        let failureCode:string|undefined;
        if(remaining<=500) failureCode="quote_request_expired";
        else {
          try { evidence=await (deps.registrar??inspectDomainRegistrar)(lease.domain,{signal:AbortSignal.timeout(remaining)}); }
          catch { failureCode="provider_unavailable"; }
        }
        // An uncertain DB completion never causes a second provider call. A repeated
        // request key reads its durable status and the operator/user may retry explicitly.
        return (await store.finishQuoteRefresh(lease,evidence,failureCode)).applied;
      } catch(error) { return accountError(error); }
    },
    async advance(ownerId: string, runId: string) {
      try {
        if (!(await store.readAccess(ownerId)).allowed) throw new AccountAccessError("plus_required", 403, "Lost Domains requires active Sajda Trading access.");
        // Identity and run are both passed to the claim; a guessed run ID can
        // neither execute nor expose another account's work.
        const lease = await store.claimWork(ownerId, runId);
        return lease ? await process(lease) : false;
      } catch (error) { return accountError(error); }
    },
    async cancel(ownerId: string, runId: string) {
      try { return await store.cancelRun(ownerId, runId); } catch (error) { return accountError(error); }
    },
    async tick() {
      try {
        const now=deps.now??Date.now,deadline=now()+25000;
        await store.scheduleDailyRuns();
        let advanced=false;
        // Sequential work only: preserve the global lease, provider backoff and
        // DB budgets. Time and item caps prevent an unbounded cron invocation.
        for(let index=0;index<3 && now()<deadline;index++) {
          const lease = await store.claimWork();
          if(!lease) break;
          const applied=await process(lease);
          advanced=advanced||applied;
          if(!applied) break;
        }
        return advanced;
      } catch (error) { return accountError(error); }
    },
  };
  return service;
}

export const lostDomainsService = createLostDomainsService();

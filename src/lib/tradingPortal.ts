import type { LostDomainAssessment, LostDomainEvidence } from "./lostDomains";
import type { TradingAnalysisMode } from "../../shared/trading-scenarios";

const score = (value: number | undefined) => Number.isFinite(value) ? Math.min(100, Math.max(0, value!)) : 0;
const observedOutcomes: Record<LostDomainEvidence["kind"],readonly string[]> = {
  registry:["registered","registry_not_found"], dns:["resolves","no_address","nxdomain","non_public_address"],
  mail:["mx_present","no_explicit_mx"], target_http:["responding","redirected","dead_url","http_error","unreachable"],
};
export function isFreshTradingEvidence(evidence: LostDomainEvidence, now: number): boolean {
  const at=Date.parse(evidence.observedAt),expires=Date.parse(evidence.expiresAt);
  return Number.isFinite(now)&&Number.isFinite(at)&&at<=now&&now-at<900_000&&expires>now&&expires>at&&expires-at<=900_000;
}
export function isCurrentTradingEvidence(evidence: LostDomainEvidence, now: number): boolean {
  return isFreshTradingEvidence(evidence,now)&&Boolean(observedOutcomes[evidence.kind]?.includes(evidence.outcome));
}
export function tradingEvidenceCoverage(row: LostDomainAssessment, now: number): number {
  let count=0;
  for(const kind of Object.keys(observedOutcomes) as LostDomainEvidence["kind"][]) {
    const evidence=row.evidence.filter(e=>e.kind===kind);
    const newest=Math.max(...evidence.map(e=>Date.parse(e.observedAt)));
    const latest=evidence.filter(e=>Date.parse(e.observedAt)===newest);
    if(latest.length&&latest.every(e=>isCurrentTradingEvidence(e,now))&&new Set(latest.map(e=>e.outcome)).size===1)count++;
  }
  return count;
}
export function tradingPortalScore(row: LostDomainAssessment, mode: TradingAnalysisMode, now: number): number {
  const coverage = tradingEvidenceCoverage(row, now);
  const excluded = row.sensitive || row.risk.level === "excluded" || row.reviewStatus === "excluded";
  // Risk mode is a triage queue: higher means more unresolved checks, not a better investment.
  if (mode === "risk") return Math.min(100, (excluded ? 40 : 0) + (4 - coverage) * 10 + Math.min(20, row.risk.reasons.length * 4));
  if (excluded || !coverage) return 0;
  const fit = score(row.marketFit?.score), confidence = score(row.confidenceScore), opportunity = score(row.opportunity?.score);
  if (mode === "brand") return Math.round(fit * .8 + coverage * 5);
  if (mode === "acquisition") {
    const quote = row.registrar;
    const quoteCheckedAt = Date.parse(quote?.checkedAt ?? "");
    const freshQuote = quote?.status === "checked" && quoteCheckedAt <= now && Date.parse(quote.expiresAt) > now;
    // An observed registration after this quote cannot be erased merely because
    // that check's cache lifetime elapsed first. A subsequent quote can supersede
    // it; an expiry alone cannot resurrect older availability evidence.
    const registry = row.evidence.filter(e => e.kind === "registry" && Number.isFinite(Date.parse(e.observedAt))
      && Date.parse(e.observedAt)<=now && Date.parse(e.expiresAt)>Date.parse(e.observedAt));
    const registryCheckedAt = Math.max(...registry.map(e => Date.parse(e.observedAt)));
    // A newer (or tied) registration observation contradicts an older available
    // quote. Historical registration before that quote does not veto the quote.
    const registryContradictsQuote = registryCheckedAt >= quoteCheckedAt && (row.registryStatus === "registered"
      || registry.some(e => Date.parse(e.observedAt) >= quoteCheckedAt && e.outcome === "registered"));
    // Exact registrar observations are distinct from registry absence. No valuation is invented.
    return Math.round((freshQuote && quote.availability === "available" && !registryContradictsQuote ? 45 : 0) + coverage * 5 + opportunity * .35);
  }
  return Math.round(fit * .4 + confidence * .3 + opportunity * .3);
}
export function rankTradingPortal(rows: readonly LostDomainAssessment[], mode: TradingAnalysisMode, query: string, now: number) {
  const search = query.trim().toLowerCase();
  return rows.filter(row => !search || row.domain.includes(search)).map(row => ({row, score:tradingPortalScore(row,mode,now)}))
    .sort((a,b) => b.score-a.score || a.row.domain.localeCompare(b.row.domain));
}
export function tradingReportComposition(rows: readonly LostDomainAssessment[]) {
  const groups = new Map<string,{extension:string;count:number;changed:number}>();
  for (const row of rows) {
    const extension = row.domain.split(".").at(-1) ?? "";
    const group = groups.get(extension) ?? {extension,count:0,changed:0};
    group.count++; if (row.observationHistory?.registryChanged) group.changed++;
    groups.set(extension,group);
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count || a.extension.localeCompare(b.extension));
}

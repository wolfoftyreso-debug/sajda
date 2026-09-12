import { presentConnectorShortlist, type ConnectorShortlistRequest } from "./connector-shortlist.js";
import { fetchConnectorRegistrarOffers } from "./connector-registrar.js";
import type { ConnectorCandidate } from "./connector-candidates.js";

const MAX_QUOTE_BATCHES = 6;
const RUN_BUDGET_MS = 45_000;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

/** Registry checks consume one bounded anonymous search. Exact quotes then refill
 * the confirmed shortlist, in naming-quality order, until the target or a hard
 * limit is reached. Provisional extension prices never terminate this loop. */
export async function completeConnectorSearch(engine: Record<string, unknown>, request: ConnectorShortlistRequest,
  candidates: readonly ConnectorCandidate[], dependencies: {
    quote?: typeof fetchConnectorRegistrarOffers; now?: () => number; startedAt?: number; referenceFx?: unknown;
  } = {}) {
  const now = dependencies.now ?? Date.now, startedAt = dependencies.startedAt ?? now();
  const byDomain = new Map(candidates.slice(0, 120).map(candidate => [candidate.domain, candidate]));
  const rows: Array<Record<string, unknown> & { domain: string; namingScore: number; rationale: string }> =
    (Array.isArray(engine.results) ? engine.results : []).slice(0, 200).flatMap(value => {
    const row = record(value), candidate = row && byDomain.get(String(row.domain));
    return row && candidate ? [{ ...row, domain: candidate.domain, namingScore: candidate.namingScore, rationale: candidate.rationale }] : [];
  });
  const projected = () => presentConnectorShortlist({ ...engine, results: rows }, request, { now: now(), referenceFx: dependencies.referenceFx });
  let result = projected();
  let stopReason = "candidate_pool_exhausted", quoteChecks = 0, quoteBatches = 0;
  // Fail closed on duplicate/conflicting observations before contacting a registrar.
  const domains = rows.filter(row => row.status === "available" && row.authoritative === true
    && ["rdap", "das"].includes(String(row.checkMethod)) && row.error === undefined
    && typeof row.checkedAt === "string" && Number.isFinite(Date.parse(row.checkedAt))
    && now() - Date.parse(row.checkedAt) >= 0 && now() - Date.parse(row.checkedAt) <= 300_000
    && rows.filter(other => other.domain === row.domain).length === 1)
    .sort((a, b) => b.namingScore - a.namingScore).map(row => row.domain);
  for (let offset = 0; offset < domains.length; offset += 20) {
    if (result.confirmedCount >= request.count) { stopReason = "target_reached"; break; }
    if (now() - startedAt >= RUN_BUDGET_MS || quoteBatches >= MAX_QUOTE_BATCHES) { stopReason = "work_limit"; break; }
    const batch = domains.slice(offset, offset + 20);
    let response: Awaited<ReturnType<typeof fetchConnectorRegistrarOffers>>;
    try { response = await (dependencies.quote ?? fetchConnectorRegistrarOffers)(batch); }
    catch { stopReason = "provider_unavailable"; break; }
    if (response.status === "not_configured") { stopReason = "exact_pricing_not_configured"; break; }
    quoteBatches++;
    quoteChecks += Math.min(batch.length, Math.max(0, Number.isInteger(response.checkedDomains) ? response.checkedDomains : 0));
    if (response.status !== "ok") {
      stopReason = response.failureReason === "authorization" ? "registrar_authorization_required"
        : response.status === "rate_limited" ? "provider_rate_limited" : "provider_unavailable"; break;
    }
    for (const domain of batch) {
      const row = rows.find(item => item.domain === domain), offer = response.offers[domain];
      if (row && offer) row.registrarOffers = [offer, ...(Array.isArray(row.registrarOffers) ? row.registrarOffers : [])];
    }
    result = projected();
  }
  result = projected();
  if (result.confirmedCount >= request.count) stopReason = "target_reached";
  return { ...result, search: { candidatePoolSize: byDomain.size,
    registryChecks: Math.min(byDomain.size, typeof engine.checked === "number" && Number.isInteger(engine.checked) ? Math.max(0, engine.checked) : rows.length),
    quoteChecks, quoteBatches, stopReason, maxCandidatePool: 120, timeBudgetMs: RUN_BUDGET_MS },
    ...(stopReason === "exact_pricing_not_configured" ? { operatorAction: "Connect the exact-domain registrar price provider. Provisional ideas are not confirmed budget matches." } : {}),
    ...(stopReason === "registrar_authorization_required" ? { operatorAction: "The registrar rejected the configured credentials or permissions. The operator must review the scoped connection; no permissions were expanded automatically." } : {}),
  };
}

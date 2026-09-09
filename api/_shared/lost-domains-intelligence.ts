import { parse } from "tldts";
import { domainToASCII } from "node:url";
import { analyzeTradingMarketFit } from "../../shared/trading-market-fit.js";
import type { LostCandidate, LostSource } from "./lost-domains-store.js";

export interface PreviousDomainCheck {
  domain: string;
  observedAt: string;
  registryStatus: "registered" | "registry_not_found" | "unknown";
}

const boundedLimit = (limit: number): number => Number.isSafeInteger(Math.floor(limit)) ? Math.max(0, Math.floor(limit)) : 0;
const domainKey = (domain: string): string => domainToASCII(domain.trim().replace(/\.$/u, "")).toLowerCase();

function publisherKey(source: LostSource): string {
  try {
    const host = domainKey(source.host || new URL(source.url).hostname);
    return parse(host, { allowPrivateDomains: true }).domain || host || source.id;
  } catch { return source.id; }
}

/** Choose least-recent sources across independent publishers before taking a
 * second page from one publisher. Failed attempts also count toward rotation. */
export function rotateSources(sources: LostSource[], observations: { sourceId: string; attemptedAt: string }[], limit: number): LostSource[] {
  const last = new Map<string, number>();
  for (const row of observations) {
    const at = Date.parse(row.attemptedAt);
    if (Number.isFinite(at)) last.set(row.sourceId, Math.max(at, last.get(row.sourceId) ?? 0));
  }
  const ordered = [...sources].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  const publishers = new Set<string>(), distinct: LostSource[] = [], repeated: LostSource[] = [];
  for (const source of ordered) {
    const publisher = publisherKey(source);
    if (publishers.has(publisher)) repeated.push(source);
    else { publishers.add(publisher); distinct.push(source); }
  }
  return [...distinct, ...repeated].slice(0, boundedLimit(limit));
}

/** Pure budget allocation: reserve 50% for exploration, 25% for due registry
 * negatives, 15% for unknowns and 10% for weekly registered rechecks. Largest
 * remainder rounding and spare-slot filling preserve the exact caller limit.
 * Name fit guides exploration only; it is never evidence of availability. */
export function selectDiscoveryCandidates<T extends LostCandidate>(candidates: T[], observations: PreviousDomainCheck[], now: number, limit: number): T[] {
  const maximum = boundedLimit(limit);
  if (!maximum || !Number.isFinite(now)) return [];
  const previous = new Map<string, PreviousDomainCheck>();
  for (const row of observations) {
    const at = Date.parse(row.observedAt), domain = domainKey(row.domain);
    if (!domain || !Number.isFinite(at) || at > now) continue;
    const old = previous.get(domain);
    // A conflicting same-time negative must not shorten a registered cooldown.
    const caution = { registry_not_found: 0, unknown: 1, registered: 2 };
    if (!old || at > Date.parse(old.observedAt) || at === Date.parse(old.observedAt)
      && caution[row.registryStatus] > caution[old.registryStatus]) previous.set(domain, row);
  }
  // Merge the complete input before selection, including duplicates after the
  // budget cutoff, so a later sensitive dependency cannot become a safe target.
  const unique = new Map<string, { candidate: T; index: number }>();
  for (const [index, candidate] of candidates.entries()) {
    const domain = domainKey(candidate.domain);
    if (!domain) continue;
    const old = unique.get(domain);
    if (!old) unique.set(domain, { candidate: { ...candidate, domain }, index });
    else if (candidate.sensitive) old.candidate.sensitive = true;
  }
  type Ranked = { candidate: T; index: number; observed: number; fit: number };
  const buckets: Ranked[][] = [[], [], [], [], []];
  for (const { candidate, index } of unique.values()) {
    const old = previous.get(candidate.domain), observed = old ? Date.parse(old.observedAt) : 0;
    if (candidate.sensitive) {
      if (!old) buckets[4].push({ candidate, index, observed, fit: 0 });
      continue;
    }
    const ttl = old?.registryStatus === "registered" ? 7 * 86_400_000 : old?.registryStatus === "registry_not_found" ? 15 * 60_000 : 30 * 60_000;
    if (old && now - observed < ttl) continue;
    const bucket = !old ? 0 : old.registryStatus === "registry_not_found" ? 1 : old.registryStatus === "unknown" ? 2 : 3;
    buckets[bucket].push({ candidate, index, observed, fit: bucket === 0 ? analyzeTradingMarketFit(candidate.domain).score : 0 });
  }
  for (const bucket of buckets) bucket.sort((a, b) => a.observed - b.observed || b.fit - a.fit || a.index - b.index);
  const shares = [0.5, 0.25, 0.15, 0.1].map((weight, index) => ({ index, exact: maximum * weight }));
  const quotas = shares.map(row => Math.floor(row.exact));
  const remainderOrder = [...shares].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.index - b.index);
  const roundingSlots = maximum - quotas.reduce((sum, count) => sum + count, 0);
  for (let index = 0; index < roundingSlots; index++) quotas[remainderOrder[index].index]++;
  const counts = buckets.map((bucket, index) => Math.min(bucket.length, quotas[index] ?? 0));
  let spare = maximum - counts.reduce((sum, count) => sum + count, 0);
  for (const index of [1, 2, 3, 0, 4]) {
    const extra = Math.min(spare, buckets[index].length - counts[index]);
    counts[index] += extra; spare -= extra;
  }
  return buckets.flatMap((bucket, index) => bucket.slice(0, counts[index]).map(row => row.candidate));
}

export interface DomainObservationHistory {
  firstObservedAt: string;
  lastObservedAt: string;
  observations: number;
  independentSources: number;
  previousRegistryStatus: PreviousDomainCheck["registryStatus"] | null;
  previousObservedAt: string | null;
  registryChanged: boolean;
  windowDays: 180;
}

export interface HistoricalObservation extends PreviousDomainCheck { sourceUrl: string; runId: string }

/** This is Sajda observation history, NOT historical ownership, backlinks or
 * traffic. Counts are limited to the explicit 180-day account-scoped window. */
export function observationHistories(rows: HistoricalObservation[], currentRunId: string): Map<string, DomainObservationHistory> {
  const groups = new Map<string, HistoricalObservation[]>();
  for (const row of rows) {
    if (!Number.isFinite(Date.parse(row.observedAt))) continue;
    const group = groups.get(row.domain) ?? [];
    group.push(row); groups.set(row.domain, group);
  }
  const result = new Map<string, DomainObservationHistory>();
  for (const [domain, group] of groups) {
    group.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    const current = group.find(row => row.runId === currentRunId);
    if (!current) continue;
    const prior = group.find(row => row.runId !== currentRunId && Date.parse(row.observedAt) < Date.parse(current.observedAt));
    const independent = new Set(group.flatMap(row => {
      try { const parsed = parse(new URL(row.sourceUrl).hostname, { allowPrivateDomains: true }); return parsed.domain ? [parsed.domain] : []; }
      catch { return []; }
    }));
    result.set(domain, { firstObservedAt: group[group.length - 1].observedAt, lastObservedAt: group[0].observedAt,
      observations: group.length, independentSources: independent.size, previousRegistryStatus: prior?.registryStatus ?? null,
      previousObservedAt: prior?.observedAt ?? null, registryChanged: Boolean(prior && prior.registryStatus !== "unknown"
        && current.registryStatus !== "unknown" && prior.registryStatus !== current.registryStatus), windowDays: 180 });
  }
  return result;
}

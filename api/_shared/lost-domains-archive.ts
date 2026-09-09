import { parse } from "tldts";
import { ARCHIVE_COLLECTION_PATTERN, type TradingArchiveEvidence } from "../../shared/trading-archive.js";
import { LostDomainsFetchError, safeHttpsFetch, safeHttpsUrl, withAbort,
  type SafeFetchOptions, type SafeFetchResponse } from "./lost-domains-fetch.js";
import { listSourceIndexCollections } from "./lost-domains-source-index.js";
import { permitLostArchive, deferLostArchive } from "./lost-domains-providers.js";

const INDEX_HOST = "index.commoncrawl.org";
const COLLECTION_URL = `https://${INDEX_HOST}/collinfo.json`;
const DAY_MS = 86_400_000;
const MAX_CACHE_ENTRIES = 200;
type ArchiveFetch = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResponse>;
type ArchiveReason = TradingArchiveEvidence["reason"];
export interface ArchiveInspectOptions { deadline?: number; signal?: AbortSignal }

/** An operator must opt in on the server; browser input cannot enable this. */
export function isArchiveEnrichmentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SAJDA_LOST_DOMAINS_ARCHIVE_ENABLED === "true";
}

function validApex(domain: string): boolean {
  try {
    const url = safeHttpsUrl(`https://${domain}/`), parsed = parse(domain, { allowPrivateDomains: true });
    return url.hostname === domain && url.href === `https://${domain}/` && domain.length <= 253
      && parsed.isIcann === true && parsed.isPrivate === false && parsed.domain === domain
      && !["example.com", "example.net", "example.org"].includes(domain);
  } catch { return false; }
}

/** Fixed provider, one collection, exact apex host, five index rows, no pagination or WARC access.
 * API contract: https://index.commoncrawl.org/ and its linked pywb CDX Server API.
 * Host matching excludes subdomains; returned URLs are independently checked below. */
export function buildDomainArchiveQuery(domain: string, collection: string): URL {
  if (!validApex(domain) || !ARCHIVE_COLLECTION_PATTERN.test(collection)) throw new Error("invalid_archive_scope");
  const url = new URL(`https://${INDEX_HOST}/${collection}-index`);
  url.search = new URLSearchParams({ url: domain, matchType: "host", output: "json", limit: "5", fl: "url,timestamp,status" }).toString();
  return url;
}

function captureDate(value: unknown, checkedAt: string): string | null {
  if (typeof value !== "string" || !/^\d{14}$/u.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString() === iso && iso <= checkedAt ? iso : null;
}

class ArchiveError extends Error {
  constructor(readonly reason: ArchiveReason) { super(reason); }
}

function empty(domain: string, checkedAt: string, reason: ArchiveReason, collection: string | null = null): TradingArchiveEvidence {
  return { source: "common_crawl", domain, status: reason === "disabled" ? "disabled" : "unknown", reason, checkedAt,
    collection, sourceUrl: collection ? buildDomainArchiveQuery(domain, collection).href : null,
    sampleCount: reason === "no_sightings" ? 0 : null, earliestSampleAt: null, latestSampleAt: null,
    sampleStatuses: [], priorExistence: null, sampleLimit: 5, collectionLimit: 1 };
}

/** Sample times are extrema of at most five rows in one collection, not a domain's lifetime. */
function parseSamples(domain: string, collection: string, response: SafeFetchResponse, checkedAt: string): TradingArchiveEvidence {
  const lines = response.body.split(/\r?\n/u).filter(line => line.trim());
  if (lines.length > 5) throw new ArchiveError("invalid_response");
  const samples: { capturedAt: string; status: number }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line); } catch { throw new ArchiveError("invalid_response"); }
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.url !== "string" || row.url.length > 2_048
      || Array.from(row.url).some(character => character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
      throw new ArchiveError("invalid_response");
    }
    let url: URL;
    try { url = new URL(row.url); } catch { throw new ArchiveError("invalid_response"); }
    // The index can canonicalize www hosts. Never attribute those or other hosts to this exact apex.
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== domain || url.username || url.password || url.port) continue;
    const capturedAt = captureDate(row.timestamp, checkedAt), status = Number(row.status);
    if (!capturedAt || !/^[1-5]\d{2}$/u.test(String(row.status)) || !Number.isInteger(status)) throw new ArchiveError("invalid_response");
    const key = `${row.url}\n${capturedAt}\n${status}`;
    if (!seen.has(key)) { seen.add(key); samples.push({ capturedAt, status }); }
  }
  if (!samples.length) return empty(domain, checkedAt, lines.length ? "invalid_response" : "no_sightings", collection);
  samples.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return { ...empty(domain, checkedAt, "crawl_sightings", collection), status: "observed", priorExistence: true,
    sampleCount: samples.length, earliestSampleAt: samples[0].capturedAt, latestSampleAt: samples[samples.length - 1].capturedAt,
    sampleStatuses: samples.map(sample => sample.status) };
}

/** Process-local cache and one active inspection. Deploy this optional step on one bounded worker.
 * Common Crawl asks for sequential calls with delays and a 24h pause if blocked:
 * https://commoncrawl.org/faq . No retries, proxies, archived payloads or target page requests. */
export function createArchiveInspector(deps: {
  fetch?: ArchiveFetch;
  now?: () => number;
  enabled?: () => boolean;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  /** Live use supplies a durable provider gate; omitted only by isolated fixtures. */
  gate?: (signal: AbortSignal) => Promise<boolean>;
  backoff?: (retryAt: number, signal: AbortSignal) => Promise<void>;
} = {}) {
  const fetch = deps.fetch ?? safeHttpsFetch, now = deps.now ?? Date.now;
  const enabled = deps.enabled ?? isArchiveEnrichmentEnabled;
  const wait = deps.wait ?? ((milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new LostDomainsFetchError("aborted")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) { signal.removeEventListener("abort", cancel); cancel(); }
  }));
  const cache = new Map<string, { expiresAt: number; evidence: TradingArchiveEvidence }>();
  let latest: { collection: string; expiresAt: number } | null = null;
  let busy = false, nextRequestAt = 0, cooldownUntil = 0;

  return async function inspectDomainArchive(domain: string, options: ArchiveInspectOptions = {}): Promise<TradingArchiveEvidence> {
    const startedAt = now(), checkedAt = new Date(startedAt).toISOString();
    if (!validApex(domain)) return empty(domain, checkedAt, "invalid_domain");
    if (!enabled()) return empty(domain, checkedAt, "disabled");
    const cached = cache.get(domain);
    if (cached && cached.expiresAt > startedAt) return { ...cached.evidence, sampleStatuses: [...cached.evidence.sampleStatuses] };
    cache.delete(domain);
    if (cooldownUntil > startedAt) return empty(domain, checkedAt, "rate_limited");
    if (busy) return empty(domain, checkedAt, "busy");
    const deadline = Math.min(startedAt + 10_000, options.deadline ?? Infinity);
    if (!Number.isFinite(deadline) || deadline <= startedAt) return empty(domain, checkedAt, "timeout");
    if (options.signal?.aborted) return empty(domain, checkedAt, "aborted");
    const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(deadline - startedAt)));
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let collection: string | null = null;
    busy = true;
    const boundedFetch: ArchiveFetch = async url => {
      if (url !== COLLECTION_URL && (!collection || url !== buildDomainArchiveQuery(domain, collection).href)) throw new ArchiveError("invalid_response");
      const delay = Math.max(0, nextRequestAt - now());
      if (now() + delay >= deadline) throw new ArchiveError("timeout");
      if (delay) await withAbort(wait(delay, signal), signal);
      if (deps.gate) {
        try {
          if (!await withAbort(deps.gate(signal), signal)) throw new ArchiveError("rate_limited");
        } catch (error) {
          if (error instanceof LostDomainsFetchError || error instanceof ArchiveError) throw error;
          throw new ArchiveError("unavailable");
        }
      }
      let response: SafeFetchResponse;
      try {
        response = await withAbort(fetch(url, { deadline, signal, maxBytes: url === COLLECTION_URL ? 131_072 : 32_768,
          maxRedirects: 0, allowedHosts: [INDEX_HOST], accept: "application/json,text/x-ndjson,text/plain" }), signal);
      } finally { nextRequestAt = now() + 1_000; }
      if ([429, 503].includes(response.status)) {
        cooldownUntil = now() + DAY_MS;
        if (deps.backoff) {
          try { await withAbort(deps.backoff(cooldownUntil, signal), signal); }
          catch {
            // Keep local cooldown and unknown evidence; make failed cross-worker
            // persistence diagnosable without logging domains or provider bodies.
            console.warn(JSON.stringify({event:"lost_domains_archive_backoff_failed",code:"cooldown_persistence_unavailable"}));
          }
        }
        throw new ArchiveError("rate_limited");
      }
      if (response.url !== url || Buffer.byteLength(response.body) > (url === COLLECTION_URL ? 131_072 : 32_768)) throw new ArchiveError("invalid_response");
      if (response.status !== 200) throw new ArchiveError("unavailable");
      if (!/^(?:application\/(?:json|x-ndjson)|text\/(?:plain|x-ndjson))(?:;|$)/iu.test(response.headers["content-type"] ?? "")) {
        throw new ArchiveError("invalid_response");
      }
      return response;
    };
    let evidence: TradingArchiveEvidence;
    try {
      if (!latest || latest.expiresAt <= now()) {
        const collections = await listSourceIndexCollections({ fetch: boundedFetch, now });
        if (!collections[0]) throw new ArchiveError("invalid_response");
        latest = { collection: collections[0], expiresAt: now() + DAY_MS };
      }
      collection = latest.collection;
      const response = await boundedFetch(buildDomainArchiveQuery(domain, collection).href);
      evidence = parseSamples(domain, collection, response, new Date(now()).toISOString());
    } catch (error) {
      const reason = error instanceof ArchiveError ? error.reason : error instanceof LostDomainsFetchError
        ? error.code === "timeout" || error.code === "aborted" ? error.code : "unavailable"
        : "invalid_response";
      evidence = empty(domain, new Date(now()).toISOString(), reason, collection);
    } finally { busy = false; }
    // Unknown failures receive a short negative cache; successful bounded samples live for one day.
    const ttl = evidence.status === "observed" || evidence.reason === "no_sightings" ? DAY_MS : 15 * 60_000;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(domain, { expiresAt: now() + ttl, evidence });
    return { ...evidence, sampleStatuses: [...evidence.sampleStatuses] };
  };
}

export const inspectDomainArchive = createArchiveInspector({ gate: permitLostArchive, backoff: deferLostArchive });

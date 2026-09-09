import { parse } from "tldts";
import { safeHttpsFetch, safeHttpsUrl, type SafeFetchOptions, type SafeFetchResponse } from "./lost-domains-fetch.js";
import { SourceCatalogError } from "./lost-domains-source-catalog.js";

const INDEX_HOST = "index.commoncrawl.org";
const collectionPattern = /^CC-MAIN-20\d{2}-(?:0[1-9]|[1-4]\d|5[0-3])$/u;
type IndexFetch = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResponse>;
export interface IndexedSourceHint { url: string; host: string; capturedAt: string; indexCollection: string;
  indexUrl: string; observedAt: string; liveVerified: false; policyApproved: false }
const fail = (code: string): never => { throw new SourceCatalogError(code); };
function collection(value: string): string { return collectionPattern.test(value) ? value : fail("invalid_collection"); }
function prefixUrl(host: string, path: string): URL {
  if (typeof host !== "string" || typeof path !== "string" || !path.startsWith("/") || path.length > 500
    || path === "/" || !path.endsWith("/") || /[*?%#\\]/u.test(path)) return fail("invalid_index_scope");
  let url: URL;
  try { url = safeHttpsUrl(`https://${host}${path}`); } catch { return fail("invalid_index_scope"); }
  const domain = parse(url.hostname, { allowPrivateDomains: true });
  if (url.hostname !== host || url.pathname !== path || !domain.isIcann || domain.isPrivate || !domain.domain
    || ["example.com", "example.net", "example.org"].includes(domain.domain)) return fail("invalid_index_scope");
  return url;
}
/** One narrow exact-host/path prefix, one collection and ten metadata rows. */
export function buildSourceIndexQuery(input: { host: string; pathPrefix: string; collection: string }): URL {
  const prefix = prefixUrl(input.host, input.pathPrefix);
  const url = new URL(`https://${INDEX_HOST}/${collection(input.collection)}-index`);
  url.searchParams.set("url", prefix.href); url.searchParams.set("matchType", "prefix");
  url.searchParams.set("output", "json"); url.searchParams.set("limit", "10");
  url.searchParams.append("filter", "=status:200"); url.searchParams.append("filter", "=mime:text/html");
  url.searchParams.set("fl", "url,timestamp,status,mime");
  return url;
}
function captureDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{14}$/u.test(value)) return;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`;
  const time = new Date(iso);
  return Number.isFinite(time.getTime()) && time.toISOString() === iso ? iso : undefined;
}
function safeResponse(response: SafeFetchResponse) {
  if (response.status === 429) return fail("index_rate_limited");
  if (response.status !== 200 || !/^(?:application\/(?:json|x-ndjson)|text\/(?:plain|x-ndjson))(?:;|$)/iu.test(response.headers["content-type"] ?? "")) return fail("index_unavailable");
  if (Buffer.byteLength(response.body) > 131_072) return fail("invalid_index_response");
}
/** Metadata only. No archive, listed page, outgoing target or registrar fetch. */
export async function discoverIndexedSources(input: { host: string; pathPrefix: string; collection: string }, deps: { fetch?: IndexFetch; now?: () => number } = {}) {
  const query = buildSourceIndexQuery(input), now = deps.now ?? Date.now;
  const response = await (deps.fetch ?? safeHttpsFetch)(query.href, { deadline: now() + 10_000, maxBytes: 131_072,
    maxRedirects: 0, allowedHosts: [INDEX_HOST], accept: "application/json,text/x-ndjson,text/plain" });
  safeResponse(response);
  const prefix = prefixUrl(input.host, input.pathPrefix), hints = new Map<string, IndexedSourceHint>();
  const lines = response.body.split(/\r?\n/u).filter(line => line.trim());
  if (lines.length > 10) return fail("invalid_index_response");
  for (const line of lines) {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line); } catch { return fail("invalid_index_response"); }
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail("invalid_index_response");
    const capturedAt = captureDate(row.timestamp);
    if (!capturedAt || Date.parse(capturedAt) > now() || String(row.status) !== "200" || row.mime !== "text/html" || typeof row.url !== "string") continue;
    let url: URL, decodedPath: string;
    try { url = safeHttpsUrl(row.url); decodedPath = decodeURIComponent(url.pathname); } catch { continue; }
    if (url.hostname !== prefix.hostname || !url.pathname.startsWith(prefix.pathname) || url.search || url.hash
      || url.href !== row.url || /(?:^|\/)(?:login|account|signin|password|oauth|auth|api|cdn|webmail)(?:\/|$)/iu.test(decodedPath)) continue;
    const hint: IndexedSourceHint = { url: url.href, host: input.host, capturedAt, indexCollection: input.collection,
      indexUrl: query.href, observedAt: response.observedAt, liveVerified: false, policyApproved: false };
    const previous = hints.get(hint.url);
    if (!previous || previous.capturedAt < hint.capturedAt) hints.set(hint.url, hint);
  }
  return { hints: [...hints.values()], indexUrl: query.href, observedAt: response.observedAt,
    targetPagesFetched: 0, outgoingLinksVerified: false, sourcesRegistered: 0 };
}
export async function listSourceIndexCollections(deps: { fetch?: IndexFetch; now?: () => number } = {}): Promise<string[]> {
  const response = await (deps.fetch ?? safeHttpsFetch)(`https://${INDEX_HOST}/collinfo.json`, { deadline: (deps.now ?? Date.now)() + 10_000,
    maxBytes: 131_072, maxRedirects: 0, allowedHosts: [INDEX_HOST], accept: "application/json" });
  safeResponse(response);
  let rows: unknown;
  try { rows = JSON.parse(response.body); } catch { return fail("invalid_index_response"); }
  if (!Array.isArray(rows) || rows.length > 500) return fail("invalid_index_response");
  // Construct our own endpoint. Never follow remote cdx-api or archive URLs.
  return [...new Set(rows.flatMap(row => row && typeof row.id === "string" && collectionPattern.test(row.id) ? [row.id as string] : []))].sort().reverse().slice(0, 5);
}

import { parse as parseDomain } from "tldts";
import { brandLookupInputSchema, brandLookupResultSchema, BRAND_LOOKUP_SCHEMA_VERSION,
  type BrandLookupInput, type BrandLookupResult, type BrandLookupProfile } from "../../shared/brand-lookup.js";
import { AccountAccessError } from "./account-error.js";
import { reserveBrandLookup } from "./brand-lookup-budget.js";

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "SajdaBrandLookup/1.0 (mailto:dev@hypbit.com)";
const QID = /^Q[1-9][0-9]{0,11}$/u;
const MAX_BYTES = 1_048_576;
type Lease = { release: () => Promise<void>; backoff: (seconds: number) => Promise<void> };
export interface BrandLookupDependencies {
  fetch?: typeof fetch; now?: () => number; reserve?: (requestUnits?: number) => Promise<Lease>; timeoutMs?: number;
}
const unavailable = () => new AccountAccessError("lookup_unavailable", 503, "The public source is unavailable. Try again later.");
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
const sourceUrl = (id: string) => `https://www.wikidata.org/wiki/${id}`;
const source = { name: "Wikidata", kind: "community_knowledge_graph", license: "CC0-1.0", url: "https://www.wikidata.org" } as const;

/** A brand lookup must not become a directory of people's websites/socials.
 * Wikidata P31 identifies the entity type; Q5 is human. Missing or malformed
 * classification is not evidence that a record is safe to display. This is a
 * source-data safeguard, not independent verification of the entity's identity. */
function hasNonHumanType(entity: Record<string, unknown>): boolean {
  if (!record(entity.claims) || !Array.isArray(entity.claims.P31)
    || !entity.claims.P31.length || entity.claims.P31.length > 100) return false;
  let currentType = false;
  for (const claim of entity.claims.P31) {
    if (!record(claim) || !["normal", "preferred", "deprecated"].includes(String(claim.rank))
      || !record(claim.mainsnak) || claim.mainsnak.property !== "P31" || claim.mainsnak.snaktype !== "value"
      || !record(claim.mainsnak.datavalue) || !record(claim.mainsnak.datavalue.value)) return false;
    const type = claim.mainsnak.datavalue.value;
    if (type["entity-type"] !== "item" || typeof type.id !== "string" || !QID.test(type.id) || type.id === "Q5") return false;
    if (claim.rank !== "deprecated") currentType = true;
  }
  return currentType;
}

/** Never follows, probes or downloads a URL supplied by the knowledge graph. */
function websiteLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    const domain = parseDomain(url.hostname, { allowPrivateDomains: false });
    if (url.protocol !== "https:" || url.username || url.password || url.port || !domain.isIcann || domain.isIp || !domain.domain) return null;
    return url.toString();
  } catch { return null; }
}
function socialLink(property: string, value: string) {
  if (property === "P2002" && /^[A-Za-z0-9_]{1,15}$/u.test(value)) return `https://x.com/${value}`;
  if (property === "P2003" && /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/u.test(value)) return `https://www.instagram.com/${value}/`;
  // P4264 can identify a company, school or showcase. Do not guess a URL type.
  return null;
}
async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")
    || Number(response.headers.get("content-length") || 0) > MAX_BYTES || !response.body) throw unavailable();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel().catch(() => undefined); throw unavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
}
function retrySeconds(header: string | null, now: number) {
  if (!header) return 60;
  if (/^\d+$/u.test(header)) {
    const seconds = Number(header);
    // An overflowing provider duration must not become a short default retry.
    return Number.isFinite(seconds) ? Math.max(5, seconds) : Number.MAX_VALUE;
  }
  const seconds = Math.ceil((Date.parse(header) - now) / 1000);
  return Number.isFinite(seconds) ? Math.max(5, seconds) : 60;
}
function localized(row: unknown, locale: string, max: number): string | null {
  if (!record(row)) return null;
  for (const language of [locale, "en"]) {
    const item = row[language];
    if (record(item)) { const value = text(item.value, max); if (value) return value; }
  }
  return null;
}
function inactiveOrUncertainDate(qualifiers: Record<string, unknown>, now: number) {
  // Any ending qualifier needs contextual review. It must not appear as current.
  if (qualifiers.P582 !== undefined) return true;
  if (qualifiers.P580 === undefined) return false;
  if (!Array.isArray(qualifiers.P580) || !qualifiers.P580.length) return true;
  return qualifiers.P580.some(snak => {
    if (!record(snak) || !record(snak.datavalue) || !record(snak.datavalue.value)) return true;
    const value = snak.datavalue.value;
    if (typeof value.time !== "string" || typeof value.precision !== "number" || value.precision < 11
      || value.calendarmodel !== "http://www.wikidata.org/entity/Q1985727") return true;
    const time = Date.parse(value.time.replace(/^\+/u, ""));
    return !Number.isFinite(time) || time > now;
  });
}

function profileResult(input: Extract<BrandLookupInput, { operation: "profile" }>, body: Record<string, unknown>, now: number): BrandLookupProfile {
  if (!record(body.entities)) throw unavailable();
  let canonicalId = input.entity_id;
  if (body.redirects !== undefined && !Array.isArray(body.redirects)) throw unavailable();
  if (Array.isArray(body.redirects)) {
    const visited = new Set([canonicalId]);
    for (let step = 0; step < 5; step++) {
      const redirects = body.redirects.filter(row => record(row) && row.from === canonicalId);
      if (redirects.length > 1) throw unavailable();
      const redirect = redirects[0];
      if (!record(redirect)) break;
      if (typeof redirect.to !== "string" || !QID.test(redirect.to) || visited.has(redirect.to)) throw unavailable();
      canonicalId = redirect.to;
      visited.add(canonicalId);
    }
    if (body.redirects.some(row => record(row) && row.from === canonicalId)) throw unavailable();
  }
  const entity = body.entities[canonicalId];
  if (!record(entity)) throw unavailable();
  if (entity.missing !== undefined) throw new AccountAccessError("profile_not_found", 404, "This source record is no longer available. Search again.");
  if (entity.id !== canonicalId || entity.type !== "item" || !record(entity.claims)) throw unavailable();
  if (!hasNonHumanType(entity)) throw new AccountAccessError("profile_not_found", 404, "This record is outside brand lookup coverage. Search for a company or brand.");
  const assertions: BrandLookupProfile["assertions"] = [];
  const seen = new Set<string>(); let skipped = false;
  for (const property of ["P856", "P2002", "P2003", "P4264"] as const) {
    const claims = entity.claims[property];
    if (claims === undefined) continue;
    if (!Array.isArray(claims)) throw unavailable();
    for (const claim of claims) {
      if (!record(claim) || !["normal", "preferred"].includes(String(claim.rank)) || !record(claim.mainsnak)
        || claim.mainsnak.snaktype !== "value" || claim.mainsnak.property !== property || !record(claim.mainsnak.datavalue)) { skipped = true; continue; }
      const value = text(claim.mainsnak.datavalue.value, 1000);
      const statementId = text(claim.id, 200);
      if (!value || !statementId || !statementId.startsWith(`${canonicalId}$`)) { skipped = true; continue; }
      if (claim.qualifiers !== undefined && (!record(claim.qualifiers)
        || Object.entries(claim.qualifiers).some(([key, values]) => !/^P[1-9][0-9]*$/u.test(key)
          || !Array.isArray(values) || !values.length || values.some(value => !record(value))))) { skipped = true; continue; }
      const qualifiers = record(claim.qualifiers) ? claim.qualifiers : {};
      if (inactiveOrUncertainDate(qualifiers, now)) { skipped = true; continue; }
      const key = `${property}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (assertions.length === 20) { skipped = true; continue; }
      assertions.push({ statement_id: statementId, property_id: property, kind: property === "P856" ? "website" : "social",
        platform: property === "P856" ? null : property === "P2002" ? "x" : property === "P2003" ? "instagram" : "linkedin",
        value, url: property === "P856" ? websiteLink(value) : socialLink(property, value),
        classification: "DATABASE_ASSERTION", relationship: "not_verified", rank: claim.rank as "normal" | "preferred",
        has_qualifiers: Object.keys(qualifiers).length > 0, temporal_status: "not_established", source_url: `${sourceUrl(canonicalId)}#${property}` });
    }
  }
  const modified = typeof entity.modified === "string" && Number.isFinite(Date.parse(entity.modified)) ? new Date(entity.modified).toISOString() : null;
  return { schema_version: BRAND_LOOKUP_SCHEMA_VERSION, operation: "profile", locale: input.locale, retrieved_at: new Date(now).toISOString(),
    source, coverage: "wikidata_only", requested_entity_id: input.entity_id,
    entity: { entity_id: canonicalId, name: localized(entity.labels, input.locale, 300) ?? canonicalId,
      description: localized(entity.descriptions, input.locale, 1000), source_url: sourceUrl(canonicalId),
      revision_id: Number.isSafeInteger(entity.lastrevid) && Number(entity.lastrevid) > 0 ? Number(entity.lastrevid) : null, source_modified_at: modified },
    assertions, truncated: skipped,
    index: { score: null, status: "insufficient_verified_evidence", verified_assertions: 0 },
    limitations: ["single_source", "ownership_not_verified", "availability_not_checked", "not_legal_clearance", "no_global_coverage"] };
}

/** Bounded, read-only knowledge-graph lookup; no account DB, AI, ownership inference or arbitrary-URL fetching.
 * Cache timestamps describe the original retrieval, never a cache hit or real-world verification. */
export function createBrandLookupExecutor(deps: BrandLookupDependencies = {}) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { expires: number; result: BrandLookupResult }>();
  const inFlight = new Map<string, Promise<BrandLookupResult>>();
  async function request(input: BrandLookupInput): Promise<BrandLookupResult> {
    // Charge both possible search calls upfront, including failed/empty searches.
    const lease = await (deps.reserve ?? reserveBrandLookup)(input.operation === "search" ? 2 : 1);
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const parameters = new URLSearchParams({ format: "json", maxlag: "5" });
          if (input.operation === "search") {
            Object.entries({ action: "wbsearchentities", search: input.query, language: input.locale, uselang: input.locale, type: "item", limit: "5" })
              .forEach(([key, value]) => parameters.set(key, value));
          } else {
            Object.entries({ action: "wbgetentities", ids: input.entity_id, props: "info|labels|descriptions|claims", languages: [...new Set([input.locale, "en"])].join("|"), redirects: "yes" })
              .forEach(([key, value]) => parameters.set(key, value));
          }
          // At most two bounded requests in a search, one in a profile. Both
          // share the original deadline, admission lease and provider cooldown.
          async function fetchSource(parameters: URLSearchParams): Promise<Record<string, unknown>> {
            if (controller.signal.aborted) throw unavailable();
            const url = `${API}?${parameters}`;
            const response = await (deps.fetch ?? fetch)(url, { method: "GET", redirect: "manual", signal: controller.signal,
              headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
            if ([429, 503].includes(response.status)) {
              await lease.backoff(retrySeconds(response.headers.get("retry-after"), now()));
              throw unavailable();
            }
            if (response.status !== 200 || response.redirected || response.url && response.url !== url) throw unavailable();
            const body = await readJson(response);
            if (!record(body) || body.error !== undefined || body.success !== 1) {
              if (record(body) && record(body.error) && ["maxlag", "ratelimited"].includes(String(body.error.code))) await lease.backoff(retrySeconds(response.headers.get("retry-after"), now()));
              throw unavailable();
            }
            return body;
          }
          const body = await fetchSource(parameters);
          if (input.operation === "profile") return profileResult(input, body, now());
          if (body.searchinfo !== undefined && (!record(body.searchinfo) || body.searchinfo.search !== input.query)) throw unavailable();
          if (!Array.isArray(body.search) || body.search.length > 5) throw unavailable();
          let candidates = body.search.map(row => {
            if (!record(row) || typeof row.id !== "string" || !QID.test(row.id) || !text(row.label, 300)
              || row.description !== undefined && row.description !== null && typeof row.description !== "string") throw unavailable();
            return { entity_id: row.id, name: row.label as string, description: text(row.description, 1000), source_url: sourceUrl(row.id) };
          });
          if (new Set(candidates.map(candidate => candidate.entity_id)).size !== candidates.length) throw unavailable();
          if (candidates.length) {
            const types = await fetchSource(new URLSearchParams({ format: "json", maxlag: "5", action: "wbgetentities",
              ids: candidates.map(candidate => candidate.entity_id).join("|"), props: "claims" }));
            if (!record(types.entities) || types.redirects !== undefined) throw unavailable();
            const entities = types.entities;
            candidates = candidates.filter(candidate => {
              const entity = entities[candidate.entity_id];
              if (!record(entity) || entity.missing !== undefined) return false;
              if (entity.id !== candidate.entity_id || entity.type !== "item") throw unavailable();
              return hasNonHumanType(entity);
            });
          }
          return { schema_version: BRAND_LOOKUP_SCHEMA_VERSION, operation: "search", query: input.query, locale: input.locale,
            retrieved_at: new Date(now()).toISOString(), source, coverage: "wikidata_only",
            status: candidates.length ? "matches" : "no_matches", candidates, has_more: typeof body["search-continue"] === "number", verified_index: null } as BrandLookupResult;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, deps.timeoutMs ?? 8_000); }),
      ]);
    } catch (error) {
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { if (timer) clearTimeout(timer); controller.abort(); await lease.release(); }
  }
  return async (value: unknown): Promise<BrandLookupResult> => {
    const parsed = brandLookupInputSchema.safeParse(value);
    if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Enter a name or choose a valid source record.");
    const input = parsed.data, key = JSON.stringify(input);
    for (const [cachedKey, entry] of cache) if (entry.expires <= now()) cache.delete(cachedKey);
    const cached = cache.get(key);
    if (cached) return structuredClone(cached.result);
    let pending = inFlight.get(key);
    if (!pending) {
      if (inFlight.size >= 3) throw new AccountAccessError("rate_limited", 429, "Another lookup is running. Try again shortly.");
      pending = request(input).then(value => {
        const validated = brandLookupResultSchema.safeParse(value);
        if (!validated.success) throw unavailable();
        const result = validated.data;
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, { result, expires: now() + (input.operation === "search" ? 300_000 : 900_000) });
        return result;
      }).finally(() => { inFlight.delete(key); });
      inFlight.set(key, pending);
    }
    return structuredClone(await pending);
  };
}
export const executeBrandLookup = createBrandLookupExecutor();

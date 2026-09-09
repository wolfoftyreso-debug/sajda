import { parse } from "tldts";

/** A bounded public crawl sample, not an ownership, backlink, quality or availability assessment. */
export interface TradingArchiveEvidence {
  source: "common_crawl";
  domain: string;
  status: "observed" | "unknown" | "disabled";
  reason: "crawl_sightings" | "no_sightings" | "disabled" | "invalid_domain" | "rate_limited"
    | "busy" | "timeout" | "aborted" | "unavailable" | "invalid_response";
  checkedAt: string;
  sourceUrl: string | null;
  collection: string | null;
  /** Number of accepted metadata samples, never a total capture count. */
  sampleCount: number | null;
  earliestSampleAt: string | null;
  latestSampleAt: string | null;
  sampleStatuses: number[];
  /** Absence of a sample is unknown, never evidence that a domain did not exist. */
  priorExistence: true | null;
  sampleLimit: 5;
  collectionLimit: 1;
}

export const ARCHIVE_COLLECTION_PATTERN = /^CC-MAIN-20\d{2}-(?:0[1-9]|[1-4]\d|5[0-3])$/u;
const reasons = ["crawl_sightings", "no_sightings", "disabled", "invalid_domain", "rate_limited",
  "busy", "timeout", "aborted", "unavailable", "invalid_response"];
const fields = new Set(["source", "domain", "status", "reason", "checkedAt", "sourceUrl", "collection", "sampleCount",
  "earliestSampleAt", "latestSampleAt", "sampleStatuses", "priorExistence", "sampleLimit", "collectionLimit"]);
const isoDate = (value: unknown): value is string => typeof value === "string" && value.length === 24
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Reject incoherent persisted evidence and links outside the fixed metadata endpoint. */
export function isTradingArchiveEvidence(value: unknown): value is TradingArchiveEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !fields.has(key)) || row.source !== "common_crawl" || typeof row.domain !== "string" || row.domain.length > 253
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(row.domain)
    || row.domain.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))
    || !["observed", "unknown", "disabled"].includes(String(row.status)) || !reasons.includes(String(row.reason))
    || !isoDate(row.checkedAt) || row.sampleLimit !== 5 || row.collectionLimit !== 1
    || !Array.isArray(row.sampleStatuses) || row.sampleStatuses.length > 5
    || row.sampleStatuses.some(status => !Number.isInteger(status) || status < 100 || status > 599)) return false;
  const domain = parse(row.domain, { allowPrivateDomains: true });
  if (!domain.isIcann || domain.isPrivate || domain.domain !== row.domain
    || ["example.com", "example.net", "example.org"].includes(row.domain)) return false;
  if (row.collection === null) {
    if (row.sourceUrl !== null) return false;
  } else {
    if (typeof row.collection !== "string" || !ARCHIVE_COLLECTION_PATTERN.test(row.collection) || typeof row.sourceUrl !== "string") return false;
    const expected = new URL(`https://index.commoncrawl.org/${row.collection}-index`);
    expected.search = new URLSearchParams({ url: row.domain, matchType: "host", output: "json", limit: "5", fl: "url,timestamp,status" }).toString();
    if (row.sourceUrl !== expected.href) return false;
  }
  if (row.status === "observed") return row.reason === "crawl_sightings" && row.priorExistence === true
    && row.collection !== null && Number.isInteger(row.sampleCount) && Number(row.sampleCount) >= 1 && Number(row.sampleCount) <= 5
    && row.sampleStatuses.length === row.sampleCount && isoDate(row.earliestSampleAt) && isoDate(row.latestSampleAt)
    && row.earliestSampleAt <= row.latestSampleAt && row.latestSampleAt <= row.checkedAt;
  if (row.priorExistence !== null || row.earliestSampleAt !== null || row.latestSampleAt !== null || row.sampleStatuses.length !== 0) return false;
  if (row.status === "disabled") return row.reason === "disabled" && row.sampleCount === null && row.collection === null;
  if (["crawl_sightings", "disabled"].includes(String(row.reason))) return false;
  return row.reason === "no_sightings" ? row.sampleCount === 0 && row.collection !== null : row.sampleCount === null;
}

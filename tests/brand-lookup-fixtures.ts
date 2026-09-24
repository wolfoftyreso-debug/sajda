import { brandLookupInputSchema, type BrandLookupResult } from "../shared/brand-lookup.js";

/** Deterministic database-shaped fixture, never a live ownership assertion. */
export async function lookupFixture(value: unknown): Promise<BrandLookupResult> {
  const input = brandLookupInputSchema.parse(value);
  const base = { schema_version: "sajda.brand-lookup.v1", locale: input.locale, retrieved_at: "2026-09-13T12:00:00Z",
    source: { name: "Wikidata", kind: "community_knowledge_graph", license: "CC0-1.0", url: "https://www.wikidata.org" },
    coverage: "wikidata_only" } as const;
  if (input.operation === "search") return { ...base, operation: "search", query: input.query, status: "matches",
    candidates: [
      { entity_id: "Q1", name: input.query, description: "First ambiguous database record", source_url: "https://www.wikidata.org/wiki/Q1" },
      { entity_id: "Q2", name: input.query, description: "Second ambiguous database record", source_url: "https://www.wikidata.org/wiki/Q2" },
    ], has_more: false, verified_index: null };
  const id = input.entity_id;
  return { ...base, operation: "profile", requested_entity_id: id,
    entity: { entity_id: id, name: "Example Brand", description: "A database fixture, not live evidence",
      source_url: `https://www.wikidata.org/wiki/${id}`, revision_id: 123, source_modified_at: "2026-09-01T10:00:00Z" },
    assertions: [{ statement_id: `${id}$fixture`, property_id: "P856", kind: "website", platform: null,
      value: "https://example.com/", url: "https://example.com/", classification: "DATABASE_ASSERTION",
      relationship: "not_verified", rank: "normal", has_qualifiers: false, temporal_status: "not_established",
      source_url: `https://www.wikidata.org/wiki/${id}#P856` }], truncated: false,
    index: { score: null, status: "insufficient_verified_evidence", verified_assertions: 0 },
    limitations: ["single_source", "ownership_not_verified", "availability_not_checked", "not_legal_clearance", "no_global_coverage"] };
}

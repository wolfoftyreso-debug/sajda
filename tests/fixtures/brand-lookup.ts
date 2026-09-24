/** Synthetic UI fixtures only: these Q-IDs and claims do not describe real entities. */
import { BRAND_LOOKUP_SCHEMA_VERSION, type BrandLookupSearch, type BrandLookupProfile } from "../../shared/brand-lookup";
const base = { schema_version: BRAND_LOOKUP_SCHEMA_VERSION, retrieved_at: "2026-09-12T12:00:00.000Z", coverage: "wikidata_only" as const,
  source: { name: "Wikidata" as const, kind: "community_knowledge_graph" as const, license: "CC0-1.0" as const, url: "https://www.wikidata.org" as const } };
export function syntheticBrandMatches(query = "ExampleBrand", locale: BrandLookupSearch["locale"] = "en", empty = false): BrandLookupSearch {
  return { ...base, operation: "search", locale, query, status: empty ? "no_matches" : "matches", has_more: !empty, verified_index: null,
    candidates: empty ? [] : Array.from({ length: 5 }, (_, index) => ({ entity_id: `Q${901 + index}`, name: `${query} · synthetic organization ${index + 1}`,
      description: "Synthetic test record, not a real organization or identity assertion.", source_url: `https://www.wikidata.org/wiki/Q${901 + index}` })) };
}
export function syntheticBrandProfile(entityId = "Q901", locale: BrandLookupProfile["locale"] = "en", empty = false): BrandLookupProfile {
  const common = { classification: "DATABASE_ASSERTION" as const, relationship: "not_verified" as const, rank: "normal" as const,
    has_qualifiers: false, temporal_status: "not_established" as const };
  return { ...base, operation: "profile", locale, requested_entity_id: entityId, entity: { entity_id: entityId, name: "ExampleBrand · selected synthetic organization",
    description: "Synthetic test profile. No ownership, availability or legal clearance is asserted.", source_url: `https://www.wikidata.org/wiki/${entityId}`,
    revision_id: 123, source_modified_at: "2022-01-02T12:00:00.000Z" },
    assertions: empty ? [] : [
      { ...common, statement_id: `${entityId}$synthetic-web`, property_id: "P856", kind: "website", platform: null, value: "https://example.com/", url: "https://example.com/", source_url: `https://www.wikidata.org/wiki/${entityId}#P856` },
      { ...common, statement_id: `${entityId}$synthetic-social`, property_id: "P2002", kind: "social", platform: "x", value: "synthetic_example_brand", url: "https://x.com/synthetic_example_brand", source_url: `https://www.wikidata.org/wiki/${entityId}#P2002`, has_qualifiers: true },
    ], truncated: false, index: { score: null, status: "insufficient_verified_evidence", verified_assertions: 0 },
    limitations: ["single_source", "ownership_not_verified", "availability_not_checked", "not_legal_clearance", "no_global_coverage"] };
}

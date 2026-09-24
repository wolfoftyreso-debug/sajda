import { z } from "zod/v4";

export const BRAND_LOOKUP_SCHEMA_VERSION = "sajda.brand-lookup.v1" as const;
export const brandLookupLocaleSchema = z.enum(["en", "sv", "es", "fr", "zh"]);
const entityId = z.string().regex(/^Q[1-9][0-9]{0,11}$/u);
const timestamp = z.iso.datetime().refine(value => Number.isFinite(Date.parse(value)));
function hasControlCharacters(value: string) {
  return [...value].some(char => { const code = char.codePointAt(0)!; return code < 32 || code >= 127 && code <= 159; });
}
const query = z.string().trim().normalize("NFC").min(1).max(100).refine(value => !hasControlCharacters(value));
export const brandLookupInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), query, locale: brandLookupLocaleSchema.default("en") }).strict(),
  z.object({ operation: z.literal("profile"), entity_id: entityId, locale: brandLookupLocaleSchema.default("en") }).strict(),
]);
export type BrandLookupInput = z.infer<typeof brandLookupInputSchema>;

const source = z.object({ name: z.literal("Wikidata"), kind: z.literal("community_knowledge_graph"),
  license: z.literal("CC0-1.0"), url: z.literal("https://www.wikidata.org") }).strict();
const sourceUrl = z.string().regex(/^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9][0-9]{0,11}(?:#P(?:856|2002|2003|4264))?$/u);
const candidate = z.object({ entity_id: entityId, name: z.string().min(1).max(300),
  description: z.string().max(1000).nullable(), source_url: sourceUrl }).strict();
const assertion = z.object({ statement_id: z.string().min(1).max(200),
  property_id: z.enum(["P856", "P2002", "P2003", "P4264"]),
  kind: z.enum(["website", "social"]), platform: z.enum(["x", "instagram", "linkedin"]).nullable(),
  value: z.string().min(1).max(1000), url: z.url().max(2000).nullable(),
  classification: z.literal("DATABASE_ASSERTION"), relationship: z.literal("not_verified"),
  rank: z.enum(["normal", "preferred"]), has_qualifiers: z.boolean(),
  temporal_status: z.literal("not_established"), source_url: sourceUrl }).strict();
const base = { schema_version: z.literal(BRAND_LOOKUP_SCHEMA_VERSION), locale: brandLookupLocaleSchema,
  retrieved_at: timestamp, source, coverage: z.literal("wikidata_only") };
export const brandLookupResultSchema = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("search"), query,
    status: z.enum(["matches", "no_matches"]), candidates: z.array(candidate).max(5), has_more: z.boolean(),
    verified_index: z.null() }).strict(),
  z.object({ ...base, operation: z.literal("profile"), requested_entity_id: entityId,
    entity: candidate.extend({ revision_id: z.number().int().positive().nullable(), source_modified_at: timestamp.nullable() }).strict(),
    assertions: z.array(assertion).max(20), truncated: z.boolean(),
    index: z.object({ score: z.null(), status: z.literal("insufficient_verified_evidence"), verified_assertions: z.literal(0) }).strict(),
    limitations: z.array(z.enum(["single_source", "ownership_not_verified", "availability_not_checked", "not_legal_clearance", "no_global_coverage"])).length(5),
  }).strict(),
]);
export type BrandLookupResult = z.infer<typeof brandLookupResultSchema>;
export type BrandLookupSearch = Extract<BrandLookupResult, { operation: "search" }>;
export type BrandLookupProfile = Extract<BrandLookupResult, { operation: "profile" }>;

import { z } from "zod/v4";
import { assessBrandPresence, brandIndexInputSchema, brandIndexResultSchema } from "../../shared/brand-presence-index.js";
import { AccountAccessError } from "./account-error.js";

const invalidInput = () => new AccountAccessError("invalid_request", 400,
  "Use the published brand-index schema with an existing brand identity, supported targets and user-reported observations. Do not supply verification claims.");

/** JSON Schema cannot express cross-field target scope or normalized uniqueness.
 * Runtime validation remains authoritative; discovery describes these constraints. */
export function brandIndexRequestJsonSchema() {
  const schema = z.toJSONSchema(brandIndexInputSchema, { io: "input" });
  for (const key of ["domains", "socials", "markets", "observations"]) {
    const property = schema.properties?.[key];
    if (property && typeof property === "object") property.uniqueItems = true;
  }
  schema.description = "Strict user-supplied scope. Domains must be unique after normalization and include primary_domain; declare at most one handle per platform. Markets must be unique supported country codes. Observations must have unique target_id values that exactly match a declared domain:<domain>, social:<platform>:<handle>, or market:<ISO> target. No caller verification or provenance flags are accepted.";
  return schema;
}

/** No HTTP authority or provider connector enters this calculator boundary. */
export function parseBrandIndexRequest(value: unknown): z.infer<typeof brandIndexInputSchema> {
  const parsed = brandIndexInputSchema.safeParse(value);
  if (!parsed.success) throw invalidInput();
  return parsed.data;
}

export function executeBrandIndexAssessment(value: unknown, now?: number): z.infer<typeof brandIndexResultSchema> {
  const input = parseBrandIndexRequest(value);
  try { return brandIndexResultSchema.parse(assessBrandPresence(input, now)); }
  catch {
    throw new AccountAccessError("assessment_unavailable", 503, "The brand self-assessment could not be calculated.");
  }
}

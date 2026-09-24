import { z } from "zod/v4";
import { brandLookupInputSchema, brandLookupResultSchema, type BrandLookupInput, type BrandLookupResult } from "../../shared/brand-lookup.js";
import { AccountAccessError } from "./account-error.js";

export function parseBrandLookupRequest(value: unknown): BrandLookupInput {
  const parsed = brandLookupInputSchema.safeParse(value);
  if (!parsed.success) throw new AccountAccessError("invalid_request", 400,
    "Use operation search with a name query, or operation profile with a selected Wikidata entity_id. Do not mix branches or supply credentials, URLs or verification claims.");
  return parsed.data;
}

/** MCP requires an object root. Preserve the complete strict discriminated
 * union underneath it, without forbidding the permitted branch properties. */
export function brandLookupRequestJsonSchema() {
  const branches = brandLookupInputSchema.options.map(schema => z.toJSONSchema(schema, { io: "input" }));
  const properties = Object.assign({}, ...branches.map(branch => branch.properties));
  properties.operation = { type: "string", enum: ["search", "profile"] };
  return { type: "object" as const, additionalProperties: false, properties, required: ["operation"], anyOf: branches };
}

/** No HTTP headers or caller-controlled fetch options cross this boundary. */
export async function executeBrandLookupRequest(value: unknown,
  execute: (input: BrandLookupInput) => Promise<unknown>): Promise<BrandLookupResult> {
  const input = parseBrandLookupRequest(value);
  try {
    const result = brandLookupResultSchema.parse(await execute(input));
    if (result.operation !== input.operation || result.locale !== input.locale
      || result.operation === "search" && input.operation === "search" && result.query !== input.query
      || result.operation === "profile" && input.operation === "profile" && result.requested_entity_id !== input.entity_id) {
      throw new Error("Invalid lookup response scope.");
    }
    return result;
  }
  catch (error) {
    const known = error instanceof AccountAccessError ? error.code : "lookup_unavailable";
    const errors = {
      invalid_request: [400, "Use the published brand-lookup request schema."],
      profile_not_found: [404, "The selected database profile could not be found."],
      rate_limited: [429, "The public lookup source limit has been reached. Wait before retrying."],
      lookup_unavailable: [503, "The brand lookup could not be completed. Try again later."],
    } as const;
    const code = Object.hasOwn(errors, known) ? known as keyof typeof errors : "lookup_unavailable";
    const [status, message] = errors[code];
    const safe = new AccountAccessError(code, status, message);
    const retry = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : NaN;
    if (status === 429 && Number.isFinite(retry) && retry > 0) Object.assign(safe, { retryAfterSeconds: Math.ceil(retry) });
    throw safe;
  }
}

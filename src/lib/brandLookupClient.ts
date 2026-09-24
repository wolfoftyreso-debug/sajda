import { brandLookupInputSchema, brandLookupResultSchema, type BrandLookupInput, type BrandLookupResult } from "../../shared/brand-lookup";

export function brandLookupEndpoint(native: boolean, configuredOrigin?: string): string {
  const path = "/api/v1/public/brand-lookup";
  if (!native) return path;
  if (!configuredOrigin?.trim()) throw new Error("brand_lookup_unavailable");
  const origin = new URL(configuredOrigin.trim());
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("brand_lookup_unavailable");
  return `${origin.origin}${path}`;
}

/** Anonymous public-data request. No account transport, URL query, persistence or logging. */
export async function lookupBrand(input: BrandLookupInput, options: { signal: AbortSignal; native?: boolean; origin?: string }): Promise<BrandLookupResult> {
  const request = brandLookupInputSchema.parse(input);
  const response = await fetch(brandLookupEndpoint(options.native ?? false, options.origin), {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(request), signal: options.signal,
  });
  if (!response.ok) throw new Error("brand_lookup_unavailable");
  const result = brandLookupResultSchema.parse(await response.json());
  if (result.operation !== request.operation || result.locale !== request.locale
    || request.operation === "search" && (result.operation !== "search" || result.query !== request.query
      || result.status === "no_matches" && result.candidates.length !== 0 || result.status === "matches" && result.candidates.length === 0)
    || request.operation === "profile" && (result.operation !== "profile" || result.requested_entity_id !== request.entity_id)) throw new Error("brand_lookup_unavailable");
  return result;
}

/** Links are user-opened, never fetched. Source assertions cannot create executable links. */
export function safeBrandLookupLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

import { consumeRateLimit, requireIdentity } from "../_shared/auth.ts";
import { ALGORITHM_VERSION, valueDomain } from "../_shared/domain-engine.ts";
import { corsHeaders, json, readJson, rejectDisallowedOrigin } from "../_shared/http.ts";

interface DomainToValue {
  domain?: unknown;
  registrarPrice?: unknown;
  registrationPriceEstimate?: unknown;
}

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind === "user" && !await consumeRateLimit(authentication.identity.user.id, "value-domains", 20, 60)) {
    return json(request, { error: "Rate limit exceeded. Try again in a minute." }, 429);
  }

  try {
    const body = await readJson(request);
    if (!Array.isArray(body.domains) || body.domains.length === 0) {
      return json(request, { error: "domains must be a non-empty array" }, 400);
    }
    if (body.domains.length > 50) return json(request, { error: "At most 50 domains may be valued per request" }, 400);

    const valuations = (body.domains as DomainToValue[])
      .map((item) => valueDomain(item?.domain, item?.registrationPriceEstimate ?? item?.registrarPrice))
      .filter((valuation): valuation is NonNullable<typeof valuation> => valuation !== null);

    return json(request, {
      valuations,
      algorithmVersion: ALGORITHM_VERSION,
      engine: "deterministic-local",
      modelsUsed: 0,
      disclaimer: "Screening estimates are not appraisals, comparable-sales data, or purchase advice.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return json(request, { error: message }, 400);
  }
});

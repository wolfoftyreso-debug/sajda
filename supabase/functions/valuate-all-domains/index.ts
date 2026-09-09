import { getServiceClient, requireIdentity } from "../_shared/auth.ts";
import { valueDomain } from "../_shared/domain-engine.ts";
import { corsHeaders, json, readJson, rejectDisallowedOrigin } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind !== "job") return json(request, { error: "Internal job authentication is required" }, 403);

  try {
    const body = await readJson(request);
    const limitValue = typeof body.limit === "number" ? body.limit : Number(body.limit);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.trunc(limitValue), 50)) : 50;
    const supabase = getServiceClient();

    const { data: domains, error: domainsError } = await supabase
      .from("user_domains")
      .select("id, domain, purchase_price")
      .order("valued_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (domainsError) throw new Error("Could not load domains for valuation");

    let updated = 0;
    for (const domain of domains ?? []) {
      const valuation = valueDomain(domain.domain, domain.purchase_price);
      if (!valuation) continue;

      const { error: updateError } = await supabase
        .from("user_domains")
        .update({
          estimated_value: valuation.estimatedValue,
          confidence_score: valuation.confidenceScore,
          valuation_rationale: valuation.rationale,
          valuation_algorithm_version: valuation.algorithmVersion,
          valuation_signals: valuation.signals,
          valued_at: new Date().toISOString(),
        })
        .eq("id", domain.id);
      if (updateError) console.warn(`Could not value ${domain.id}`, updateError.message);
      else updated += 1;
    }

    return json(request, { success: true, processed: domains?.length ?? 0, updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    console.error("valuate-all-domains failed", error);
    return json(request, { error: message }, 500);
  }
});

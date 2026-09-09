import { consumeRateLimit, requireIdentity } from "../_shared/auth.ts";
import {
  ALGORITHM_VERSION,
  clampCandidateCount,
  generateDomainCandidates,
  normalizeTlds,
} from "../_shared/domain-engine.ts";
import { corsHeaders, json, readJson, rejectDisallowedOrigin } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind === "user" && !await consumeRateLimit(authentication.identity.user.id, "generate-domains", 15, 60)) {
    return json(request, { error: "Rate limit exceeded. Try again in a minute." }, 429);
  }

  try {
    const body = await readJson(request);
    const tlds = normalizeTlds(body.tlds);
    if (tlds.length === 0) return json(request, { error: "At least one valid TLD is required" }, 400);

    const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 160) : undefined;
    const iteration = typeof body.iteration === "number" && Number.isFinite(body.iteration)
      ? Math.max(1, Math.min(Math.trunc(body.iteration), 100_000))
      : 1;
    const domains = generateDomainCandidates({
      tlds,
      count: clampCandidateCount(body.count, 40),
      theme,
      iteration,
    });

    return json(request, {
      domains,
      totalGenerated: domains.length,
      algorithmVersion: ALGORITHM_VERSION,
      generator: "deterministic-local",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return json(request, { error: message }, 400);
  }
});

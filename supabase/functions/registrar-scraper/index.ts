import { requireIdentity } from "../_shared/auth.ts";
import { corsHeaders, json, rejectDisallowedOrigin } from "../_shared/http.ts";

/**
 * The legacy implementation did not use a registrar API; it generated domains,
 * called public endpoints, and labelled a heuristic as a registrar price. That
 * is unsafe to run in production and can violate registrar terms of service.
 *
 * Keep this explicit endpoint so legacy schedulers receive a clear response,
 * but do not enable it until a registrar-specific, contracted API adapter is
 * configured (authentication, quote source, rate limit, and terms reviewed).
 */
Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind !== "job") return json(request, { error: "Internal job authentication is required" }, 403);

  return json(request, {
    error: "Registrar scanning is disabled until an approved registrar API adapter is configured.",
    code: "REGISTRAR_ADAPTER_NOT_CONFIGURED",
  }, 501);
});

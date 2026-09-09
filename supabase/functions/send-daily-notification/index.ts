import { getServiceClient, requireIdentity } from "../_shared/auth.ts";
import { corsHeaders, json, rejectDisallowedOrigin } from "../_shared/http.ts";

function stockholmDate(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind !== "job") return json(request, { error: "Internal job authentication is required" }, 403);

  try {
    const date = stockholmDate();
    const { data: topDomains, error } = await getServiceClient()
      .from("daily_top_domains")
      .select("domain, estimated_value, confidence_score, rank")
      .eq("scan_date", date)
      .order("rank", { ascending: true })
      .limit(10);
    if (error) throw new Error("Could not load today’s top domains");

    // This endpoint intentionally does not pretend to deliver a push message.
    // Add a dedicated, audited SMTP or VAPID adapter before enabling delivery.
    console.info("Daily domain summary", { date, count: topDomains?.length ?? 0, topDomains });
    return json(request, {
      success: true,
      date,
      summaryLogged: true,
      delivery: "not_configured",
      count: topDomains?.length ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily summary failed";
    console.error("send-daily-notification failed", error);
    return json(request, { error: message }, 500);
  }
});

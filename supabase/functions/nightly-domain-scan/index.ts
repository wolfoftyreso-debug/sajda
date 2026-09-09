import { getJobSecret, getServiceClient, requireIdentity } from "../_shared/auth.ts";
import { generateDomainCandidates, getTld, valueDomain } from "../_shared/domain-engine.ts";
import { corsHeaders, fetchWithTimeout, json, rejectDisallowedOrigin } from "../_shared/http.ts";

interface AvailabilityResult {
  domain: string;
  tld: string;
  status: "available" | "taken" | "unknown";
  registrationPriceEstimate: number | null;
}

function stockholmDate(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function checkAvailability(domains: string[]): Promise<AvailabilityResult[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/check-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-job-secret": getJobSecret() },
    body: JSON.stringify({ domains }),
  }, 45_000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload?.results)) throw new Error("Availability check failed");
  return payload.results as AvailabilityResult[];
}

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind !== "job") return json(request, { error: "Internal job authentication is required" }, 403);

  const supabase = getServiceClient();
  const date = stockholmDate();
  // A stable UTC marker makes the idempotency key DST-safe while `date` keeps
  // the user-facing business day in Europe/Stockholm.
  const scheduledFor = `${date}T12:00:00Z`;

  try {
    const { error: lockError } = await supabase.from("job_runs").insert({
      job_name: "nightly-domain-scan",
      scheduled_for: scheduledFor,
      details: { timeZone: "Europe/Stockholm" },
    });
    if (lockError?.code === "23505") return json(request, { success: true, skipped: true, reason: "already_run" });
    if (lockError) throw new Error("Could not acquire nightly scan lock");

    const candidates = generateDomainCandidates({
      tlds: ["com"],
      count: 25,
      theme: "business software creative health sustainable",
      iteration: Number(date.replaceAll("-", "")),
    });
    const availability = await checkAvailability(candidates);
    const topDomains = availability
      .filter((result) => result.status === "available" && result.registrationPriceEstimate !== null)
      .map((result) => ({
        result,
        valuation: valueDomain(result.domain, result.registrationPriceEstimate),
      }))
      .filter((item): item is { result: AvailabilityResult; valuation: NonNullable<typeof item.valuation> } => item.valuation !== null)
      .sort((left, right) => right.valuation.estimatedValue - left.valuation.estimatedValue)
      .slice(0, 10);

    const { error: deleteError } = await supabase.from("daily_top_domains").delete().eq("scan_date", date);
    if (deleteError) throw new Error("Could not replace today’s top domains");

    if (topDomains.length > 0) {
      const { error: insertError } = await supabase.from("daily_top_domains").insert(
        topDomains.map(({ result, valuation }, index) => ({
          domain: result.domain,
          tld: getTld(result.domain),
          estimated_value: valuation.estimatedValue,
          confidence_score: valuation.confidenceScore,
          rationale: valuation.rationale,
          registrar_price: result.registrationPriceEstimate,
          scan_date: date,
          rank: index + 1,
        })),
      );
      if (insertError) throw new Error("Could not save today’s top domains");
    }

    await supabase.from("job_runs")
      .update({ status: "completed", completed_at: new Date().toISOString(), details: { scanned: candidates.length, available: topDomains.length } })
      .eq("job_name", "nightly-domain-scan")
      .eq("scheduled_for", scheduledFor);

    return json(request, { success: true, scanned: candidates.length, availableFound: topDomains.length, date });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nightly scan failed";
    console.error("nightly-domain-scan failed", error);
    await supabase.from("job_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: message })
      .eq("job_name", "nightly-domain-scan")
      .eq("scheduled_for", scheduledFor);
    return json(request, { error: message }, 500);
  }
});

import { consumeRateLimit, getJobSecret, getServiceClient, requireIdentity } from "../_shared/auth.ts";
import { ALGORITHM_VERSION, arrayFromEnvelope, generateDomainCandidates, getTld, normalizeTlds } from "../_shared/domain-engine.ts";
import { corsHeaders, fetchWithTimeout, json, readJson, rejectDisallowedOrigin } from "../_shared/http.ts";

type ScanMode = "light" | "medium" | "heavy" | "deep";

const CANDIDATE_LIMITS: Record<ScanMode, number> = {
  // Keep every invocation comfortably below the default self-hosted Edge
  // Runtime timeout. Larger scans should be started as separate scan records.
  light: 12,
  medium: 20,
  heavy: 24,
  deep: 25,
};

interface AvailabilityResult {
  domain: string;
  tld: string;
  status: "available" | "taken" | "unknown" | "invalid";
  available: boolean;
  checkMethod: "rdap" | "none";
  registrarPrice: number | null;
  registrationPriceEstimate: number | null;
  priceSource: "heuristic" | null;
  error?: string;
}

interface Valuation {
  domain: string;
  estimatedValue: number;
  confidenceScore: number;
  rationale: string;
  algorithmVersion: string;
  signals: Record<string, unknown>;
}

function isScanMode(value: unknown): value is ScanMode {
  return value === "light" || value === "medium" || value === "heavy" || value === "deep";
}

function registrarUrl(domain: string): string {
  const tld = getTld(domain);
  if (tld === "se" || tld === "nu") return "https://www.loopia.se/domannamn/";
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
}

async function invokeInternal(functionName: string, body: unknown): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-job-secret": getJobSecret(),
    },
    body: JSON.stringify(body),
  }, 45_000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof payload?.error === "string" ? payload.error : `Internal ${functionName} request failed`;
    throw new Error(error);
  }
  return payload as Record<string, unknown>;
}

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind === "user" && !await consumeRateLimit(authentication.identity.user.id, "user-domain-scan", 2, 600)) {
    return json(request, { error: "Scan limit reached. Try again in a few minutes." }, 429);
  }

  let scanId: string | null = null;
  let scanOwnerId: string | null = null;
  try {
    const body = await readJson(request);
    scanId = typeof body.scanId === "string" ? body.scanId : null;
    const dispatchToken = typeof body.dispatchToken === "string" ? body.dispatchToken : null;

    if (!scanId) {
      return json(request, { error: "scanId is required" }, 400);
    }
    if (authentication.identity.kind === "job" && !dispatchToken) {
      return json(request, { error: "dispatchToken is required for worker scans" }, 400);
    }

    const supabase = getServiceClient();
    const startedAt = new Date().toISOString();
    const scanStartPatch: {
      status?: "running";
      total_domains_scanned?: number;
      completed_at?: null;
      execution_started_at: string;
    } = {
      execution_started_at: startedAt,
    };

    // Rows can only enter this path through request_user_scan. A direct user
    // dispatch must atomically advance its own queued direct row; a worker
    // dispatch must present the token returned by the atomic service-role
    // claim. This blocks browser-created queued rows from being run with the
    // service role.
    let scanStartQuery = supabase
      .from("user_scans")
      .update(scanStartPatch)
      .eq("id", scanId)
      .eq("request_origin", "authenticated-rpc")
      .not("dispatch_token", "is", null);

    if (authentication.identity.kind === "user") {
      scanStartPatch.status = "running";
      scanStartPatch.total_domains_scanned = 0;
      scanStartPatch.completed_at = null;
      scanStartQuery = supabase
        .from("user_scans")
        .update(scanStartPatch)
        .eq("id", scanId)
        .eq("user_id", authentication.identity.user.id)
        .eq("request_origin", "authenticated-rpc")
        .eq("execution_mode", "direct-edge")
        .eq("status", "queued")
        .not("dispatch_token", "is", null);
    } else {
      scanStartQuery = scanStartQuery
        .eq("execution_mode", "worker")
        .eq("status", "running")
        .eq("dispatch_token", dispatchToken)
        .is("execution_started_at", null);
    }

    const { data: scan, error: scanError } = await scanStartQuery
      .select("id, user_id, status, selected_tlds, scan_mode, search_keyword")
      .maybeSingle();

    if (scanError) throw new Error("Could not load the scan");
    if (!scan) return json(request, { error: "Scan is not eligible for dispatch" }, 409);
    scanOwnerId = scan.user_id;

    const selectedTlds = normalizeTlds(scan.selected_tlds).slice(0, 4);
    const scanMode: ScanMode = isScanMode(scan.scan_mode) ? scan.scan_mode : "medium";
    const searchKeyword = typeof scan.search_keyword === "string" ? scan.search_keyword.trim().slice(0, 120) : undefined;
    if (selectedTlds.length === 0) return json(request, { error: "Scan has no valid TLDs" }, 400);

    const candidates = generateDomainCandidates({
      tlds: selectedTlds,
      count: CANDIDATE_LIMITS[scanMode],
      theme: searchKeyword,
      iteration: 1,
    });
    if (candidates.length === 0) throw new Error("Could not generate valid candidates");

    const { data: existingResults, error: existingError } = await supabase
      .from("scan_results")
      .select("domain")
      .eq("scan_id", scanId);
    if (existingError) throw new Error("Could not load prior scan results");

    const previouslyChecked = new Set((existingResults ?? []).map((result: { domain: string }) => result.domain.toLowerCase()));
    const pendingCandidates = candidates.filter((domain) => !previouslyChecked.has(domain));

    const availabilityPayload = await invokeInternal("check-domain", { domains: pendingCandidates });
    const availabilityResults = Array.isArray(availabilityPayload.results)
      ? availabilityPayload.results as AvailabilityResult[]
      : [];
    if (availabilityResults.length !== pendingCandidates.length) {
      throw new Error("Availability service returned an incomplete result set");
    }

    const now = new Date().toISOString();
    const { error: progressError } = await supabase
      .from("user_scans")
      .update({ total_domains_scanned: availabilityResults.length })
      .eq("id", scanId)
      .eq("user_id", scanOwnerId)
      .eq("status", "running");
    if (progressError) throw new Error("Could not update scan progress");

    const { data: statusCheck } = await supabase
      .from("user_scans")
      .select("status")
      .eq("id", scanId)
      .eq("user_id", scanOwnerId)
      .maybeSingle();
    if (statusCheck?.status === "cancelled") return json(request, { success: true, cancelled: true });

    const availableCandidates = availabilityResults
      .filter((result) => result.status === "available" && result.registrationPriceEstimate !== null)
      .map((result) => ({
        domain: result.domain,
        tld: result.tld,
        registrationPriceEstimate: result.registrationPriceEstimate,
      }));

    const valuationPayload = availableCandidates.length > 0
      ? await invokeInternal("value-domains", { domains: availableCandidates })
      : { valuations: [] };
    const valuations = arrayFromEnvelope<Valuation>(valuationPayload, "valuations");
    const valuationsByDomain = new Map(valuations.map((valuation) => [valuation.domain, valuation]));

    const rows = availableCandidates.map((candidate) => {
      const valuation = valuationsByDomain.get(candidate.domain);
      return {
        scan_id: scanId,
        domain: candidate.domain,
        tld: candidate.tld,
        registrar_price: candidate.registrationPriceEstimate,
        price_source: "heuristic",
        availability_status: "available",
        checked_at: now,
        registrar_url: registrarUrl(candidate.domain),
        check_method: "rdap",
        estimated_value: valuation?.estimatedValue ?? 0,
        confidence_score: valuation?.confidenceScore ?? 0,
        rationale: valuation?.rationale ?? "Värdering saknas; kontrollera domänen manuellt.",
        model_count: 0,
        algorithm_version: valuation?.algorithmVersion ?? ALGORITHM_VERSION,
        valuation_signals: valuation?.signals ?? {},
        is_valuated: Boolean(valuation),
      };
    });

    if (rows.length > 0) {
      const { error: resultError } = await supabase
        .from("scan_results")
        .insert(rows);
      if (resultError) throw new Error("Could not save scan results");
    }

    // Cache is backend-only and has a TTL. A failure to cache must not turn a
    // completed scan into a failed one.
    const cacheRows = availabilityResults
      .filter((result) => result.status !== "invalid")
      .map((result) => ({
        domain: result.domain,
        tld: result.tld,
        availability_status: result.status,
        check_method: result.checkMethod,
        registration_price_estimate: result.registrationPriceEstimate,
        checked_at: now,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString(),
      }));
    if (cacheRows.length > 0) {
      const { error: cacheError } = await supabase.from("domain_cache").upsert(cacheRows, { onConflict: "domain" });
      if (cacheError) console.warn("Could not update domain cache", cacheError.message);
    }

    const { error: completeError } = await supabase
      .from("user_scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_domains_scanned: availabilityResults.length,
      })
      .eq("id", scanId)
      .eq("user_id", scanOwnerId);
    if (completeError) throw new Error("Could not complete scan");

    return json(request, {
      success: true,
      totalScanned: availabilityResults.length,
      availableFound: rows.length,
      unknown: availabilityResults.filter((result) => result.status === "unknown").length,
      algorithmVersion: ALGORITHM_VERSION,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    console.error("User domain scan failed", error);

    if (scanId) {
      try {
        const supabase = getServiceClient();
        await supabase
          .from("user_scans")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", scanId)
          .eq("user_id", scanOwnerId);
      } catch (statusError) {
        console.error("Could not mark scan as failed", statusError);
      }
    }

    return json(request, { error: message }, 500);
  }
});

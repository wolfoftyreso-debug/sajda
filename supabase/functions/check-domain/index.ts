import { consumeRateLimit, requireIdentity } from "../_shared/auth.ts";
import { availabilityFromRdapStatus } from "../_shared/availability.ts";
import { getRegistrationPriceEstimate, getTld, normalizeDomain } from "../_shared/domain-engine.ts";
import { corsHeaders, fetchWithTimeout, json, readJson, rejectDisallowedOrigin } from "../_shared/http.ts";

type AvailabilityStatus = "available" | "taken" | "unknown" | "invalid";

interface DomainCheckResult {
  domain: string;
  tld: string;
  status: AvailabilityStatus;
  available: boolean;
  checkMethod: "rdap" | "none";
  registrarPrice: number | null;
  registrationPriceEstimate: number | null;
  priceSource: "heuristic" | null;
  error?: string;
}

interface RdapBootstrap {
  services?: Array<[string[], string[]]>;
}

let cachedBootstrap: { expiresAt: number; endpoints: Map<string, string> } | null = null;

function getBootstrapUrl(): string {
  return Deno.env.get("RDAP_BOOTSTRAP_URL") ?? "https://data.iana.org/rdap/dns.json";
}

async function getRdapEndpoint(tld: string): Promise<string | null> {
  if (cachedBootstrap && cachedBootstrap.expiresAt > Date.now()) {
    return cachedBootstrap.endpoints.get(tld) ?? null;
  }

  const response = await fetchWithTimeout(getBootstrapUrl(), {
    headers: { Accept: "application/json" },
  }, 8_000);
  if (!response.ok) throw new Error(`RDAP bootstrap returned HTTP ${response.status}`);

  const bootstrap = await response.json() as RdapBootstrap;
  const endpoints = new Map<string, string>();
  for (const service of bootstrap.services ?? []) {
    const [tlds, urls] = service;
    const endpoint = urls.find((url) => url.startsWith("https://"));
    if (!endpoint) continue;
    for (const listedTld of tlds) endpoints.set(listedTld.toLowerCase(), endpoint);
  }

  cachedBootstrap = { endpoints, expiresAt: Date.now() + 24 * 60 * 60 * 1_000 };
  return endpoints.get(tld) ?? null;
}

async function checkRdap(domain: string): Promise<Pick<DomainCheckResult, "status" | "checkMethod" | "error">> {
  try {
    const endpoint = await getRdapEndpoint(getTld(domain));
    if (!endpoint) {
      return { status: "unknown", checkMethod: "none", error: "No authoritative RDAP endpoint is listed for this TLD" };
    }

    const url = new URL(`domain/${encodeURIComponent(domain)}`, endpoint).toString();
    const response = await fetchWithTimeout(url, {
      headers: { Accept: "application/rdap+json, application/json" },
      redirect: "follow",
    }, 8_000);

    const status = availabilityFromRdapStatus(response.status);
    // RDAP's domain lookup contract uses 404 for a domain that is not found.
    if (status === "available" || status === "taken") return { status, checkMethod: "rdap" };
    if (response.status === 429) return { status: "unknown", checkMethod: "rdap", error: "RDAP rate limit reached" };

    return { status: "unknown", checkMethod: "rdap", error: `RDAP returned HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "RDAP request timed out" : "RDAP lookup failed";
    console.warn(`RDAP lookup failed for ${domain}`, error);
    return { status: "unknown", checkMethod: "none", error: message };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function checkDomain(domain: string): Promise<DomainCheckResult> {
  const result = await checkRdap(domain);
  const price = result.status === "available" ? getRegistrationPriceEstimate(domain) : null;

  return {
    domain,
    tld: getTld(domain),
    status: result.status,
    available: result.status === "available",
    checkMethod: result.checkMethod,
    // Retained for the current UI/data contract. It is explicitly an estimate,
    // never a quoted registrar price.
    registrarPrice: price,
    registrationPriceEstimate: price,
    priceSource: price === null ? null : "heuristic",
    ...(result.error ? { error: result.error } : {}),
  };
}

Deno.serve(async (request) => {
  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authentication = await requireIdentity(request, { allowJobSecret: true });
  if ("response" in authentication) return authentication.response;
  if (authentication.identity.kind === "user" && !await consumeRateLimit(authentication.identity.user.id, "check-domain", 30, 60)) {
    return json(request, { error: "Rate limit exceeded. Try again in a minute." }, 429);
  }

  try {
    const body = await readJson(request);
    if (!Array.isArray(body.domains) || body.domains.length === 0) {
      return json(request, { error: "domains must be a non-empty array" }, 400);
    }
    if (body.domains.length > 50) return json(request, { error: "At most 50 domains may be checked per request" }, 400);

    const seen = new Set<string>();
    const validDomains: string[] = [];
    const invalidResults: DomainCheckResult[] = [];
    for (const input of body.domains) {
      const domain = normalizeDomain(input);
      if (!domain) {
        invalidResults.push({
          domain: typeof input === "string" ? input : "",
          tld: "",
          status: "invalid",
          available: false,
          checkMethod: "none",
          registrarPrice: null,
          registrationPriceEstimate: null,
          priceSource: null,
          error: "Invalid fully-qualified domain name",
        });
      } else if (!seen.has(domain)) {
        seen.add(domain);
        validDomains.push(domain);
      }
    }

    const checked = await mapWithConcurrency(validDomains, 5, checkDomain);
    const results = [...checked, ...invalidResults];
    return json(request, {
      results,
      checked: checked.length,
      available: checked.filter((result) => result.status === "available").length,
      unknown: checked.filter((result) => result.status === "unknown").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return json(request, { error: message }, 400);
  }
});

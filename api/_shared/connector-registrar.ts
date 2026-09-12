// Server-only, read-only registrar quote adapter. Cloudflare documents this
// POST as a check, not a create/modify/reserve operation:
// https://developers.cloudflare.com/api/resources/registrar/methods/check/
// Access is not anonymous. The general Registrar workflow guide specifies write
// permission, but the isolated connector's live check accepted Registrar Domains
// Read on 2026-09-12. Prefer least privilege; never broaden access automatically.
// Provisioning is an operator prerequisite, NOT something this adapter performs.
// No generic Cloudflare
// credential, configurable endpoint, registration call or purchase is supported.
const SOURCE_URL = "https://developers.cloudflare.com/api/resources/registrar/methods/check/";
// Verified public registrar search landing; not a cart, reservation or payment.
const PURCHASE_URL = "https://www.cloudflare.com/domains/";
const TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const OFFER_FRESHNESS_MS = 5 * 60 * 1000;
const currencies = new Set(["USD", "EUR", "GBP", "SEK"]);

export interface ConnectorRegistrarOffer {
  providerId: "cloudflare"; registrar: "Cloudflare"; purchaseUrl: string; priceSourceUrl: string;
  priceStatus: "verified"; priceVerified: true; dataSource: "official_provider_api";
  priceScope: "exact_domain_offer"; domain: string; availability: "available";
  checkedAt: string; expiresAt: string; currency: string; registrationPrice: number; renewalPrice: number;
  taxTreatment: "unknown"; priceType: "standard";
}
export interface ConnectorRegistrarResult {
  status: "ok" | "not_configured" | "unavailable" | "rate_limited";
  /** Coarse HTTP 401/403 diagnosis only; never provider text or a permission grant. */
  failureReason?: "authorization";
  offers: Record<string, ConnectorRegistrarOffer>;
  /** Domains sent to the one attempted check, including failed/rate-limited calls. */
  checkedDomains: number;
}
interface Dependencies {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  env?: Record<string, string | undefined>;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const empty = (status: ConnectorRegistrarResult["status"], checkedDomains = 0): ConnectorRegistrarResult =>
  ({ status, offers: {}, checkedDomains });

function validDomain(domain: unknown): domain is string {
  if (typeof domain !== "string" || domain.length > 253 || domain !== domain.toLowerCase()) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && /^[a-z]{2,63}$/u.test(labels.at(-1)!) && labels.every(label =>
    !label.startsWith("xn--") && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}
function decimalPrice(value: unknown): number | null {
  // Cloudflare returns decimal strings. Never coerce empty strings, signs,
  // exponent notation, locale commas, extra precision, or numeric JSON values.
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/u.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount <= 100000000 ? amount : null;
}
function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (!/^application\/json(?:\s*;.*)?$/iu.test(response.headers.get("content-type") ?? "")
    || length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES) || !response.body) {
    cancelBody(response);
    throw new Error("Invalid registrar response");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let total = 0, body = "";
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error("Registrar response too large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    signal.throwIfAborted();
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
function parseOffers(payload: unknown, domains: string[], now: number): ConnectorRegistrarResult {
  const data = record(payload), result = record(data?.result), rows = result?.domains;
  if (data?.success !== true || !Array.isArray(data.errors) || data.errors.length !== 0
    || !Array.isArray(data.messages) || !Array.isArray(rows) || rows.length > domains.length) return empty("unavailable", domains.length);
  const requested = new Set(domains), seen = new Set<string>();
  const offers: Record<string, ConnectorRegistrarOffer> = {};
  for (const value of rows) {
    const row = record(value);
    // A response for a different name, or conflicting duplicate evidence,
    // invalidates the batch. Omitted domains are never synthesized as offers.
    if (!row || typeof row.name !== "string" || !requested.has(row.name) || seen.has(row.name)
      || typeof row.registrable !== "boolean") return empty("unavailable", domains.length);
    seen.add(row.name);
    if (!row.registrable || row.tier === "premium") continue;
    const pricing = record(row.pricing);
    const registrationPrice = decimalPrice(pricing?.registration_cost), renewalPrice = decimalPrice(pricing?.renewal_cost);
    if (row.tier !== "standard" || row.reason !== undefined || !pricing || typeof pricing.currency !== "string"
      || !currencies.has(pricing.currency) || registrationPrice === null || renewalPrice === null) return empty("unavailable", domains.length);
    offers[row.name] = {
      providerId: "cloudflare", registrar: "Cloudflare", purchaseUrl: PURCHASE_URL, priceSourceUrl: SOURCE_URL,
      priceStatus: "verified", priceVerified: true, dataSource: "official_provider_api", priceScope: "exact_domain_offer",
      domain: row.name, availability: "available", checkedAt: new Date(now).toISOString(),
      // Local evidence freshness limit, not a provider-guaranteed price lock.
      expiresAt: new Date(now + OFFER_FRESHNESS_MS).toISOString(), currency: pricing.currency,
      registrationPrice, renewalPrice, taxTreatment: "unknown", priceType: "standard",
    };
  }
  return { status: "ok", offers, checkedDomains: domains.length };
}

/** One bounded official check only. All network/error details stay server-side. */
export async function fetchConnectorRegistrarOffers(domains: string[], deps: Dependencies = {}): Promise<ConnectorRegistrarResult> {
  if (!Array.isArray(domains) || domains.length < 1 || domains.length > 20 || !domains.every(validDomain)
    || new Set(domains).size !== domains.length) return empty("unavailable");
  const requested = [...domains], env = deps.env ?? {
    SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID: process.env.SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID,
    SAJDA_CONNECTOR_CLOUDFLARE_TOKEN: process.env.SAJDA_CONNECTOR_CLOUDFLARE_TOKEN,
  };
  const accountId = env.SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID, token = env.SAJDA_CONNECTOR_CLOUDFLARE_TOKEN;
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/iu.test(accountId) || typeof token !== "string"
    || !/^[A-Za-z0-9_-]{1,4096}$/u.test(token)) return empty("not_configured");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Registrar check timed out"));
    }, TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([(deps.fetch ?? globalThis.fetch)(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domain-check`, {
        method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ domains: requested }),
      }), deadline]);
    if (response.status !== 200 || response.redirected) {
      cancelBody(response);
      if (response.status === 401 || response.status === 403) {
        return { ...empty("unavailable", requested.length), failureReason: "authorization" };
      }
      return empty(response.status === 429 ? "rate_limited" : "unavailable", requested.length);
    }
    const payload = await Promise.race([readBoundedJson(response, controller.signal), deadline]);
    const now = (deps.now ?? Date.now)();
    if (!Number.isFinite(now) || !Number.isFinite(new Date(now + OFFER_FRESHNESS_MS).getTime())
      || new Date(now).toISOString().length !== 24 || new Date(now + OFFER_FRESHNESS_MS).toISOString().length !== 24) return empty("unavailable", requested.length);
    return parseOffers(payload, requested, now);
  } catch {
    // Never expose provider error bodies, account IDs, credentials or exception
    // text. No automatic retries: the caller owns a bounded refill budget.
    return empty("unavailable", requested.length);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

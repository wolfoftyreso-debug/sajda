const BRIDGE_URL = "https://sajda-connector.vercel.app/api/internal/registrar/cloudflare";
const SOURCE_URL = "https://developers.cloudflare.com/api/resources/registrar/methods/check/";
const PURCHASE_URL = "https://www.cloudflare.com/domains/";
const MAX_DOMAINS = 180;
const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 26_000;
const MAX_EVIDENCE_AGE_MS = 10 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_OFFER_LIFETIME_MS = 5 * 60_000;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

export interface RegistrarBridgeOffer {
  providerId: "cloudflare";
  registrar: "Cloudflare";
  purchaseUrl: typeof PURCHASE_URL;
  priceSourceUrl: typeof SOURCE_URL;
  priceStatus: "verified";
  priceVerified: true;
  dataSource: "official_provider_api";
  priceScope: "exact_domain_offer";
  domain: string;
  availability: "available";
  checkedAt: string;
  expiresAt: string;
  currency: string;
  registrationPrice: number;
  renewalPrice: number;
  taxTreatment: "unknown";
  priceType: "standard";
}

export interface RegistrarBridgeResult {
  configured: boolean;
  status: "ok" | "not_configured" | "unavailable" | "rate_limited";
  checkedAt: string | null;
  checkedDomains: number;
  offers: Map<string, RegistrarBridgeOffer>;
}

interface Dependencies {
  fetch?: typeof globalThis.fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function token(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.SAJDA_REGISTRAR_BRIDGE_TOKEN?.trim();
  return value && TOKEN.test(value) ? value : null;
}

export function registrarBridgeConfigured(env?: Record<string, string | undefined>): boolean {
  return token(env) !== null;
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000_000
    && Math.round(value * 100) === value * 100;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function parseOffer(value: unknown, domain: string, now: number): RegistrarBridgeOffer | null {
  const offer = record(value);
  if (!offer || !exactKeys(offer, ["providerId", "registrar", "purchaseUrl", "priceSourceUrl", "priceStatus",
    "priceVerified", "dataSource", "priceScope", "domain", "availability", "checkedAt", "expiresAt", "currency",
    "registrationPrice", "renewalPrice", "taxTreatment", "priceType"])) return null;
  if (offer.providerId !== "cloudflare" || offer.registrar !== "Cloudflare" || offer.purchaseUrl !== PURCHASE_URL
    || offer.priceSourceUrl !== SOURCE_URL || offer.priceStatus !== "verified" || offer.priceVerified !== true
    || offer.dataSource !== "official_provider_api" || offer.priceScope !== "exact_domain_offer"
    || offer.domain !== domain || offer.availability !== "available" || offer.taxTreatment !== "unknown"
    || offer.priceType !== "standard" || typeof offer.currency !== "string" || !CURRENCY.test(offer.currency)
    || !validAmount(offer.registrationPrice) || !validAmount(offer.renewalPrice)
    || typeof offer.checkedAt !== "string" || typeof offer.expiresAt !== "string") return null;
  const checkedAt = Date.parse(offer.checkedAt), expiresAt = Date.parse(offer.expiresAt);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(expiresAt) || checkedAt > now + MAX_FUTURE_SKEW_MS
    || checkedAt < now - MAX_EVIDENCE_AGE_MS || expiresAt <= now || expiresAt <= checkedAt
    || expiresAt - checkedAt > MAX_OFFER_LIFETIME_MS) return null;
  return offer as unknown as RegistrarBridgeOffer;
}

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (!/^application\/json(?:\s*;.*)?$/iu.test(response.headers.get("content-type") ?? "")
    || length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES) || !response.body) {
    cancelBody(response);
    throw new Error("Invalid registrar bridge response");
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0, body = "";
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Registrar bridge response too large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    reader.releaseLock();
  }
}

function empty(configured: boolean, status: RegistrarBridgeResult["status"] = configured ? "unavailable" : "not_configured",
  checkedDomains = 0): RegistrarBridgeResult {
  return { configured, status, checkedAt: null, checkedDomains, offers: new Map() };
}

function parseResponse(payload: unknown, domains: readonly string[], now: number): RegistrarBridgeResult {
  const root = record(payload);
  if (!root || !exactKeys(root, ["status", "offers", "checkedDomains"]) || root.status !== "ok"
    || !Number.isInteger(root.checkedDomains) || root.checkedDomains !== domains.length) return empty(true, "unavailable", domains.length);
  const source = record(root.offers);
  if (!source) return empty(true, "unavailable", domains.length);
  const requested = new Set(domains);
  const offers = new Map<string, RegistrarBridgeOffer>();
  for (const [domain, value] of Object.entries(source)) {
    if (!requested.has(domain) || offers.has(domain)) return empty(true, "unavailable", domains.length);
    const offer = parseOffer(value, domain, now);
    if (!offer) return empty(true, "unavailable", domains.length);
    offers.set(domain, offer);
  }
  const checkedAt = [...offers.values()].reduce<string | null>((latest, offer) =>
    latest === null || offer.checkedAt > latest ? offer.checkedAt : latest, null);
  return { configured: true, status: "ok", checkedAt, checkedDomains: domains.length, offers };
}

/** Read-only call into Sajda's isolated registrar connector. It has no purchase or registration capability. */
export async function fetchRegistrarBridgeOffers(domains: readonly string[], deps: Dependencies = {}): Promise<RegistrarBridgeResult> {
  const credential = token(deps.env);
  if (!credential) return empty(false);
  if (!Array.isArray(domains) || domains.length < 1 || domains.length > MAX_DOMAINS
    || !domains.every(domain => typeof domain === "string" && DOMAIN.test(domain))
    || new Set(domains).size !== domains.length) return empty(true);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Registrar bridge timed out")); }, TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([(deps.fetch ?? globalThis.fetch)(BRIDGE_URL, {
      method: "POST", redirect: "error", cache: "no-store", credentials: "omit", signal: controller.signal,
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ domains }),
    }), deadline]);
    if (response.status !== 200 || response.redirected) {
      cancelBody(response);
      return empty(true, response.status === 429 ? "rate_limited" : "unavailable", domains.length);
    }
    const payload = await Promise.race([readBoundedJson(response, controller.signal), deadline]);
    return parseResponse(payload, domains, (deps.now ?? Date.now)());
  } catch {
    return empty(true, "unavailable", domains.length);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export const CLOUDFLARE_REGISTRAR_PRICE_SOURCE_URL = SOURCE_URL;

import { canonicalTradingRegistrarDomain, isTradingRegistrarEvidence, registrarRegistrationSubtotal, TRADING_REGISTRAR_ENDPOINT,
  TRADING_REGISTRAR_MAX_AGE_MS, type TradingRegistrarEvidence, type TradingRegistrarReason } from "../../shared/trading-registrar.js";
import { deferLostRegistrar, permitLostRegistrar } from "./lost-domains-providers.js";

const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 4000;
type Dependencies = {
  fetch: typeof fetch;
  now: () => number;
  enabled: () => boolean;
  credentials: () => { apiKey: string; secretKey: string } | null;
  permit: (signal?: AbortSignal) => Promise<boolean>;
  defer: (retryAt: number, signal?: AbortSignal) => Promise<void>;
};
function empty(domain: string, reason: Exclude<TradingRegistrarReason, "registrar_checked">, now: number): TradingRegistrarEvidence {
  return { version: 1, provider: "porkbun", method: "official_registrar_api", domain, sourceUrl: TRADING_REGISTRAR_ENDPOINT + domain,
    status: reason === "disabled" ? "disabled" : "unknown", reason, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + TRADING_REGISTRAR_MAX_AGE_MS).toISOString(),
    availability: "unknown", currency: "USD", annualRegistrationMinor: null, renewalPriceMinor: null, regularAnnualRegistrationMinor: null,
    minRegistrationYears: null, firstYearPromo: null, premium: null, minimumRegistrationSubtotalMinor: null,
    taxTreatment: "unknown", feesTreatment: "unknown", mandatoryAddOns: "unknown", renewalTermYears: null };
}
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function decimalMinor(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/u.test(value)) throw new Error("Invalid registrar amount");
  const [whole, decimals = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) throw new Error("Invalid registrar amount");
  return result;
}
function yesNo(value: unknown): boolean | null {
  if (value === undefined) return null;
  if (value !== "yes" && value !== "no") throw new Error("Invalid registrar flag");
  return value === "yes";
}
function simulated(value: unknown): boolean {
  const row = object(value);
  return row !== null && ["sandbox", "mock", "dryRun"].some(key => Object.prototype.hasOwnProperty.call(row, key));
}
/** Reviewed contract: https://porkbun.com/api/json/v3/spec#/components/schemas/CheckDomainResponse */
export function parsePorkbunDomainCheck(domainInput: string, payload: unknown, now: number): TradingRegistrarEvidence | null {
  const domain = canonicalTradingRegistrarDomain(domainInput), row = object(payload), response = object(row?.response);
  if (!domain || !row || !response || row.status !== "SUCCESS" || simulated(row) || simulated(response)
    || !["yes", "no"].includes(String(response.avail)) || response.type !== "registration"
    || response.domain !== undefined && response.domain !== domain || row.domain !== undefined && row.domain !== domain) return null;
  try {
    const years = response.minDuration === undefined ? null : response.minDuration;
    if (years !== null && (!Number.isInteger(years) || Number(years) < 1 || Number(years) > 10)) return null;
    const additional = response.additional === undefined ? null : object(response.additional);
    if (response.additional !== undefined && !additional) return null;
    const renewal = additional?.renewal === undefined ? null : object(additional.renewal);
    if (additional?.renewal !== undefined && (!renewal || renewal.type !== "renewal")) return null;
    const result: TradingRegistrarEvidence = { ...empty(domain, "invalid_response", now), status: "checked", reason: "registrar_checked",
      availability: response.avail === "yes" ? "available" : "unavailable", annualRegistrationMinor: decimalMinor(response.price),
      renewalPriceMinor: decimalMinor(renewal?.price), regularAnnualRegistrationMinor: decimalMinor(response.regularPrice),
      minRegistrationYears: years as number | null, firstYearPromo: yesNo(response.firstYearPromo), premium: yesNo(response.premium) };
    result.minimumRegistrationSubtotalMinor = registrarRegistrationSubtotal(result);
    return isTradingRegistrarEvidence(result) ? result : null;
  } catch { return null; }
}
async function boundedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES || !response.body) throw new Error("Invalid registrar response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("Registrar response exceeded limit");
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}
function retryMilliseconds(response: Response, payload: unknown, now: number): number {
  const header = response.headers.get("retry-after"), row = object(payload);
  const fromDate = header && !/^\d+$/u.test(header) ? Date.parse(header) : NaN;
  const seconds = header && /^\d+$/u.test(header) ? Number(header) : typeof row?.ttlRemaining === "number" ? row.ttlRemaining : 60;
  // A provider's explicit restriction is never shortened to our normal ten-second cadence.
  if (Number.isFinite(fromDate)) return Math.max(now + 10_000, fromDate);
  const duration = Number.isSafeInteger(seconds) && seconds >= 0 && now + seconds * 1000 <= 8.64e15 ? seconds * 1000 : 86_400_000;
  return now + Math.max(10_000, duration);
}
function liveKeys(keys: { apiKey: string; secretKey: string }): boolean {
  return /^pk1_[A-Za-z0-9_-]{16,256}$/u.test(keys.apiKey) && /^sk1_[A-Za-z0-9_-]{16,256}$/u.test(keys.secretKey)
    && !keys.apiKey.startsWith("pk1_sb_") && !keys.secretKey.startsWith("sk1_sb_");
}

export function createRegistrarInspector(dependencies: Dependencies) {
  let localBlockedUntil = 0;
  return async (domainInput: string, options: { signal?: AbortSignal } = {}): Promise<TradingRegistrarEvidence> => {
    const domain = canonicalTradingRegistrarDomain(domainInput), now = dependencies.now();
    if (!domain) return empty("", "invalid_domain", now);
    if (!dependencies.enabled()) return empty(domain, "disabled", now);
    const keys = dependencies.credentials();
    if (keys?.apiKey.startsWith("pk1_sb_") || keys?.secretKey.startsWith("sk1_sb_")) return empty(domain, "sandbox_not_live", now);
    if (!keys || !liveKeys(keys)) return empty(domain, "not_configured", now);
    if (options.signal?.aborted) return empty(domain, "aborted", now);
    if (now < localBlockedUntil) return empty(domain, "rate_limited", now);
    const timeout = AbortSignal.timeout(TIMEOUT_MS), signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    const abort = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Registrar timed out")), { once: true }));
    let phase: "gate" | "fetch" | "body" = "gate";
    const backoff = async (response: Response, payload: unknown): Promise<TradingRegistrarEvidence> => {
      localBlockedUntil = retryMilliseconds(response, payload, dependencies.now());
      try { await dependencies.defer(localBlockedUntil, signal); }
      catch { localBlockedUntil = Math.max(localBlockedUntil, dependencies.now() + 6 * 60 * 60_000); return empty(domain, "provider_gate_unavailable", now); }
      return empty(domain, "rate_limited", now);
    };
    const run = async (): Promise<TradingRegistrarEvidence> => {
      if (!await dependencies.permit(signal)) return empty(domain, "rate_limited", now);
      if (signal.aborted) return empty(domain, options.signal?.aborted ? "aborted" : "timeout", now);
      phase = "fetch";
      // Sole provider operation. This cannot register, renew, transfer, spend credit, or modify DNS.
      const response = await dependencies.fetch(TRADING_REGISTRAR_ENDPOINT + domain, { method: "POST", redirect: "error", signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Sajda-Trading-Research/1.0" },
        body: JSON.stringify({ apikey: keys.apiKey, secretapikey: keys.secretKey }) });
      if (response.headers.has("x-porkbun-sandbox") || response.headers.has("x-porkbun-mock")) return empty(domain, "sandbox_not_live", now);
      // Honor HTTP rate limits even if their body is oversized, HTML, empty, or malformed.
      if (response.status === 429) return backoff(response, null);
      phase = "body";
      let payload: unknown = null;
      if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json") payload = JSON.parse(await boundedBody(response));
      if (simulated(payload) || simulated(object(payload)?.response)) return empty(domain, "sandbox_not_live", now);
      if (object(payload)?.code === "RATE_LIMIT_EXCEEDED"
        || object(payload)?.status === "ERROR" && Number.isInteger(object(payload)?.ttlRemaining) && Number(object(payload)?.ttlRemaining) > 0) return backoff(response, payload);
      if (!response.ok) return empty(domain, "unavailable", now);
      if (object(payload)?.status === "ERROR") return empty(domain, "unavailable", now);
      const limits = object(object(payload)?.limits);
      if (Number.isInteger(limits?.TTL) && Number(limits?.TTL) > 10 && Number.isInteger(limits?.limit)
        && Number(limits?.limit) > 0 && Number.isInteger(limits?.used) && Number(limits?.used) >= Number(limits?.limit)) {
        localBlockedUntil = retryMilliseconds(response, { ttlRemaining: limits!.TTL }, dependencies.now());
        try { await dependencies.defer(localBlockedUntil, signal); }
        catch { return empty(domain, "provider_gate_unavailable", now); }
      }
      return parsePorkbunDomainCheck(domain, payload, now) ?? empty(domain, "invalid_response", now);
    };
    try { return await Promise.race([run(), abort]); }
    catch {
      // Provider response bodies, exception messages and credential material never leave this boundary.
      return empty(domain, options.signal?.aborted ? "aborted" : timeout.aborted ? "timeout" : phase === "gate" ? "provider_gate_unavailable" : phase === "body" ? "invalid_response" : "unavailable", now);
    }
  };
}
export const isRegistrarEnrichmentEnabled = (): boolean => process.env.SAJDA_LOST_DOMAINS_REGISTRAR_ENABLED === "true";
export const inspectDomainRegistrar = createRegistrarInspector({ fetch: (input, init) => fetch(input, init), now: Date.now,
  enabled: isRegistrarEnrichmentEnabled,
  credentials: () => process.env.PORKBUN_API_KEY && process.env.PORKBUN_SECRET_API_KEY
    ? { apiKey: process.env.PORKBUN_API_KEY, secretKey: process.env.PORKBUN_SECRET_API_KEY } : null,
  permit: permitLostRegistrar, defer: deferLostRegistrar });

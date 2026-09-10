import { isNativeApp } from "./appSurface";

export type LocalAvailabilityStatus = "available" | "taken" | "unknown";
export type LocalCheckMethod = "rdap" | "whois" | "none";

export interface LocalAvailabilityResult {
  domain: string;
  tld: "com" | "se" | "io";
  status: LocalAvailabilityStatus;
  checkMethod: LocalCheckMethod;
  source: "verisign-rdap" | "iis-whois" | "nic-io-whois" | "none";
  authoritative: boolean;
  error?: string;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const VERIFIABLE_TLDS = new Set(["com", "se", "io"]);
const MAX_DOMAINS_PER_REQUEST = 20;
const REQUEST_TIMEOUT_MS = 20_000;

function isSupportedDomain(value: string): value is string {
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(com|se|io)$/.exec(value);
  return Boolean(match && VERIFIABLE_TLDS.has(match[2]));
}

export function canUseLocalAvailabilityVerifier(): boolean {
  return !isNativeApp && typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname);
}

export async function verifyAvailabilityLocally(domains: string[]): Promise<Map<string, LocalAvailabilityResult>> {
  if (!canUseLocalAvailabilityVerifier()) return new Map();

  const normalized = [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(isSupportedDomain))];
  if (normalized.length === 0) return new Map();

  const resultMap = new Map<string, LocalAvailabilityResult>();
  for (let index = 0; index < normalized.length; index += MAX_DOMAINS_PER_REQUEST) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/verify-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: normalized.slice(index, index + MAX_DOMAINS_PER_REQUEST) }),
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const payload = await response.json() as { results?: unknown };
      if (!Array.isArray(payload.results)) continue;
      for (const value of payload.results) {
        if (!isLocalAvailabilityResult(value)) continue;
        resultMap.set(value.domain, value);
      }
    } catch {
      // The page is still usable when the loopback verifier is offline. The
      // caller keeps the result as unknown instead of trusting legacy data.
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return resultMap;
}

function isLocalAvailabilityResult(value: unknown): value is LocalAvailabilityResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<LocalAvailabilityResult>;
  return typeof result.domain === "string"
    && (result.tld === "com" || result.tld === "se" || result.tld === "io")
    && (result.status === "available" || result.status === "taken" || result.status === "unknown")
    && (result.checkMethod === "rdap" || result.checkMethod === "whois" || result.checkMethod === "none")
    && typeof result.source === "string"
    && typeof result.authoritative === "boolean";
}

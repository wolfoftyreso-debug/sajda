import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";

export const LOST_DOMAINS_USER_AGENT = "SajdaResearch/1.0";
export type FetchErrorCode = "invalid_url" | "blocked_address" | "dns_unavailable" | "timeout" | "aborted"
  | "response_too_large" | "unsupported_encoding" | "invalid_response" | "redirect_limit" | "network_unavailable";
export class LostDomainsFetchError extends Error {
  constructor(readonly code: FetchErrorCode) { super(code); this.name = "LostDomainsFetchError"; }
}
export interface PublicAddress { address: string; family: 4 | 6 }
export interface SafeFetchResponse {
  url: string; status: number; headers: Record<string, string>; body: string; observedAt: string;
}
export interface SafeFetchOptions {
  signal?: AbortSignal;
  /** Absolute shared operation deadline; redirects and DNS cannot reset it. */
  deadline?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedHosts?: readonly string[];
  accept?: string;
  /** Used internally to check robots for each destination, not just the first. */
  beforeRequest?: (url: URL, signal: AbortSignal) => Promise<void>;
}
export interface PinnedRequest {
  url: URL; address: PublicAddress; signal: AbortSignal; maxBytes: number; accept: string;
}
const blocked4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0586300, 24], [0xc0a80000, 16],
  [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];

/** Fail closed for private, loopback, link-local, multicast and special ranges. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = address.split(".").reduce((sum, item) => (sum * 256 + Number(item)) >>> 0, 0);
    return !blocked4.some(([prefix, bits]) => value >>> (32 - bits) === prefix >>> (32 - bits));
  }
  if (family !== 6 || address.includes("%")) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const parts = normalized.split(":");
  const first = parseInt(parts[0] || "0", 16), second = parseInt(parts[1] || "0", 16);
  // Global-unicast only; reject IPv4-mapped/NAT64/ULA/link-local by construction.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && (second < 0x200 || second === 0xdb8)) return false;
  if (first === 0x2002 || first === 0x3ffe || (first === 0x3fff && second < 0x1000)) return false;
  return true;
}

export function safeHttpsUrl(value: string): URL {
  if (typeof value !== "string" || value.length > 2_048 || Array.from(value).some(character =>
    character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) throw new LostDomainsFetchError("invalid_url");
  let url: URL;
  try { url = new URL(value); } catch { throw new LostDomainsFetchError("invalid_url"); }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || !host.includes(".") || host.endsWith(".") || isIP(host) || host.startsWith("[")
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(host)
    || host.split(".").some(part => !part || part.length > 63 || part.startsWith("-") || part.endsWith("-"))
    || /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/u.test(host)) throw new LostDomainsFetchError("invalid_url");
  url.hash = "";
  return url;
}

function aborted(signal: AbortSignal): LostDomainsFetchError {
  return new LostDomainsFetchError(signal.reason?.name === "TimeoutError" ? "timeout" : "aborted");
}
export async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // The operation may already have produced a rejected promise. Consume it
    // even when cancellation wins, avoiding an unhandled rejection in Node.
    void promise.catch(() => undefined);
    throw aborted(signal);
  }
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(aborted(signal));
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** The HTTPS connection uses the validated address; DNS is never looked up twice. */
export function createPinnedRequester(requestImpl: typeof httpsRequest = httpsRequest) {
  return (input: PinnedRequest): Promise<Omit<SafeFetchResponse, "observedAt">> => new Promise((resolve, reject) => {
    if (input.signal.aborted) { reject(aborted(input.signal)); return; }
    const lookup: RequestOptions["lookup"] = (_host, options, callback) => {
      // Node may request all addresses for auto-select-family; still supply only
      // the one previously validated IP. No proxy, pooling or DNS rebinding.
      if (typeof options === "object" && options.all) callback(null, [input.address] as never, input.address.family);
      else callback(null, input.address.address, input.address.family);
    };
    const request = requestImpl(input.url, {
      method: "GET", agent: false, family: input.address.family, lookup,
      servername: input.url.hostname, rejectUnauthorized: true, maxHeaderSize: 16_384,
      headers: { "User-Agent": LOST_DOMAINS_USER_AGENT, Accept: input.accept, "Accept-Encoding": "identity", Connection: "close" },
    }, response => {
      const fail = (code: FetchErrorCode) => { response.destroy(); request.destroy(); reject(new LostDomainsFetchError(code)); };
      if (Number(response.headers["content-length"]) > input.maxBytes) { fail("response_too_large"); return; }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") { fail("unsupported_encoding"); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > input.maxBytes) fail("response_too_large"); else chunks.push(chunk);
      });
      response.on("error", () => reject(new LostDomainsFetchError("network_unavailable")));
      response.on("aborted", () => reject(new LostDomainsFetchError("network_unavailable")));
      response.on("end", () => {
        if (!response.complete) { reject(new LostDomainsFetchError("invalid_response")); return; }
        const headers: Record<string, string> = {};
        for (const name of ["content-type", "location", "retry-after"]) {
          const value = response.headers[name];
          if (typeof value === "string" && value.length <= 2_048) headers[name] = value;
        }
        resolve({ url: input.url.href, status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    const cancel = () => { request.destroy(); reject(aborted(input.signal)); };
    input.signal.addEventListener("abort", cancel, { once: true });
    request.on("error", () => reject(new LostDomainsFetchError("network_unavailable")));
    request.on("close", () => input.signal.removeEventListener("abort", cancel));
    request.end();
  });
}

export function createSafeFetcher(dependencies: {
  lookup?: (hostname: string) => Promise<PublicAddress[]>;
  transport?: (input: PinnedRequest) => Promise<Omit<SafeFetchResponse, "observedAt">>;
  now?: () => number;
} = {}) {
  const lookup = dependencies.lookup ?? (async hostname => (await dnsLookup(hostname, { all: true, verbatim: true })) as PublicAddress[]);
  const transport = dependencies.transport ?? createPinnedRequester();
  const now = dependencies.now ?? Date.now;
  return async function safeFetch(value: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
    const remaining = Math.min(3_500, (options.deadline ?? now() + 3_500) - now());
    if (!Number.isFinite(remaining) || remaining <= 0) throw new LostDomainsFetchError("timeout");
    const timeout = AbortSignal.timeout(Math.ceil(remaining));
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1, Math.min(524_288, Math.trunc(options.maxBytes!))) : 262_144;
    const maxRedirects = Number.isFinite(options.maxRedirects) ? Math.max(0, Math.min(3, Math.trunc(options.maxRedirects!))) : 2;
    const seen = new Set<string>();
    let url = safeHttpsUrl(value);
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      if (signal.aborted) throw aborted(signal);
      if (seen.has(url.href)) throw new LostDomainsFetchError("redirect_limit");
      seen.add(url.href);
      if (options.allowedHosts && !options.allowedHosts.includes(url.hostname)) throw new LostDomainsFetchError("invalid_url");
      if (options.beforeRequest) await withAbort(options.beforeRequest(url, signal), signal);
      let addresses: PublicAddress[];
      try { addresses = await withAbort(lookup(url.hostname), signal); }
      catch (error) { if (error instanceof LostDomainsFetchError) throw error; throw new LostDomainsFetchError("dns_unavailable"); }
      if (!addresses.length || addresses.length > 16 || addresses.some(item => !isPublicAddress(item.address) || isIP(item.address) !== item.family)) {
        throw new LostDomainsFetchError("blocked_address");
      }
      let response: Omit<SafeFetchResponse, "observedAt">;
      try { response = await withAbort(transport({ url, address: addresses[0], signal, maxBytes,
        accept: options.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.8" }), signal); }
      catch (error) { if (error instanceof LostDomainsFetchError) throw error; throw new LostDomainsFetchError("network_unavailable"); }
      if (Buffer.byteLength(response.body, "utf8") > maxBytes) throw new LostDomainsFetchError("response_too_large");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects >= maxRedirects || !response.headers.location) throw new LostDomainsFetchError("redirect_limit");
        let next: URL;
        try { next = new URL(response.headers.location, url); } catch { throw new LostDomainsFetchError("invalid_url"); }
        url = safeHttpsUrl(next.href);
      } else return { ...response, url: url.href, observedAt: new Date(now()).toISOString() };
    }
    throw new LostDomainsFetchError("redirect_limit");
  };
}

export const safeHttpsFetch = createSafeFetcher();

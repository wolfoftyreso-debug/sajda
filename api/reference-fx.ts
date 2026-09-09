import {
  normaliseReferenceFx, REFERENCE_FX_CACHE_MS, REFERENCE_FX_CURRENCIES,
  REFERENCE_FX_SOURCE, REFERENCE_FX_SOURCE_URL, type ReferenceFx,
} from "../shared/reference-fx.js";

// Fixed origin, currency set and source: this endpoint cannot proxy user URLs.
export const REFERENCE_FX_API_URL = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${REFERENCE_FX_CURRENCIES.join(",")}&providers=ECB`;
const FAILURE_CACHE_MS = 60_000;
const MAX_RESPONSE_BYTES = 16_384;
export const config = { maxDuration: 10 };

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(payload: unknown): void;
}

export function createReferenceFxHandler(dependencies: { fetch?: typeof fetch; now?: () => number } = {}) {
  const fetchRates = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  let cached: ReferenceFx | null = null;
  let expiresAt = 0;
  let pending: Promise<ReferenceFx | null> | null = null;

  async function refresh(): Promise<ReferenceFx | null> {
    try {
      const response = await fetchRates(REFERENCE_FX_API_URL, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000), redirect: "error",
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || !response.body) throw new Error("No rates");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Rates response too large"); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const rows: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(rows) || rows.length > REFERENCE_FX_CURRENCIES.length) throw new Error("Invalid rates");
      const rates: ReferenceFx["rates"] = {};
      for (const row of rows) {
        if (!row || row.base !== "USD" || !REFERENCE_FX_CURRENCIES.includes(row.quote)
          || typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0 || rates[row.quote]) throw new Error("Invalid rate");
        rates[row.quote] = { usdPerUnit: 1 / row.rate, date: row.date };
      }
      const completedAt = now();
      cached = normaliseReferenceFx({ source: REFERENCE_FX_SOURCE, sourceUrl: REFERENCE_FX_SOURCE_URL,
        fetchedAt: new Date(completedAt).toISOString(), rates }, completedAt);
      expiresAt = completedAt + (cached ? REFERENCE_FX_CACHE_MS : FAILURE_CACHE_MS);
      return cached;
    } catch {
      // Expired cached data must not continue to look like a current conversion.
      cached = null;
      expiresAt = now() + FAILURE_CACHE_MS;
      return null;
    }
  }

  return async function handler(request: { method?: string }, response: ResponseLike): Promise<void> {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.status(405).json({ error: "Only GET requests are supported.", code: "method_not_allowed" });
      return;
    }
    if (now() >= expiresAt) {
      if (!pending) pending = refresh().finally(() => { pending = null; });
      await pending;
    }
    const referenceFx = normaliseReferenceFx(cached, now());
    response.status(referenceFx ? 200 : 503).json({ status: referenceFx ? "available" : "unavailable", referenceFx });
  };
}

export default createReferenceFxHandler();

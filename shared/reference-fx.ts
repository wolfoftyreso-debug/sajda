/** Daily reference rates for comparison, never a registrar's checkout quote. */
export const REFERENCE_FX_SOURCE = "ECB via Frankfurter";
export const REFERENCE_FX_SOURCE_URL = "https://frankfurter.dev/";
export const REFERENCE_FX_CACHE_MS = 6 * 60 * 60 * 1_000;
export const REFERENCE_FX_MAX_DATE_AGE_MS = 5 * 24 * 60 * 60 * 1_000;
export const REFERENCE_FX_CURRENCIES = ["SEK", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "CNY", "NOK", "DKK", "INR", "SGD", "NZD", "HKD"] as const;

export interface ReferenceFxRate {
  /** Multiply a price in the native currency by this rate to compare in USD. */
  usdPerUnit: number;
  date: string;
}

export interface ReferenceFx {
  source: typeof REFERENCE_FX_SOURCE;
  sourceUrl: typeof REFERENCE_FX_SOURCE_URL;
  fetchedAt: string;
  rates: Record<string, ReferenceFxRate>;
}

export function isCurrentReferenceDate(value: unknown, now = Date.now()): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value
    && now >= timestamp && now - timestamp <= REFERENCE_FX_MAX_DATE_AGE_MS;
}

export function normaliseReferenceFx(value: unknown, now = Date.now()): ReferenceFx | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReferenceFx>;
  const fetchedAt = typeof candidate.fetchedAt === "string" ? Date.parse(candidate.fetchedAt) : NaN;
  if (candidate.source !== REFERENCE_FX_SOURCE || candidate.sourceUrl !== REFERENCE_FX_SOURCE_URL
    || !Number.isFinite(fetchedAt) || fetchedAt > now || now - fetchedAt > REFERENCE_FX_CACHE_MS
    || !candidate.rates || typeof candidate.rates !== "object" || Array.isArray(candidate.rates)) return null;
  const rates: ReferenceFx["rates"] = {};
  for (const currency of REFERENCE_FX_CURRENCIES) {
    const rate = candidate.rates[currency];
    if (rate && Number.isFinite(rate.usdPerUnit) && rate.usdPerUnit > 0 && rate.usdPerUnit < 1_000_000
      && isCurrentReferenceDate(rate.date, now)) rates[currency] = { usdPerUnit: rate.usdPerUnit, date: rate.date };
  }
  return Object.keys(rates).length ? {
    source: REFERENCE_FX_SOURCE, sourceUrl: REFERENCE_FX_SOURCE_URL, fetchedAt: candidate.fetchedAt!, rates,
  } : null;
}

export function getReferenceUsdRate(fx: ReferenceFx | null | undefined, currency: string, now = Date.now()): ReferenceFxRate | null {
  return normaliseReferenceFx(fx, now)?.rates[currency] ?? null;
}

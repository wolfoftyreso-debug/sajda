import { parse } from "tldts";
import type { TradingAcquisitionInput } from "./trading-acquisition.js";

export const TRADING_REGISTRAR_ENDPOINT = "https://api.porkbun.com/api/json/v3/domain/checkDomain/";
export const TRADING_REGISTRAR_MAX_AGE_MS = 5 * 60_000;
export const TRADING_REGISTRAR_REASONS = ["registrar_checked", "disabled", "not_configured", "sandbox_not_live", "invalid_domain", "rate_limited",
  "provider_gate_unavailable", "timeout", "aborted", "unavailable", "invalid_response"] as const;
export type TradingRegistrarReason = typeof TRADING_REGISTRAR_REASONS[number];

/** Live exact-domain observation, not a reservation, final payable total, or renewal-term guarantee. */
export interface TradingRegistrarEvidence {
  version: 1;
  provider: "porkbun";
  method: "official_registrar_api";
  domain: string;
  sourceUrl: string;
  status: "checked" | "unknown" | "disabled";
  reason: TradingRegistrarReason;
  checkedAt: string;
  expiresAt: string;
  availability: "available" | "unavailable" | "unknown";
  currency: "USD";
  annualRegistrationMinor: number | null;
  renewalPriceMinor: number | null;
  regularAnnualRegistrationMinor: number | null;
  minRegistrationYears: number | null;
  firstYearPromo: boolean | null;
  premium: boolean | null;
  /** Explicitly excludes unknown tax/fees/addons. Null when promo duration arithmetic is unsupported. */
  minimumRegistrationSubtotalMinor: number | null;
  taxTreatment: "unknown";
  feesTreatment: "unknown";
  mandatoryAddOns: "unknown";
  renewalTermYears: null;
}
export function canonicalTradingRegistrarDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase().replace(/\.$/u, "");
  if (candidate.length > 253 || !/^[a-z0-9.-]+$/u.test(candidate) || candidate.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-") || label.startsWith("xn--"))) return null;
  const result = parse(candidate, { allowPrivateDomains: true });
  return result.isIcann && !result.isPrivate && result.domain === candidate ? candidate : null;
}
export function registrarRegistrationSubtotal(value: Pick<TradingRegistrarEvidence, "annualRegistrationMinor" | "regularAnnualRegistrationMinor" | "minRegistrationYears" | "firstYearPromo">): number | null {
  const { annualRegistrationMinor: annual, minRegistrationYears: years, firstYearPromo: promo } = value;
  if (annual === null || years === null) return null;
  if (years === 1) return annual;
  if (promo === false) return annual * years;
  // The check response does not define how first-year offers compose with a multi-year commitment.
  return null;
}
const fields = new Set(["version", "provider", "method", "domain", "sourceUrl", "status", "reason", "checkedAt", "expiresAt", "availability", "currency",
  "annualRegistrationMinor", "renewalPriceMinor", "regularAnnualRegistrationMinor", "minRegistrationYears", "firstYearPromo", "premium",
  "minimumRegistrationSubtotalMinor", "taxTreatment", "feesTreatment", "mandatoryAddOns", "renewalTermYears"]);
const amount = (value: unknown, maximum = 100_000_000_000): boolean => value === null || Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const iso = (value: unknown): value is string => typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function isTradingRegistrarEvidence(value: unknown): value is TradingRegistrarEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.size || Object.keys(row).some(key => !fields.has(key))
    || row.version !== 1 || row.provider !== "porkbun" || row.method !== "official_registrar_api" || typeof row.domain !== "string"
    || (row.domain !== "" && canonicalTradingRegistrarDomain(row.domain) !== row.domain)
    || row.sourceUrl !== TRADING_REGISTRAR_ENDPOINT + row.domain
    || !["checked", "unknown", "disabled"].includes(String(row.status)) || !TRADING_REGISTRAR_REASONS.includes(row.reason as TradingRegistrarReason)
    || !iso(row.checkedAt) || !iso(row.expiresAt) || Date.parse(row.expiresAt) - Date.parse(row.checkedAt) !== TRADING_REGISTRAR_MAX_AGE_MS
    || !["available", "unavailable", "unknown"].includes(String(row.availability)) || row.currency !== "USD"
    || !amount(row.annualRegistrationMinor) || !amount(row.renewalPriceMinor) || !amount(row.regularAnnualRegistrationMinor)
    || !amount(row.minimumRegistrationSubtotalMinor, 1_000_000_000_000)
    || !(row.minRegistrationYears === null || Number.isInteger(row.minRegistrationYears) && Number(row.minRegistrationYears) >= 1 && Number(row.minRegistrationYears) <= 10)
    || !(row.firstYearPromo === null || typeof row.firstYearPromo === "boolean") || !(row.premium === null || typeof row.premium === "boolean")
    || row.taxTreatment !== "unknown" || row.feesTreatment !== "unknown" || row.mandatoryAddOns !== "unknown" || row.renewalTermYears !== null) return false;
  if (row.status === "checked") return row.reason === "registrar_checked" && row.domain !== "" && row.availability !== "unknown"
    && row.minimumRegistrationSubtotalMinor === registrarRegistrationSubtotal(row as unknown as TradingRegistrarEvidence);
  if (row.status === "disabled" ? row.reason !== "disabled" : ["disabled", "registrar_checked"].includes(String(row.reason))) return false;
  return (row.domain !== "" || row.reason === "invalid_domain") && row.availability === "unknown"
    && ["annualRegistrationMinor", "renewalPriceMinor", "regularAnnualRegistrationMinor", "minRegistrationYears", "firstYearPromo", "premium", "minimumRegistrationSubtotalMinor"].every(key => row[key] === null);
}

/** Only the server may provide this observed evidence. No lost-domain absence is converted to availability. */
export function registrarAcquisitionEvidence(evidence: TradingRegistrarEvidence | null | undefined): Pick<TradingAcquisitionInput, "registrability" | "quote"> {
  if (!isTradingRegistrarEvidence(evidence) || evidence.status !== "checked") return {};
  const observation = { domain: evidence.domain, providerId: evidence.provider, sourceUrl: evidence.sourceUrl,
    checkedAt: evidence.checkedAt, expiresAt: evidence.expiresAt, method: evidence.method };
  const unknown = { treatment: "unknown" as const, initialMinor: null, renewalMinor: null };
  return { registrability: { ...observation, status: evidence.availability }, quote: {
    ...observation, quoteId: `porkbun-observation:${Date.parse(evidence.checkedAt)}`, scope: "exact_domain", currency: evidence.currency,
    acquisitionMinor: evidence.minimumRegistrationSubtotalMinor, renewalMinor: evidence.renewalPriceMinor,
    initialTermYears: evidence.minRegistrationYears, renewalTermYears: null, fees: unknown, tax: unknown, mandatoryAddOns: unknown } };
}

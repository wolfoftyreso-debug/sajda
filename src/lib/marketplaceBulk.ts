import type { MarketplaceCurrency } from "./marketplaceListings";
import { normalizeMarketplaceApexDomain } from "./marketplaceDomain";

/**
 * The importer deliberately stops at one hundred non-empty rows. Keeping the
 * cap here (rather than only in the UI) makes the same safety limit apply to
 * every future bulk-listing surface.
 */
export const MARKETPLACE_BULK_LISTING_LIMIT = 100;

const MAX_DESCRIPTION_LENGTH = 1_400;
const MAX_ASKING_PRICE = 1_000_000_000;
const CURRENCIES = new Set<MarketplaceCurrency>(["USD", "SEK", "EUR"]);

export type MarketplaceBulkListingErrorCode =
  | "invalid-domain"
  | "invalid-price"
  | "invalid-currency"
  | "invalid-format"
  | "duplicate-domain"
  | "description-too-long"
  | "limit-exceeded";

export interface MarketplaceBulkListingDraft {
  /** One-based textarea line number, so the UI can point to the source row. */
  lineNumber: number;
  /** The original non-empty line, useful in confirmations and error recovery. */
  raw: string;
  domain: string;
  /** Omitted when the seller used the short `domain` form. */
  askingPrice?: number;
  /** Defaults to USD unless the row or parser options specify another currency. */
  currency: MarketplaceCurrency;
  /** Optional per-domain detail from the pipe-delimited form. */
  description?: string;
}

export interface MarketplaceBulkListingError {
  /** One-based textarea line number. */
  lineNumber: number;
  raw: string;
  code: MarketplaceBulkListingErrorCode;
  message: string;
}

export interface ParseMarketplaceBulkListingsOptions {
  /** Applies when a row does not state USD, SEK, or EUR. Defaults to USD. */
  defaultCurrency?: MarketplaceCurrency;
  /** Can lower the limit for a particular UI, but can never exceed 100. */
  maxRows?: number;
}

export interface ParseMarketplaceBulkListingsResult {
  drafts: MarketplaceBulkListingDraft[];
  errors: MarketplaceBulkListingError[];
  /** Number of non-empty rows found before the cap was applied. */
  rowCount: number;
  /** Number of valid rows ready for the listing creation layer. */
  acceptedCount: number;
  /** Effective cap after applying the built-in maximum. */
  maxRows: number;
}

interface ParsedColumns {
  domain: string;
  askingPrice?: number;
  currency: MarketplaceCurrency;
  description?: string;
}

interface ParseFailure {
  code: MarketplaceBulkListingErrorCode;
  message: string;
}

function isMarketplaceCurrency(value: string): value is MarketplaceCurrency {
  return CURRENCIES.has(value as MarketplaceCurrency);
}

function effectiveMaxRows(value: number | undefined): number {
  if (!Number.isFinite(value)) return MARKETPLACE_BULK_LISTING_LIMIT;
  return Math.min(
    MARKETPLACE_BULK_LISTING_LIMIT,
    Math.max(1, Math.floor(value ?? MARKETPLACE_BULK_LISTING_LIMIT)),
  );
}

function normalizedDefaultCurrency(value: MarketplaceCurrency | undefined): MarketplaceCurrency {
  return value && isMarketplaceCurrency(value) ? value : "USD";
}

/**
 * Converts a pasted registrable domain to Sajda's canonical marketplace form.
 * A protocol and a root trailing slash are harmless when people paste from a
 * browser; hostnames such as `www.example.com` and `shop.example.com` are
 * rejected rather than silently turning into a different transferable asset.
 */
export function normalizeMarketplaceDomain(value: string): string | null {
  return normalizeMarketplaceApexDomain(value);
}

function parseCurrency(value: string, fallback: MarketplaceCurrency): MarketplaceCurrency | ParseFailure {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return fallback;
  if (isMarketplaceCurrency(normalized)) return normalized;
  return {
    code: "invalid-currency",
    message: "Use USD, SEK, or EUR for the currency.",
  };
}

/**
 * Accepts common human price notation without accepting mathematical syntax.
 * Examples: 1200, 1,200, 1 200, 1.200,50, and 1,200.50.
 */
export function parseMarketplaceAskingPrice(value: string): number | null {
  const compact = value.trim().replace(/[\s\u00a0]/g, "");
  if (!compact) return null;
  if (!/^[0-9][0-9.,]*$/.test(compact)) return null;

  const commaIndex = compact.lastIndexOf(",");
  const dotIndex = compact.lastIndexOf(".");
  const hasComma = commaIndex !== -1;
  const hasDot = dotIndex !== -1;
  let normalized: string;

  if (hasComma && hasDot) {
    const decimalIndex = Math.max(commaIndex, dotIndex);
    const integerPart = compact.slice(0, decimalIndex).replace(/[.,]/g, "");
    const fractionalPart = compact.slice(decimalIndex + 1);
    if (!integerPart || !/^\d+$/.test(integerPart) || !/^\d{1,2}$/.test(fractionalPart)) return null;
    normalized = `${integerPart}.${fractionalPart}`;
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = compact.split(separator);
    if (parts.some((part) => !/^\d+$/.test(part))) return null;

    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else if (parts.length >= 2 && parts.slice(1).every((part) => part.length === 3)) {
      normalized = parts.join("");
    } else if (parts.length >= 3 && parts.at(-1)!.length <= 2 && parts.slice(1, -1).every((part) => part.length === 3)) {
      normalized = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    } else {
      return null;
    }
  } else {
    normalized = compact;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_ASKING_PRICE) return null;
  return parsed;
}

function parsePipeColumns(value: string, fallbackCurrency: MarketplaceCurrency): ParsedColumns | ParseFailure {
  const parts = value.split("|").map((part) => part.trim());
  const domain = normalizeMarketplaceDomain(parts[0] ?? "");
  if (!domain) {
    return { code: "invalid-domain", message: "Enter a complete domain, for example saida.dev." };
  }

  const priceSource = parts[1] ?? "";
  const askingPrice = priceSource ? parseMarketplaceAskingPrice(priceSource) : undefined;
  if (priceSource && !askingPrice) {
    return { code: "invalid-price", message: "Enter a positive price up to 1,000,000,000." };
  }

  const currency = parseCurrency(parts[2] ?? "", fallbackCurrency);
  if (typeof currency !== "string") return currency;

  const description = parts.slice(3).join("|").trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      code: "description-too-long",
      message: "Keep each description to 1,400 characters or fewer.",
    };
  }

  return {
    domain,
    ...(askingPrice ? { askingPrice } : {}),
    currency,
    ...(description ? { description } : {}),
  };
}

function parseCommaColumns(value: string, fallbackCurrency: MarketplaceCurrency): ParsedColumns | ParseFailure {
  const parts = value.split(",").map((part) => part.trim());
  const domain = normalizeMarketplaceDomain(parts.shift() ?? "");
  if (!domain) {
    return { code: "invalid-domain", message: "Enter a complete domain, for example saida.dev." };
  }

  if (parts.length === 0) return { domain, currency: fallbackCurrency };

  let currency = fallbackCurrency;
  const trailingValue = parts.at(-1) ?? "";
  if (/^[a-z]{3}$/i.test(trailingValue)) {
    const parsedCurrency = parseCurrency(trailingValue, fallbackCurrency);
    if (typeof parsedCurrency !== "string") return parsedCurrency;
    currency = parsedCurrency;
    parts.pop();
  }

  const priceSource = parts.join(",").trim();
  const askingPrice = parseMarketplaceAskingPrice(priceSource);
  if (!askingPrice) {
    return {
      code: "invalid-format",
      message: "Use domain, price, currency — or use pipes to include a description.",
    };
  }

  return { domain, askingPrice, currency };
}

function parseLine(value: string, fallbackCurrency: MarketplaceCurrency): ParsedColumns | ParseFailure {
  return value.includes("|")
    ? parsePipeColumns(value, fallbackCurrency)
    : parseCommaColumns(value, fallbackCurrency);
}

/**
 * Parses spreadsheet-style input without creating listings. This lets the UI
 * show an accurate review state before it writes either local drafts or
 * seller-owned records to the marketplace service.
 */
export function parseMarketplaceBulkListings(
  input: string,
  options: ParseMarketplaceBulkListingsOptions = {},
): ParseMarketplaceBulkListingsResult {
  const maxRows = effectiveMaxRows(options.maxRows);
  const fallbackCurrency = normalizedDefaultCurrency(options.defaultCurrency);
  const rows = input
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), lineNumber: index + 1 }))
    .filter((row) => row.raw.length > 0);
  const drafts: MarketplaceBulkListingDraft[] = [];
  const errors: MarketplaceBulkListingError[] = [];
  const seenDomains = new Set<string>();

  rows.forEach((row, index) => {
    if (index >= maxRows) {
      errors.push({
        lineNumber: row.lineNumber,
        raw: row.raw,
        code: "limit-exceeded",
        message: `Only ${maxRows} listings can be imported at once.`,
      });
      return;
    }

    const parsed = parseLine(row.raw, fallbackCurrency);
    if ("code" in parsed) {
      errors.push({ lineNumber: row.lineNumber, raw: row.raw, ...parsed });
      return;
    }

    if (seenDomains.has(parsed.domain)) {
      errors.push({
        lineNumber: row.lineNumber,
        raw: row.raw,
        code: "duplicate-domain",
        message: `${parsed.domain} appears more than once in this import.`,
      });
      return;
    }

    seenDomains.add(parsed.domain);
    drafts.push({ lineNumber: row.lineNumber, raw: row.raw, ...parsed });
  });

  return {
    drafts,
    errors,
    rowCount: rows.length,
    acceptedCount: drafts.length,
    maxRows,
  };
}

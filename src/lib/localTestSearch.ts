import { getAnonymousSearchEndpoint, isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { productFetch } from "./productFetch";
import type { RegistrarOffer } from "@/lib/registrarOffer";
import { translate, type Language } from "@/i18n/LanguageProvider";
import type { AdvancedSearchCriteria } from "@/lib/advancedSearchCriteria";

/**
 * Stable API identifiers for the four basic creative-search cards. They stay
 * deliberately separate from advanced `criteria.nameStyle`, which has its own
 * explicit contract.
 */
export type AnonymousCreativeMode = "light" | "medium" | "heavy" | "deep";

export interface AnonymousSearchResult {
  domain: string;
  tld: string;
  status: "available" | "taken" | "unknown";
  checkMethod: "rdap" | "whois" | "das" | "none";
  source: string;
  authoritative: boolean;
  error?: string;
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  /** Heuristic naming quality, never a valuation or availability probability. */
  namingScore?: number;
  rankingPosition?: number;
  rationale: string;
  registrarOffer?: RegistrarOffer;
  registrarOffers?: RegistrarOffer[];
}

export interface AnonymousBriefAnalysis {
  mode?: "ai" | "local";
  summary?: string;
  keywords: string[];
  concepts: string[];
}

export interface AnonymousSearchResponse {
  results: AnonymousSearchResult[];
  briefAnalysis?: AnonymousBriefAnalysis;
  /** Present when the server applied a basic creative-search mode. */
  creativeMode?: AnonymousCreativeMode;
}

export interface AnonymousSearchOptions {
  /** Cancelling a search cancels the actual request, not just its UI. */
  signal?: AbortSignal;
  advanced?: boolean;
  brief?: string;
  criteria?: AdvancedSearchCriteria;
  /** Explicit names are registry checks, not creative generation themes. */
  domains?: string[];
  /** Provider IDs are an API-ready preference, not an availability source. */
  providers?: string[];
  /**
   * Swipe asks the server for a fresh, short-name deck. The server remains
   * responsible for generation and registry verification; these flags only
   * describe the requested deck shape.
   */
  swipe?: boolean;
  minLength?: number;
  maxLength?: number;
  /** The selected basic creative-search card. */
  creativeMode?: AnonymousCreativeMode;
}

const REQUEST_TIMEOUT_MS = 60_000;

export async function runAnonymousSearch(
  tlds: string[],
  count: number,
  theme: string,
  language: Language = "en",
  options: AnonymousSearchOptions = {},
): Promise<AnonymousSearchResponse> {
  if (!isAnonymousSearchMode()) {
    throw new Error(translate(language, "toast.activeSearch"));
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await productFetch(getAnonymousSearchEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tlds,
        count,
        theme,
        locale: language,
        advanced: options.advanced === true,
        brief: options.advanced === true ? options.brief?.trim() || "" : undefined,
        criteria: options.advanced === true ? options.criteria : undefined,
        domains: options.domains?.length ? options.domains.slice(0, 12) : undefined,
        providers: options.providers,
        swipe: options.swipe === true,
        minLength: options.swipe === true ? options.minLength : undefined,
        maxLength: options.swipe === true ? options.maxLength : undefined,
        creativeMode: options.creativeMode,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      results?: unknown;
      briefAnalysis?: unknown;
      analysis?: unknown;
      creativeMode?: unknown;
    };
    if (!response.ok) throw new Error(payload.error || translate(language, "toast.searchFailed"));
    if (!Array.isArray(payload.results)) throw new Error(translate(language, "toast.invalidResponse"));
    return {
      results: payload.results.filter(isAnonymousSearchResult),
      briefAnalysis: normaliseBriefAnalysis(payload.briefAnalysis ?? payload.analysis),
      creativeMode: normaliseCreativeMode(payload.creativeMode),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(translate(language, "toast.registryTimeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}

function normaliseCreativeMode(value: unknown): AnonymousCreativeMode | undefined {
  return value === "light" || value === "medium" || value === "heavy" || value === "deep"
    ? value
    : undefined;
}

function normaliseBriefAnalysis(value: unknown): AnonymousBriefAnalysis | undefined {
  if (typeof value === "string") {
    const summary = value.trim();
    return summary ? { summary, keywords: [], concepts: [] } : undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const analysis = value as {
    mode?: unknown;
    summary?: unknown;
    text?: unknown;
    keywords?: unknown;
    extractedKeywords?: unknown;
    concepts?: unknown;
    themes?: unknown;
    creativeDirections?: unknown;
  };
  const summary = typeof analysis.summary === "string"
    ? analysis.summary.trim()
    : typeof analysis.text === "string"
      ? analysis.text.trim()
      : "";
  const mode = analysis.mode === "ai" || analysis.mode === "local" ? analysis.mode : undefined;
  const normaliseItems = (items: unknown): string[] => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 12)
    : [];
  const keywords = normaliseItems(analysis.keywords ?? analysis.extractedKeywords ?? analysis.themes);
  const concepts = normaliseItems(analysis.concepts ?? analysis.creativeDirections ?? analysis.themes);

  return summary || keywords.length || concepts.length ? { mode, summary: summary || undefined, keywords, concepts } : undefined;
}

function isAnonymousSearchResult(value: unknown): value is AnonymousSearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AnonymousSearchResult>;
  return typeof result.domain === "string"
    && typeof result.tld === "string"
    && (result.status === "available" || result.status === "taken" || result.status === "unknown")
    && (result.checkMethod === "rdap" || result.checkMethod === "whois" || result.checkMethod === "das" || result.checkMethod === "none")
    && typeof result.source === "string"
    && typeof result.authoritative === "boolean"
    && typeof result.registrarPrice === "number"
    && typeof result.estimatedValue === "number"
    && typeof result.confidenceScore === "number"
    && typeof result.rationale === "string";
}

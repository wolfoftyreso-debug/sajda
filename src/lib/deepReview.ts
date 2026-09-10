import type { Language } from "@/i18n/LanguageProvider";
import { productFetch } from "./productFetch";
import { rankReviewCandidates, type ReviewScoreBreakdown } from "../../api/_shared/deep-review-ranking";

/**
 * A deliberately narrow Top 10 contract. Availability and price are input
 * facts from the already-completed search; this layer never claims to verify
 * either of them itself.
 */
export interface DeepReviewCandidate {
  domain: string;
  tld?: string;
  status: "available" | "checking" | "taken" | "unknown";
  availabilityVerified: boolean;
  checkMethod: "rdap" | "whois" | "das" | "dns" | "none" | "error";
  confidenceScore: number;
  namingScore?: number;
  rankingPosition?: number;
  priceVerified?: boolean;
  registrarOffer?: { priceVerified?: boolean };
}

export type DeepReviewScoreBreakdown = ReviewScoreBreakdown;

export interface DeepReviewEntry {
  rank: number;
  domain: string;
  score: number;
  scoreBreakdown: DeepReviewScoreBreakdown;
  /** A short, visible editorial observation. Never internal reasoning. */
  editorialNote?: string;
}

export type DeepReviewAnalysisSource = "local" | "ai";

export interface DeepReviewResult {
  reviewedAt: string;
  reviewedCount: number;
  analysisSource: DeepReviewAnalysisSource;
  top10: DeepReviewEntry[];
}

const AUTHORITATIVE_METHODS = new Set<DeepReviewCandidate["checkMethod"]>(["rdap", "whois", "das"]);

export function isDeepReviewCandidate(candidate: DeepReviewCandidate): boolean {
  return candidate.status === "available"
    && candidate.availabilityVerified === true
    && AUTHORITATIVE_METHODS.has(candidate.checkMethod)
    && isValidDomain(candidate.domain);
}

function isValidDomain(domain: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(?:[a-z]{2,24})$/i.test(domain.trim());
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function hasVerifiedPrice(candidate: DeepReviewCandidate): boolean {
  return candidate.priceVerified === true || candidate.registrarOffer?.priceVerified === true;
}

export function rankDeepReviewCandidates(
  candidates: DeepReviewCandidate[],
  theme = "",
  analysisSource: DeepReviewAnalysisSource = "local",
): DeepReviewResult {
  const uniqueCandidates = new Map<string, DeepReviewCandidate>();
  for (const candidate of candidates) {
    if (!isDeepReviewCandidate(candidate)) continue;
    const domain = normalizeDomain(candidate.domain);
    if (!uniqueCandidates.has(domain)) uniqueCandidates.set(domain, { ...candidate, domain });
  }

  const top10 = rankReviewCandidates(Array.from(uniqueCandidates.values(), (candidate) => ({
    ...candidate,
    priceVerified: hasVerifiedPrice(candidate),
  })), theme);

  return {
    reviewedAt: new Date().toISOString(),
    reviewedCount: uniqueCandidates.size,
    analysisSource,
    top10,
  };
}

function isScoreBreakdown(value: unknown): value is DeepReviewScoreBreakdown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const limits = { readability: 60, relevance: 12, extensionFit: 8, registryEvidence: 10, priceClarity: 5, searchSignal: 5 };
  return Object.entries(limits).every(([key, limit]) =>
    typeof record[key] === "number" && Number.isInteger(record[key]) && record[key] >= 0 && record[key] <= limit);
}

function isDeepReviewResult(value: unknown, permittedDomains: Set<string>): value is DeepReviewResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const seen = new Set<string>();
  return typeof record.reviewedAt === "string"
    && Number.isFinite(Date.parse(record.reviewedAt))
    && Number.isInteger(record.reviewedCount)
    && record.reviewedCount === permittedDomains.size
    && (record.analysisSource === "local" || record.analysisSource === "ai")
    && Array.isArray(record.top10)
    && record.top10.length === Math.min(10, permittedDomains.size)
    && record.top10.every((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const item = entry as Record<string, unknown>;
      const valid = item.rank === index + 1
        && typeof item.domain === "string"
        && permittedDomains.has(item.domain)
        && !seen.has(item.domain)
        && typeof item.score === "number" && Number.isInteger(item.score) && item.score >= 0 && item.score <= 100
        && isScoreBreakdown(item.scoreBreakdown)
        && item.score === Object.values(item.scoreBreakdown).reduce((sum, score) => sum + score, 0)
        && (item.editorialNote === undefined || (typeof item.editorialNote === "string" && item.editorialNote.trim().length > 0 && item.editorialNote.length <= 180));
      if (valid) seen.add(item.domain as string);
      return valid;
    });
}

export async function runDeepReview(
  candidates: DeepReviewCandidate[],
  theme: string,
  language: Language,
): Promise<DeepReviewResult> {
  const reviewable = candidates.filter(isDeepReviewCandidate).slice(0, 50);
  if (reviewable.length === 0) return rankDeepReviewCandidates([], theme);

  const controller = new AbortController();
  // Allow the server's OIDC + durable quota + bounded model call to finish.
  // The Vercel ceiling is 20s; a failed/slow request still has a local fallback.
  const timeout = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await productFetch("/api/deep-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: language,
        theme: theme.trim().slice(0, 100),
        candidates: reviewable.map((candidate) => ({
          domain: candidate.domain,
          status: candidate.status,
          availabilityVerified: candidate.availabilityVerified,
          checkMethod: candidate.checkMethod,
          confidenceScore: candidate.confidenceScore,
          namingScore: candidate.namingScore,
          rankingPosition: candidate.rankingPosition,
          priceVerified: hasVerifiedPrice(candidate),
        })),
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.ok && isDeepReviewResult(payload, new Set(reviewable.map(candidate => normalizeDomain(candidate.domain))))) return payload;
    if (response.status >= 400 && response.status < 500) {
      const message = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string"
        ? (payload as Record<string, unknown>).error as string
        : "Deep Review could not validate these candidates.";
      const requestError = new Error(message);
      requestError.name = "DeepReviewRequestError";
      throw requestError;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "DeepReviewRequestError") throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  // A network or optional-AI failure never blocks the transparent local
  // shortlist. No external data is silently substituted in this fallback.
  return rankDeepReviewCandidates(reviewable, theme, "local");
}

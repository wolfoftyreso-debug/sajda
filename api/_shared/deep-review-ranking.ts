import { asciiNameToken, nameQualitySignals } from "./search-quality.mjs";

export interface ReviewRankingCandidate {
  domain: string;
  namingScore?: number;
  rankingPosition?: number;
  priceVerified?: boolean;
}

export interface ReviewScoreBreakdown {
  readability: number;
  relevance: number;
  extensionFit: number;
  registryEvidence: number;
  priceClarity: number;
  searchSignal: number;
}

export interface ReviewRankedEntry {
  rank: number;
  domain: string;
  score: number;
  scoreBreakdown: ReviewScoreBreakdown;
  editorialNote?: string;
}

const GENERIC_PREFIXES = new Set(["", "my", "get", "try", "use", "go", "the", "hello"]);
const GENERIC_SUFFIXES = new Set(["", "io", "ai", "app", "lab", "labs", "nova", "hub", "pro", "online", "plus", "ly", "hq"]);

function rankPosition(candidate: ReviewRankingCandidate): number {
  return Number.isInteger(candidate.rankingPosition) && candidate.rankingPosition! >= 1 && candidate.rankingPosition! <= 50
    ? candidate.rankingPosition!
    : 51;
}

function familyKey(label: string, tokens: string[]): string {
  // Generic wrappers do not constitute a new idea. Semantic compounds such
  // as kaffehus and kaffeglimt remain separate, even for the theme "kaffe".
  for (const token of tokens) {
    const index = label.indexOf(token);
    if (index < 0) continue;
    if (GENERIC_PREFIXES.has(label.slice(0, index)) && GENERIC_SUFFIXES.has(label.slice(index + token.length))) return token;
  }
  return label;
}

/**
 * Shared by the API and offline fallback. A 100-point shortlist heuristic,
 * not an availability check, semantic model, valuation or purchase advice.
 * Quality dominates keyword repetition; registry/price facts are minor
 * evidence signals. Recompute the naming score with the search engine's
 * pure helper rather than trusting an arbitrary browser-supplied number.
 */
export function rankReviewCandidates(candidates: ReviewRankingCandidate[], theme: string): ReviewRankedEntry[] {
  const tokens = [...new Set((theme.match(/[\p{L}\p{N}]+/gu) ?? []).map(asciiNameToken).filter((token) => token.length >= 3))].slice(0, 8);
  const ranked = candidates.map((candidate) => {
    const [label, tld] = candidate.domain.split(".");
    const computedScore = nameQualitySignals(label).score;
    const namingScore = candidate.namingScore === computedScore ? candidate.namingScore : computedScore;
    const exact = tokens.some((token) => token === label);
    const contained = tokens.some((token) => label.includes(token) || token.includes(label));
    const related = tokens.some((token) => token.length >= 5 && label.includes(token.slice(0, 5)));
    const position = rankPosition(candidate);
    const scoreBreakdown: ReviewScoreBreakdown = {
      readability: Math.round(namingScore * 0.6),
      relevance: !tokens.length ? 6 : exact ? 12 : contained ? 10 : related ? 8 : 3,
      // No blanket .com advantage over a relevant local extension.
      extensionFit: ["com", "se", "nu", "dev", "ai", "app", "io", "net", "org"].includes(tld) ? 8 : 6,
      registryEvidence: 10,
      priceClarity: candidate.priceVerified === true ? 5 : 0,
      searchSignal: position <= 50 ? Math.max(1, 5 - Math.floor((position - 1) / 10)) : 0,
    };
    return {
      domain: candidate.domain,
      label,
      family: familyKey(label, tokens),
      position,
      score: Object.values(scoreBreakdown).reduce((total, value) => total + value, 0),
      scoreBreakdown,
    };
  });
  const selected: ReviewRankedEntry[] = [];
  const familyCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  while (ranked.length && selected.length < 10) {
    const priority = (entry: typeof ranked[number]) => entry.score
      - (familyCounts.get(entry.family) ?? 0) * 8
      - (labelCounts.get(entry.label) ?? 0) * 12;
    ranked.sort((a, b) => priority(b) - priority(a) || b.score - a.score
      || a.position - b.position || a.label.length - b.label.length || a.domain.localeCompare(b.domain));
    const entry = ranked.shift()!;
    familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
    selected.push({ rank: selected.length + 1, domain: entry.domain, score: entry.score, scoreBreakdown: entry.scoreBreakdown });
  }
  return selected;
}

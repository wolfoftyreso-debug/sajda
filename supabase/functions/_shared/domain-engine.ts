/**
 * Deterministic candidate and screening engine.
 *
 * It deliberately does not claim to know a resale price.  The result is a
 * repeatable prioritisation signal that remains available when no cloud AI
 * service is configured.  Actual availability must always be confirmed by
 * RDAP or a registrar, and actual market value needs comparable sales data.
 */

export const ALGORITHM_VERSION = "2.0.0";

export interface GeneratedCandidatesOptions {
  tlds: string[];
  count?: number;
  theme?: string;
  iteration?: number;
}

export interface ValuationSignals {
  labelLength: number;
  lengthScore: number;
  tldScore: number;
  pronounceabilityScore: number;
  dictionaryScore: number;
  commercialScore: number;
  penalties: number;
}

export interface DomainValuation {
  domain: string;
  estimatedValue: number;
  confidenceScore: number;
  rationale: string;
  algorithmVersion: string;
  signals: ValuationSignals;
}

const MAX_CANDIDATES = 100;
const MAX_TLDS = 8;

const REGISTRATION_PRICE_ESTIMATES_USD: Record<string, number> = {
  com: 12,
  net: 14,
  org: 13,
  io: 45,
  ai: 75,
  co: 28,
  dev: 18,
  app: 18,
  se: 16,
  nu: 18,
  me: 20,
  info: 18,
};

const TLD_SCORES: Record<string, number> = {
  com: 18,
  ai: 15,
  io: 13,
  co: 11,
  dev: 9,
  app: 8,
  se: 9,
  org: 7,
  net: 6,
  nu: 5,
  me: 5,
  info: 2,
};

const MARKET_BASELINES_USD: Record<string, number> = {
  com: 120,
  ai: 85,
  io: 70,
  co: 55,
  dev: 50,
  app: 45,
  se: 38,
  org: 34,
  net: 30,
  nu: 24,
  me: 25,
  info: 18,
};

// Short, deliberately curated roots. They are used as building blocks rather
// than as a claimed dictionary or availability dataset.
const GLOBAL_ROOTS = [
  "aero", "arc", "atlas", "aurora", "axis", "bloom", "brio", "cirra",
  "coda", "coral", "craft", "delta", "drift", "echo", "ember", "fable",
  "flux", "forge", "glint", "harbor", "helio", "horizon", "juniper",
  "kite", "lumen", "mosaic", "nexus", "nova", "orbit", "pivot", "prism",
  "pulse", "quest", "rally", "ridge", "signal", "solace", "spark", "summit",
  "terra", "tidal", "vector", "verve", "vista", "vivid", "zenith",
];

const SWEDISH_ROOTS = [
  "ande", "arv", "berg", "brisa", "bygd", "dalen", "driva", "eko",
  "form", "fram", "glimt", "gron", "hem", "klar", "kust", "lagom",
  "ljus", "mark", "nord", "plats", "ro", "saga", "skog", "sol", "spira",
  "stig", "trygg", "varde", "vax", "vind", "viva",
];

const PREFIXES = [
  "alta", "aura", "brio", "civo", "claro", "evo", "faro", "lumo",
  "nivo", "nova", "oro", "pico", "sora", "vela", "vero",
];

const SUFFIXES = [
  "base", "craft", "flow", "forge", "grid", "labs", "link", "loop",
  "nest", "pilot", "point", "scope", "stack", "studio", "works", "zone",
];

const COMMERCIAL_SUFFIXES = new Set([
  "base", "craft", "flow", "forge", "grid", "lab", "labs", "link", "loop",
  "nest", "pilot", "point", "scope", "stack", "studio", "works", "zone",
]);

const KNOWN_WORDS = new Set([
  ...GLOBAL_ROOTS,
  ...SWEDISH_ROOTS,
  "app", "art", "bank", "book", "brand", "care", "code", "data", "design",
  "fin", "food", "home", "idea", "life", "mind", "name", "pay", "shop",
  "tech", "web", "work",
]);

const STOP_WORDS = new Set([
  "and", "are", "for", "from", "med", "och", "som", "the", "that", "this",
  "till", "with", "your", "domain", "domains", "namn", "name", "premium",
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function asciiToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Reads an array from a documented JSON response envelope. Keeping this small
 * boundary explicit prevents callers from accidentally treating
 * `{ valuations: [...] }` as the array itself.
 */
export function arrayFromEnvelope<T>(payload: unknown, property: string): T[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const value = (payload as Record<string, unknown>)[property];
  return Array.isArray(value) ? value as T[] : [];
}

function makeSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function labelFromDomain(domain: string): string {
  return domain.split(".").slice(0, -1).join(".");
}

export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed)) return null;

  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!withoutProtocol) return null;

  try {
    // URL.hostname performs IDNA conversion, keeping registrar/RDAP requests
    // canonical while permitting an operator to paste Unicode domains.
    const hostname = new URL(`http://${withoutProtocol}`).hostname.toLowerCase();
    const labels = hostname.split(".");

    // The product currently supports a selected, single-label TLD ("name.se"
    // rather than a registrar-specific public suffix such as "name.co.uk").
    // Rejecting extra labels avoids silently checking a different domain.
    if (labels.length !== 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

export function normalizeTlds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const tlds = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    // Validate before normalising. Stripping arbitrary characters would turn
    // malformed input (for example "bad tld") into a different TLD.
    .filter((value) => /^\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
    .map((value) => value.replace(/^\./, ""));

  return unique(tlds).slice(0, MAX_TLDS);
}

export function clampCandidateCount(value: unknown, fallback = 40): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? clamp(Math.trunc(numeric), 1, MAX_CANDIDATES) : fallback;
}

export function getTld(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] || "";
}

export function getRegistrationPriceEstimate(domain: string): number {
  return REGISTRATION_PRICE_ESTIMATES_USD[getTld(domain)] ?? 18;
}

function themeTokens(theme?: string): string[] {
  if (!theme) return [];

  return unique(
    theme
      .split(/[\s,;:/|+]+/)
      .map(asciiToken)
      .filter((token) => token.length >= 3 && token.length <= 14 && !STOP_WORDS.has(token)),
  ).slice(0, 12);
}

function validLabel(label: string): boolean {
  return label.length >= 3 && label.length <= 25 && /^[a-z0-9]+$/.test(label);
}

/**
 * Generates reproducible candidates for a scan iteration.  It does not use
 * random cloud-model output, which makes troubleshooting and regression tests
 * possible. Iteration changes the seed so subsequent scan pages differ.
 */
export function generateDomainCandidates(options: GeneratedCandidatesOptions): string[] {
  const tlds = normalizeTlds(options.tlds);
  const count = clampCandidateCount(options.count, 40);
  const iteration = Math.max(1, Math.trunc(options.iteration ?? 1));

  if (tlds.length === 0) return [];

  const theme = themeTokens(options.theme);
  const useSwedishRoots = tlds.some((tld) => tld === "se" || tld === "nu");
  const roots = unique([...theme, ...(useSwedishRoots ? SWEDISH_ROOTS : []), ...GLOBAL_ROOTS]);
  const random = seededRandom(makeSeed(`${tlds.join(",")}|${theme.join(",")}|${iteration}|${ALGORITHM_VERSION}`));
  const labels = new Set<string>();

  const addLabel = (candidate: string) => {
    const label = asciiToken(candidate);
    if (validLabel(label)) labels.add(label);
  };

  // Start with explicit topic words. They are useful for a focused search even
  // though availability must still be verified downstream.
  for (const token of theme) {
    addLabel(token);
    addLabel(`${token}${pick(SUFFIXES, random)}`);
    addLabel(`${pick(PREFIXES, random)}${token}`);
  }

  const attempts = Math.max(count * 30, 400);
  for (let attempt = 0; attempt < attempts && labels.size < count * 3; attempt += 1) {
    const root = pick(roots, random);
    const companion = pick(roots, random);
    const prefix = pick(PREFIXES, random);
    const suffix = pick(SUFFIXES, random);

    switch (attempt % 5) {
      case 0:
        addLabel(`${root}${suffix}`);
        break;
      case 1:
        addLabel(`${prefix}${root}`);
        break;
      case 2:
        addLabel(`${root.slice(0, 4)}${companion.slice(0, 4)}`);
        break;
      case 3:
        addLabel(`${root}${companion.slice(0, 3)}`);
        break;
      default:
        addLabel(`${prefix}${companion.slice(0, 5)}`);
        break;
    }
  }

  const generated: string[] = [];
  for (const label of labels) {
    for (const tld of tlds) {
      generated.push(`${label}.${tld}`);
      if (generated.length >= count) return generated;
    }
  }

  return generated;
}

function lengthScore(length: number): number {
  if (length <= 3) return 38;
  if (length === 4) return 32;
  if (length === 5) return 25;
  if (length === 6) return 18;
  if (length <= 8) return 12;
  if (length <= 10) return 7;
  if (length <= 12) return 3;
  return 0;
}

function scorePronounceability(label: string): number {
  const vowels = (label.match(/[aeiouy]/g) ?? []).length;
  const ratio = vowels / Math.max(label.length, 1);
  let score = ratio >= 0.25 && ratio <= 0.65 ? 7 : 2;

  if (!/[bcdfghjklmnpqrstvwxz]{4}/.test(label)) score += 3;
  if (!/(.)\1\1/.test(label)) score += 2;

  return score;
}

function scoreDictionaryHint(label: string): number {
  if (KNOWN_WORDS.has(label)) return 12;
  return KNOWN_WORDS.has(label.slice(0, 4)) || KNOWN_WORDS.has(label.slice(-4)) ? 5 : 0;
}

function scoreCommercialHint(label: string): number {
  for (const suffix of COMMERCIAL_SUFFIXES) {
    if (label.endsWith(suffix)) return 4;
  }
  return label.length <= 6 ? 2 : 0;
}

/**
 * A transparent market-screening score. No live sales database is implied.
 */
export function valueDomain(domainInput: unknown, registrationPrice?: unknown): DomainValuation | null {
  const domain = normalizeDomain(domainInput);
  if (!domain) return null;

  const label = labelFromDomain(domain);
  const tld = getTld(domain);
  const parsedPrice = typeof registrationPrice === "number" ? registrationPrice : Number(registrationPrice);
  const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : getRegistrationPriceEstimate(domain);

  const signals: ValuationSignals = {
    labelLength: label.length,
    lengthScore: lengthScore(label.length),
    tldScore: TLD_SCORES[tld] ?? 3,
    pronounceabilityScore: scorePronounceability(label),
    dictionaryScore: scoreDictionaryHint(label),
    commercialScore: scoreCommercialHint(label),
    penalties: 0,
  };

  if (label.includes("-") || /\d/.test(label)) signals.penalties -= 20;
  if (/(.)\1\1/.test(label)) signals.penalties -= 5;

  const totalScore = clamp(
    signals.lengthScore +
      signals.tldScore +
      signals.pronounceabilityScore +
      signals.dictionaryScore +
      signals.commercialScore +
      signals.penalties,
    0,
    100,
  );

  // The exponential curve rewards genuinely short, strong labels without
  // producing fabricated six-figure results for ordinary generated names.
  const baseline = MARKET_BASELINES_USD[tld] ?? 22;
  const estimatedValue = Math.round(
    clamp(baseline * Math.pow(1.075, Math.max(0, totalScore - 30)), price * 1.5, 50_000),
  );
  const confidenceScore = Math.round(
    clamp(
      28 + Math.min(20, totalScore * 0.28) + (signals.dictionaryScore > 0 ? 7 : 0) + (TLD_SCORES[tld] ? 4 : 0),
      25,
      75,
    ),
  );

  const reasons = [
    `${label.length} tecken`,
    `.${tld || "okänd"}`,
    signals.dictionaryScore > 0 ? "tydlig ordsignal" : "varumärkesbarhets-signal",
    signals.pronounceabilityScore >= 9 ? "uttalbar struktur" : "begränsad uttalbarhet",
  ];

  return {
    domain,
    estimatedValue,
    confidenceScore,
    rationale: `Algoritm ${ALGORITHM_VERSION}: ${reasons.join(", ")}. Värdet är en reproducerbar prioriteringssignal i USD, inte ett bekräftat marknadsvärde eller ett registrarpris; verifiera med aktuell försäljningsdata och registrar innan köp.`,
    algorithmVersion: ALGORITHM_VERSION,
    signals,
  };
}

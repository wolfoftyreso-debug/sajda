import { parse } from "tldts";

/** Editorial research rubric, not an appraisal, demand measurement or availability check. */
export const TRADING_MARKET_FIT_METHODOLOGY = "curated-name-fit-v1" as const;
export const TRADING_MARKET_FIT_WEIGHTS = Object.freeze({ meaning: 40, commercial: 25, readability: 20, tldFit: 15 });
export const TRADING_MARKET_SECTORS = ["software", "finance", "property", "travel", "retail", "health", "energy", "education", "business", "food", "media", "mobility"] as const;
export type TradingMarketSector = typeof TRADING_MARKET_SECTORS[number];
export const TRADING_BUYER_USE_CASES = ["software_product", "finance_comparison", "property_service", "travel_service", "retail_store", "wellness_service", "energy_service", "education_service", "business_service", "food_service", "creative_studio", "mobility_service"] as const;
export type TradingBuyerUseCase = typeof TRADING_BUYER_USE_CASES[number];
export const TRADING_MARKET_FIT_REASONS = [
  "exact_curated_word", "coherent_two_word_compound", "modifier_only", "unrelated_word_pair", "mixed_language_pair",
  "no_curated_meaning", "partial_word_only", "compact_label", "long_label", "hyphen_present", "digits_present",
  "repeated_word", "repeated_characters", "difficult_letter_sequence", "possible_dictionary_typo", "unverified_coined_name",
  "broad_commercial_extension", "swedish_language_extension", "sector_extension_fit", "extension_fit_unestablished",
  "internationalized_label_requires_review", "unsupported_domain", "heuristic_not_market_demand",
] as const;
export type TradingMarketFitReason = typeof TRADING_MARKET_FIT_REASONS[number];

export interface TradingMarketFit {
  version: 1;
  methodology: typeof TRADING_MARKET_FIT_METHODOLOGY;
  domain: string;
  score: number;
  tier: "strong" | "plausible" | "weak" | "unrated";
  pattern: "dictionary" | "compound" | "unrecognized" | "unsupported";
  language: "en" | "sv" | "mixed" | "unknown";
  tokens: string[];
  sectors: TradingMarketSector[];
  /** Exploratory applications suggested by the words, never identified or verified buyers. */
  buyerUseCases: TradingBuyerUseCase[];
  breakdown: Record<keyof typeof TRADING_MARKET_FIT_WEIGHTS, number> & { penalties: number };
  reasons: TradingMarketFitReason[];
}

type Language = "en" | "sv" | "both";
type Lexeme = { word: string; language: Language; sectors: readonly TradingMarketSector[]; role: "noun" | "modifier" | "connector" };
type Group = { words: string; language: Language; sectors: readonly TradingMarketSector[]; role?: Lexeme["role"] };

/*
 * The whole lexicon is intentionally present here for audit. It is a small editorial
 * vocabulary, not a general dictionary. Absence means this rubric has no evidence,
 * not that a word is meaningless. Entries/transliterations are explicit; there is no
 * stemming, language model, trend feed, search-volume or sale-price input.
 *
 * Two-word fit requires a shared sector, a sector-compatible modifier, or a generic
 * product connector. That is a naming hypothesis, not proof of idiomatic language.
 * Mixed-language compounds and repeated words receive no coherent-compound credit.
 */
const LEXICON_GROUPS: readonly Group[] = [
  { words: "cloud code coding data software server hosting cyber security automation analytics compute", language: "en", sectors: ["software"] },
  { words: "moln kod mjukvara dator", language: "sv", sectors: ["software"] },
  { words: "ai api", language: "both", sectors: ["software"] },
  { words: "bank budget capital credit finance fund funds invest investment investor loan loans mortgage payment payments savings wealth wallet insurance", language: "en", sectors: ["finance"] },
  { words: "bankkonto ekonomi kredit kapital fond fonder investering investerare spar sparande pengar forsakring", language: "sv", sectors: ["finance"] },
  { words: "invoice billing payroll accounting tax", language: "en", sectors: ["business", "finance", "software"] },
  { words: "faktura bokforing lon skatt", language: "sv", sectors: ["business", "finance", "software"] },
  { words: "home homes house housing property estate realty rent rental rentals mortgage", language: "en", sectors: ["property"] },
  { words: "hem hus bostad bostader fastighet fastigheter hyra maklare", language: "sv", sectors: ["property"] },
  { words: "travel trip trips hotel hotels booking bookings holiday holidays tours flight flights", language: "en", sectors: ["travel"] },
  { words: "resa resor hotell bokning semester flyg", language: "sv", sectors: ["travel"] },
  { words: "shop store retail sale deals commerce clothing fashion beauty garden gifts gift pet pets", language: "en", sectors: ["retail"] },
  { words: "butik handel klader mode skona present presenter hund katt", language: "sv", sectors: ["retail"] },
  { words: "health wellness fitness care clinic dental sleep therapy", language: "en", sectors: ["health"] },
  { words: "halsa vard tandvard klinik somn", language: "sv", sectors: ["health"] },
  { words: "solar energy power battery batteries electric charging climate", language: "en", sectors: ["energy"] },
  { words: "sol solenergi el energi elbil laddning batteri klimat", language: "sv", sectors: ["energy"] },
  { words: "panel panels", language: "en", sectors: ["energy"] },
  { words: "education learning learn course courses school schools tutor study book books", language: "en", sectors: ["education"] },
  { words: "utbildning larande kurs kurser skola skolor bok bocker", language: "sv", sectors: ["education"] },
  { words: "business office work jobs job hire hiring team teams legal lawyer law consulting service services support", language: "en", sectors: ["business"] },
  { words: "foretag kontor arbete jobb jurist juridik konsult tjanst", language: "sv", sectors: ["business"] },
  { words: "food meal meals kitchen coffee bakery cooking chef grocery groceries", language: "en", sectors: ["food"] },
  { words: "mat kok kaffe bageri kock matkasse", language: "sv", sectors: ["food"] },
  { words: "design media photo photos music video art creative content podcast", language: "en", sectors: ["media"] },
  { words: "foto musik konst innehall", language: "sv", sectors: ["media"] },
  { words: "bike bikes car cars auto motor transport cargo delivery logistics fleet", language: "en", sectors: ["mobility"] },
  { words: "bil bilar cykel cyklar leverans frakt logistik", language: "sv", sectors: ["mobility"] },
  { words: "digital smart secure", language: "en", sectors: ["software", "business", "energy", "mobility", "finance", "property", "health", "education"], role: "modifier" },
  { words: "green clean", language: "en", sectors: ["energy", "mobility", "property", "food"], role: "modifier" },
  { words: "local easy quick open bright", language: "en", sectors: ["business", "retail", "software", "travel", "education", "property", "food"], role: "modifier" },
  { words: "gron ren", language: "sv", sectors: ["energy", "mobility", "property", "food"], role: "modifier" },
  { words: "enkel snabb trygg lokal", language: "sv", sectors: ["business", "retail", "software", "travel", "education", "property", "food", "finance"], role: "modifier" },
  { words: "app apps tools hub guide market lab studio", language: "en", sectors: ["software", "business"], role: "connector" },
  { words: "verktyg guiden marknad portalen", language: "sv", sectors: ["software", "business"], role: "connector" },
];

const lexicon = new Map<string, Lexeme>();
for (const group of LEXICON_GROUPS) {
  for (const word of group.words.split(" ")) {
    const existing = lexicon.get(word);
    lexicon.set(word, { word, language: group.language, role: group.role ?? "noun",
      sectors: [...new Set([...(existing?.sectors ?? []), ...group.sectors])] });
  }
}

const USE_CASE_BY_SECTOR = Object.fromEntries(TRADING_MARKET_SECTORS.map((sector, index) => [sector, TRADING_BUYER_USE_CASES[index]])) as Record<TradingMarketSector, TradingBuyerUseCase>;
const SECTOR_EXTENSIONS: Readonly<Record<string, readonly TradingMarketSector[]>> = {
  ai: ["software"], app: ["software"], dev: ["software"], io: ["software"], tech: ["software"],
  shop: ["retail"], store: ["retail"], homes: ["property"], house: ["property"],
  finance: ["finance"], loans: ["finance"], money: ["finance"],
  energy: ["energy"], solar: ["energy"], health: ["health"], care: ["health"],
  academy: ["education"], education: ["education"], school: ["education"],
  travel: ["travel"], holiday: ["travel"], tours: ["travel"],
  design: ["media"], studio: ["media"], media: ["media"], photography: ["media"],
  food: ["food"], coffee: ["food"], kitchen: ["food"],
  business: ["business"], work: ["business"], jobs: ["business"],
  auto: ["mobility"], cars: ["mobility"], bike: ["mobility"],
};
const sortedSectors = (sectors: readonly TradingMarketSector[]): TradingMarketSector[] => TRADING_MARKET_SECTORS.filter(sector => sectors.includes(sector));

function wordLanguage(words: readonly Lexeme[]): TradingMarketFit["language"] {
  const languages = new Set(words.map(word => word.language).filter(language => language !== "both"));
  return languages.size > 1 ? "mixed" : languages.has("sv") ? "sv" : words.length ? "en" : "unknown";
}

function repeatedWord(first: Lexeme, second: Lexeme): boolean {
  return first.word === second.word || first.word + "s" === second.word || second.word + "s" === first.word
    || first.word + "es" === second.word || second.word + "es" === first.word;
}

function pairFit(first: Lexeme, second: Lexeme): { coherent: boolean; sectors: TradingMarketSector[] } {
  if (repeatedWord(first, second) || wordLanguage([first, second]) === "mixed" || second.role === "modifier") return { coherent: false, sectors: [] };
  const overlap = first.sectors.filter(sector => second.sectors.includes(sector));
  if (first.role === "modifier") return { coherent: overlap.length > 0, sectors: sortedSectors(overlap) };
  if (second.role === "connector" && first.role === "noun") return { coherent: true, sectors: sortedSectors(first.sectors) };
  return { coherent: overlap.length > 0, sectors: sortedSectors(overlap) };
}

function tokenize(label: string): Lexeme[] {
  const exact = lexicon.get(label);
  if (exact) return [exact];
  const segments = label.split("-");
  if (segments.length === 2 && segments.every(word => lexicon.has(word))) return segments.map(word => lexicon.get(word)!);
  if (segments.length !== 1) return [];
  const candidates: Lexeme[][] = [];
  for (let split = 2; split <= label.length - 2; split++) {
    const first = lexicon.get(label.slice(0, split)), second = lexicon.get(label.slice(split));
    if (first && second) candidates.push([first, second]);
  }
  // Prefer a sector-coherent split; stable lexicographic tie-breaking is auditable.
  return candidates.sort((a, b) => Number(pairFit(b[0], b[1]).coherent) - Number(pairFit(a[0], a[1]).coherent)
    || a[0].word.localeCompare(b[0].word, "en"))[0] ?? [];
}

/** One insertion/deletion/substitution or adjacent transposition; never a trademark test. */
function oneEditAway(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  if (a.length === b.length) {
    const different = [...a].map((letter, i) => letter === b[i] ? -1 : i).filter(i => i >= 0);
    return different.length === 1 || different.length === 2 && different[1] === different[0] + 1
      && a[different[0]] === b[different[1]] && a[different[1]] === b[different[0]];
  }
  const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
  let mismatch = 0;
  while (mismatch < shorter.length && shorter[mismatch] === longer[mismatch]) mismatch++;
  return shorter.slice(mismatch) === longer.slice(mismatch + 1);
}

function emptyResult(domain: string, reason: TradingMarketFitReason): TradingMarketFit {
  return { version: 1, methodology: TRADING_MARKET_FIT_METHODOLOGY, domain, score: 0, tier: "unrated", pattern: "unsupported", language: "unknown",
    tokens: [], sectors: [], buyerUseCases: [], breakdown: { meaning: 0, commercial: 0, readability: 0, tldFit: 0, penalties: 0 },
    reasons: [reason, "heuristic_not_market_demand"] };
}

/**
 * Pure, deterministic name research score. Supply a registrable ASCII domain, not a URL.
 * It never consumes registry/DNS status, contacts, price data or a generated-name model.
 * The 100-point scale is weighted rubric points, not a probability or sale prediction.
 */
export function analyzeTradingMarketFit(input: string): TradingMarketFit {
  if (typeof input !== "string" || input.length > 255) return emptyResult("", "unsupported_domain");
  const domain = input.trim().toLowerCase().replace(/\.$/u, "");
  if (domain.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain)
    || domain.split(".").some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))) return emptyResult("", "unsupported_domain");
  const parsed = parse(domain, { allowPrivateDomains: true });
  if (!parsed.isIcann || parsed.isPrivate || parsed.isIp || parsed.domain !== domain || !parsed.domainWithoutSuffix || !parsed.publicSuffix) return emptyResult("", "unsupported_domain");
  const label = parsed.domainWithoutSuffix, extension = parsed.publicSuffix;
  if (label.startsWith("xn--") || extension.split(".").some(part => part.startsWith("xn--"))) return emptyResult(domain, "internationalized_label_requires_review");
  const words = tokenize(label), language = wordLanguage(words), reasons: TradingMarketFitReason[] = [];
  const breakdown = { meaning: 0, commercial: 0, readability: 0, tldFit: 0, penalties: 0 };
  let sectors: TradingMarketSector[] = [];
  if (words.length === 1) {
    reasons.push("exact_curated_word");
    if (words[0].role === "modifier") {
      breakdown.meaning = 22; breakdown.commercial = 4; reasons.push("modifier_only");
    } else {
      breakdown.meaning = 40; breakdown.commercial = words[0].role === "connector" ? 18 : 25;
      sectors = sortedSectors(words[0].sectors);
    }
  } else if (words.length === 2) {
    const fit = pairFit(words[0], words[1]);
    if (fit.coherent) {
      breakdown.meaning = 36; breakdown.commercial = 22; sectors = fit.sectors;
      reasons.push("coherent_two_word_compound");
    } else {
      breakdown.meaning = 12; breakdown.commercial = 3; breakdown.penalties += 12;
      reasons.push("unrelated_word_pair");
    }
    if (language === "mixed") { breakdown.penalties += 10; reasons.push("mixed_language_pair"); }
    if (repeatedWord(words[0], words[1])) { breakdown.penalties += 25; reasons.push("repeated_word"); }
  } else {
    reasons.push("no_curated_meaning", "unverified_coined_name");
    breakdown.penalties += 12;
    // A recognizable fragment is disclosed but earns no semantic/commercial credit.
    if ([...lexicon.keys()].some(word => word.length >= 4 && label.includes(word))) reasons.push("partial_word_only");
    if (/^[a-z]{5,16}$/u.test(label) && [...lexicon.keys()].some(word => word.length >= 5 && oneEditAway(label, word))) {
      breakdown.penalties += 12; reasons.push("possible_dictionary_typo");
    }
  }

  breakdown.readability = label.length <= 10 ? 20 : label.length <= 14 ? 16 : label.length <= 18 ? 10 : 4;
  if (label.length <= 10) reasons.push("compact_label");
  if (label.length > 18) { breakdown.penalties += 8; reasons.push("long_label"); }
  const hyphens = (label.match(/-/gu) ?? []).length, digits = (label.match(/\d/gu) ?? []).length;
  if (hyphens) { breakdown.penalties += Math.min(24, hyphens * 8); reasons.push("hyphen_present"); }
  if (digits) { breakdown.penalties += Math.min(24, digits * 6); reasons.push("digits_present"); }
  if (/([a-z])\1{2,}/u.test(label)) { breakdown.penalties += 12; reasons.push("repeated_characters"); }
  // This shape check is deliberately not applied to recognized words such as "school".
  if (!words.length && (/[bcdfghjklmnpqrstvwxz]{4,}/u.test(label) || !/[aeiouy]/u.test(label))) {
    breakdown.readability = Math.min(breakdown.readability, 5); reasons.push("difficult_letter_sequence");
  }

  if (extension === "com") { breakdown.tldFit = 15; reasons.push("broad_commercial_extension"); }
  else if (extension === "se" && language === "sv") { breakdown.tldFit = 15; reasons.push("swedish_language_extension"); }
  else if (SECTOR_EXTENSIONS[extension]?.some(sector => sectors.includes(sector))) { breakdown.tldFit = 13; reasons.push("sector_extension_fit"); }
  else if (extension === "net" && sectors.includes("software")) { breakdown.tldFit = 10; reasons.push("sector_extension_fit"); }
  else { breakdown.tldFit = 4; reasons.push("extension_fit_unestablished"); }
  breakdown.penalties = Math.min(100, breakdown.penalties);
  const score = Math.max(0, breakdown.meaning + breakdown.commercial + breakdown.readability + breakdown.tldFit - breakdown.penalties);
  reasons.push("heuristic_not_market_demand");
  return { version: 1, methodology: TRADING_MARKET_FIT_METHODOLOGY, domain, score,
    tier: score >= 75 ? "strong" : score >= 45 ? "plausible" : "weak",
    pattern: words.length === 1 ? "dictionary" : words.length === 2 ? "compound" : "unrecognized",
    language, tokens: words.map(word => word.word), sectors,
    buyerUseCases: sectors.map(sector => USE_CASE_BY_SECTOR[sector]), breakdown, reasons };
}

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;

/**
 * Recompute the versioned rubric to reject forged scores, arbitrary copy, unknown
 * fields, extra buyer claims, out-of-range dimensions and internally inconsistent data.
 * Property order is immaterial; ordered evidence arrays must match the canonical result.
 */
export function isTradingMarketFit(value: unknown): value is TradingMarketFit {
  const row = record(value);
  if (!row || typeof row.domain !== "string" || row.domain.length > 253) return false;
  const expected = analyzeTradingMarketFit(row.domain);
  if (Object.keys(row).length !== Object.keys(expected).length) return false;
  for (const key of ["version", "methodology", "domain", "score", "tier", "pattern", "language"] as const) if (row[key] !== expected[key]) return false;
  for (const key of ["tokens", "sectors", "buyerUseCases", "reasons"] as const) {
    const actual = row[key];
    if (!Array.isArray(actual) || actual.length !== expected[key].length || actual.some((item, index) => item !== expected[key][index])) return false;
  }
  const breakdown = record(row.breakdown);
  return !!breakdown && Object.keys(breakdown).length === Object.keys(expected.breakdown).length
    && Object.entries(expected.breakdown).every(([key, points]) => breakdown[key] === points);
}

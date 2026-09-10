import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const FIXTURE_PATH = resolve(projectRoot, "tests/fixtures/naming-quality-briefs.json");
export const LIMITATIONS = Object.freeze([
  "Offline structural regression only; no registry, registrar, AI, trademark or pricing requests are made.",
  "The deterministic baseline receives the explicit theme and constraints, not semantic understanding of the full brief.",
  "Validity, uniqueness, length and surface variation are not evidence of relevance, memorability, pronunciation, legal clearance or resale value.",
  "All candidate availability and prices are NOT CHECKED. Human rating fields start blank. No benchmark winner or semantic quality score is computed.",
]);

export function validateFixtures(dataset) {
  if (dataset?.schemaVersion !== 1 || !Array.isArray(dataset.briefs) || dataset.briefs.length !== 20) throw new Error("Expected schemaVersion 1 and exactly 20 briefs");
  const ids = new Set();
  for (const brief of dataset.briefs) {
    if (!/^(en|sv)-\d{2}$/.test(brief.id) || ids.has(brief.id)) throw new Error("Invalid or duplicate brief id");
    ids.add(brief.id);
    if (!["en", "sv"].includes(brief.locale) || !brief.id.startsWith(brief.locale)) throw new Error("Unsupported fixture language");
    if (typeof brief.brief !== "string" || brief.brief.length < 100 || typeof brief.theme !== "string" || !brief.theme.trim()) throw new Error("A full brief and explicit baseline theme are required");
    if (!Array.isArray(brief.tlds) || brief.tlds.length < 1 || brief.tlds.some((tld) => !/^[a-z]{2,12}$/.test(tld)) || new Set(brief.tlds).size !== brief.tlds.length) throw new Error("Invalid fixture TLDs");
    if (!Number.isInteger(brief.minLength) || !Number.isInteger(brief.maxLength) || brief.minLength < 3 || brief.maxLength > 22 || brief.minLength > brief.maxLength) throw new Error("Invalid fixture length limits");
    if (!["balanced", "brandable", "descriptive", "invented"].includes(brief.nameStyle)) throw new Error("Invalid fixture style");
    if (!Array.isArray(brief.excludeWords) || brief.excludeWords.some((word) => !/^[a-z]+$/.test(word))) throw new Error("Fixture exclusions must use explicit ASCII tokens");
    if (!Array.isArray(brief.humanChecks) || brief.humanChecks.length < 2) throw new Error("Human evaluation questions are required");
  }
  for (const locale of ["en", "sv"]) if (dataset.briefs.filter((brief) => brief.locale === locale).length !== 10) throw new Error("Expected ten briefs per language");
  return dataset;
}

export async function loadFixtures() {
  return validateFixtures(JSON.parse(await readFile(FIXTURE_PATH, "utf8")));
}

function counts(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b)));
}

export function measureStructure(candidates, brief, requestedCount = 30) {
  if (!Array.isArray(candidates)) throw new Error("Candidates must be an array");
  const domains = candidates.map((candidate) => typeof candidate.domain === "string" ? candidate.domain : "");
  const canonical = domains.map((domain) => domain.toLowerCase());
  const labels = domains.map((domain) => domain.split(".")[0] ?? "");
  const uniqueLabels = [...new Set(labels.filter(Boolean))];
  const validShape = (domain) => /^[a-z][a-z0-9]{2,21}\.[a-z]{2,12}$/.test(domain);
  const prefix3 = counts(uniqueLabels.map((label) => label.slice(0, 3)));
  const suffix3 = counts(uniqueLabels.map((label) => label.slice(-3)));
  const maximumShare = (histogram) => uniqueLabels.length ? Math.max(0, ...Object.values(histogram)) / uniqueLabels.length : 0;
  const metrics = {
    requestedCount,
    returnedCount: domains.length,
    invalidDomainCount: domains.filter((domain) => !validShape(domain)).length,
    duplicateDomainCount: domains.length - new Set(canonical).size,
    outsideLengthCount: labels.filter((label) => label.length < brief.minLength || label.length > brief.maxLength).length,
    excludedWordCount: labels.filter((label) => brief.excludeWords.some((word) => label.toLowerCase().includes(word))).length,
    unselectedTldCount: domains.filter((domain) => !brief.tlds.includes(domain.split(".").at(-1))).length,
    uniqueLabelCount: uniqueLabels.length,
    alternateTldReuseCount: labels.length - uniqueLabels.length,
    lengthDistribution: counts(uniqueLabels.map((label) => String(label.length))),
    tldDistribution: counts(domains.map((domain) => domain.split(".").at(-1) || "invalid")),
    namingPatternDistribution: counts(candidates.map((candidate) => String(candidate.namingPattern ?? "unreported"))),
    surfaceVariation: { prefixLength: 3, highestPrefixShare: maximumShare(prefix3), highestSuffixShare: maximumShare(suffix3) },
  };
  const violations = [
    ...(!domains.length ? ["no_candidates"] : []),
    ...(domains.length > requestedCount ? ["too_many_candidates"] : []),
    ...["invalidDomainCount", "duplicateDomainCount", "outsideLengthCount", "excludedWordCount", "unselectedTldCount"].filter((key) => metrics[key] > 0),
  ];
  return { ...metrics, structuralPass: violations.length === 0, violations };
}

export function runOfflineBenchmark(dataset, generator, count = 30) {
  validateFixtures(dataset);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Count must be between 1 and 100");
  const results = dataset.briefs.map((brief) => {
    const criteria = { minLength: brief.minLength, maxLength: brief.maxLength, nameLanguage: brief.locale, nameStyle: brief.nameStyle, includeWords: [], excludeWords: brief.excludeWords };
    const candidates = generator(brief.tlds, count, brief.theme, brief.locale, criteria);
    const repeated = generator(brief.tlds, count, brief.theme, brief.locale, criteria);
    const deterministic = JSON.stringify(candidates) === JSON.stringify(repeated);
    const structure = measureStructure(candidates, brief, count);
    if (!deterministic) { structure.structuralPass = false; structure.violations.push("not_deterministic"); }
    return { briefId: brief.id, locale: brief.locale, category: brief.category, deterministic, ...structure, candidates: candidates.map(({ domain, namingPattern }) => ({ domain, namingPattern })) };
  });
  return {
    schemaVersion: 1,
    datasetId: dataset.datasetId,
    mode: "offline-deterministic-fallback",
    providerRequests: 0,
    semanticQuality: "NOT_EVALUATED",
    availability: "NOT_CHECKED",
    price: "NOT_CHECKED",
    limitations: LIMITATIONS,
    summary: { briefCount: results.length, structuralPassCount: results.filter((result) => result.structuralPass).length, humanReviewsCompleted: 0 },
    results,
  };
}

const orderKey = (seed, value) => createHash("sha256").update(`${seed}|${value}`).digest("hex");

export function buildBlindReview(dataset, systems, seed = "sajda-blind-review-v1") {
  validateFixtures(dataset);
  if (!Array.isArray(systems) || systems.length < 1 || systems.length > 10) throw new Error("Expected 1-10 systems");
  if (new Set(systems.map((system) => system.systemId)).size !== systems.length) throw new Error("System identifiers must be unique");
  const rows = [];
  const key = [];
  dataset.briefs.forEach((brief, briefIndex) => {
    const pooled = new Map();
    systems.forEach((system) => {
      if (typeof system.systemId !== "string" || !system.systemId.trim() || !Array.isArray(system.results)) throw new Error("Invalid comparison system");
      const matching = system.results.filter((result) => result.briefId === brief.id);
      if (matching.length !== 1 || !Array.isArray(matching[0].candidates)) throw new Error(`Each system needs exactly one candidate list for ${brief.id}`);
      const seen = new Set();
      for (const [rank, candidate] of matching[0].candidates.entries()) {
        const domain = candidate.domain;
        if (typeof domain !== "string" || !/^[a-z][a-z0-9]{2,21}\.[a-z]{2,12}$/.test(domain)) throw new Error("Comparison candidates require lowercase ASCII domain labels and one TLD");
        const label = domain.split(".")[0];
        if (seen.has(label)) continue;
        if (seen.size === 10) break;
        seen.add(label);
        if (!pooled.has(label)) pooled.set(label, []);
        pooled.get(label).push({ systemId: system.systemId, domain, originalRank: rank + 1 });
      }
    });
    [...pooled.keys()].sort((a, b) => orderKey(seed, `${brief.id}|${a}`).localeCompare(orderKey(seed, `${brief.id}|${b}`))).forEach((label, index) => {
      const candidateId = `B${String(briefIndex + 1).padStart(2, "0")}-N${String(index + 1).padStart(2, "0")}`;
      rows.push({ candidateId, briefId: brief.id, locale: brief.locale, brief: brief.brief, humanChecks: brief.humanChecks.join(" "), candidateLabel: label, availability: "NOT_CHECKED", price: "NOT_CHECKED", reviewerId: "", relevance1to5: "", pronunciation1to5: "", spelling1to5: "", distinctiveness1to5: "", acceptForShortlistYesNoUnsure: "", reason: "" });
      key.push({ candidateId, briefId: brief.id, candidateLabel: label, origins: pooled.get(label) });
    });
  });
  return { rows, privateKey: { schemaVersion: 1, seed, warning: "Coordinator only. Do not give this attribution key to reviewers before ratings are locked.", candidates: key } };
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function reviewCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

async function main(args) {
  let out = resolve(projectRoot, "tmp/naming-quality-benchmark");
  let comparison;
  let seed = "sajda-blind-review-v1";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out" && args[index + 1]) out = resolve(args[++index]);
    else if (args[index] === "--comparison" && args[index + 1]) comparison = resolve(args[++index]);
    else if (args[index] === "--seed" && args[index + 1]) seed = args[++index];
    else throw new Error("Usage: node --import tsx scripts/evaluate-naming-quality.mjs [--out directory] [--comparison file.json] [--seed value]");
  }
  const dataset = await loadFixtures();
  // Deliberately import only the existing pure generation export. No handler,
  // provider, environment-file loading or AI request is invoked by this runner.
  const previousFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts += 1; throw new Error("Network access is forbidden in the offline naming benchmark"); };
  let report;
  try {
    const { generateCandidates } = await import("../api/domain-search.ts");
    report = runOfflineBenchmark(dataset, generateCandidates);
  } finally { globalThis.fetch = previousFetch; }
  if (networkAttempts) throw new Error("Offline benchmark attempted network access; refusing to export a misleading zero-request report");
  const systems = [{ systemId: "sajda-deterministic-fallback", results: report.results }];
  if (comparison) {
    const supplied = JSON.parse(await readFile(comparison, "utf8"));
    if (!Array.isArray(supplied.systems)) throw new Error("Comparison JSON must contain a systems array");
    systems.push(...supplied.systems);
  }
  const blind = buildBlindReview(dataset, systems, seed);
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, "structural-report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(resolve(out, "blind-review.csv"), "\ufeff" + reviewCsv(blind.rows));
  await writeFile(resolve(out, "blind-review.json"), JSON.stringify({ instructions: LIMITATIONS, ratingScale: "1 = poor; 3 = workable; 5 = strong. Leave blank if not judged. Unknown availability is not evidence of availability.", rows: blind.rows }, null, 2) + "\n");
  await writeFile(resolve(out, "coordinator-key.private.json"), JSON.stringify(blind.privateKey, null, 2) + "\n");
  await writeFile(resolve(out, "README.txt"), "Give reviewers only blind-review.csv or blind-review.json. Keep structural-report.json and coordinator-key.private.json with the coordinator until ratings are locked.\nAll candidates are unchecked. A single-system run is a masked presentation, not a comparative benchmark. No human ratings have been performed.\n");
  console.log(JSON.stringify({ output: out, ...report.summary, providerRequests: 0, semanticQuality: "NOT_EVALUATED", candidateReviewRows: blind.rows.length }));
  if (report.summary.structuralPassCount !== dataset.briefs.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}

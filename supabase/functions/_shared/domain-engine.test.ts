import {
  ALGORITHM_VERSION,
  arrayFromEnvelope,
  generateDomainCandidates,
  normalizeDomain,
  normalizeTlds,
  valueDomain,
} from "./domain-engine.ts";
import { availabilityFromRdapStatus } from "./availability.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("normalizes valid domains and rejects malformed input", () => {
  assertEquals(normalizeDomain("Example.COM."), "example.com", "normalizes casing and trailing period");
  assert(normalizeDomain("räv.se")?.endsWith(".se"), "converts Unicode domain through IDNA");
  assertEquals(normalizeDomain("not a domain"), null, "rejects whitespace");
  assertEquals(normalizeDomain("example"), null, "requires a fully-qualified domain");
  assertEquals(normalizeDomain("-bad.com"), null, "rejects invalid labels");
});

Deno.test("normalizes and bounds a TLD list", () => {
  const tlds = normalizeTlds([".COM", "se", "COM", "bad tld", 3]);
  assertEquals(tlds.join(","), "com,se", "deduplicates and validates TLDs");
});

Deno.test("reads valuations from the documented response envelope", () => {
  const valuations = arrayFromEnvelope<{ domain: string }>({ valuations: [{ domain: "lumen.com" }] }, "valuations");
  assertEquals(valuations[0]?.domain, "lumen.com", "keeps the valuation batch instead of falling back");
  assertEquals(arrayFromEnvelope([], "valuations").length, 0, "rejects a bare array response");
});

Deno.test("uses only authoritative RDAP absence as positive availability", () => {
  assertEquals(availabilityFromRdapStatus(404), "available", "RDAP 404 is available");
  assertEquals(availabilityFromRdapStatus(200), "taken", "RDAP success means registered");
  assertEquals(availabilityFromRdapStatus(429), "unknown", "rate limits never become available");
  assertEquals(availabilityFromRdapStatus(503), "unknown", "outages never become available");
});

Deno.test("candidate generation is deterministic, unique, and bounded", () => {
  const input = { tlds: ["se", "com"], count: 24, theme: "hållbar hälsa", iteration: 3 };
  const first = generateDomainCandidates(input);
  const second = generateDomainCandidates(input);

  assertEquals(first.join(","), second.join(","), "same input produces same candidates");
  assertEquals(new Set(first).size, first.length, "candidates are unique");
  assert(first.length <= 24 && first.length > 0, "candidate count is bounded");
  assert(first.every((domain) => /^[a-z0-9]+\.(se|com)$/.test(domain)), "candidates use a single valid label and requested TLD");
});

Deno.test("screening valuation is transparent and reproducible", () => {
  const first = valueDomain("lumen.com", 12);
  const second = valueDomain("lumen.com", 12);

  assert(first !== null && second !== null, "valid domain produces a valuation");
  assertEquals(first.estimatedValue, second.estimatedValue, "valuation is reproducible");
  assertEquals(first.algorithmVersion, ALGORITHM_VERSION, "reports the algorithm version");
  assert(first.confidenceScore >= 25 && first.confidenceScore <= 75, "confidence does not overclaim market certainty");
  assert(first.rationale.includes("inte ett bekräftat marknadsvärde"), "rationale contains the valuation disclaimer");
});

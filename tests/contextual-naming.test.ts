import test from "node:test";
import assert from "node:assert/strict";
import { createDomainSearchHandler, generateCandidates } from "../api/domain-search";
import { contextualNamesFailure, validateContextualNames, parseContextualNames, refineRuleCandidates, selectContextualNames, satisfiesNamingConstraints, type NamingInput } from "../api/_shared/contextual-naming";
import { AI_CONSENT_VERSION } from "../shared/ai-consent";
import { parseSearchRefinement } from "../shared/search-refinement";

const consent = { version: AI_CONSENT_VERSION, accepted: true } as const;
const names = ["sunroom", "bloompath", "petalnote", "brightnest", "fieldletter", "softsignal", "calmcraft", "littleorbit"];
const model = { names: names.map((label, i) => ({ label, direction: i % 2 ? "evocative" as const : "compound" as const })) };
const input: NamingInput = { theme: "flower studio", brief: "A welcoming flower studio for everyday gifts", locale: "en" };
const refinement = { previousNames: ["sunroom.com", "bloompath.com"], likedNames: ["sunroom.com"], reasons: ["too_long" as const] };

test("feedback has strict bounded shape, subset favorites and generated-label-only references", () => {
  assert.deepEqual(parseSearchRefinement(refinement), refinement);
  for (const value of [null, {}, { ...refinement, extra: "ignore" }, { ...refinement, reasons: ["cheaper"] },
    { ...refinement, reasons: ["too_long", "too_long"] }, { ...refinement, previousNames: Array(51).fill("domain.com") },
    { ...refinement, likedNames: ["unseen.com"] }, { ...refinement, previousNames: ["https://evil.test"] },
    { ...refinement, likedNames: [], reasons: [] }]) assert.throws(() => parseSearchRefinement(value));
  assert.equal(parseSearchRefinement(undefined), undefined);
});

test("AI output accepts only labels and directions, never prices, status, score or URLs", () => {
  assert.equal(parseContextualNames(model)?.length, 8);
  for (const value of [{ ...model, status: "available" },
    { names: [{ label: "goodname", direction: "evocative", available: true }, ...model.names] },
    { names: Array(33).fill(model.names[0]) },
    { names: model.names.map(name => ({ ...name, label: "samename" })) }, { names: model.names.slice(0, 3) }]) {
    assert.equal(parseContextualNames(value), undefined);
  }
});

test("strict contextual validation exposes only fixed failure categories, never private labels", () => {
  const entry = (changes: Record<string, unknown>) => ({ names: [{ ...model.names[0], ...changes }, ...model.names.slice(1, 4)] });
  const cases: [unknown, string][] = [
    [null, "root"], [{ ...model, private: "secret" }, "root"],
    [{ names: model.names.slice(0, 3) }, "array_size"], [{ names: Array(33).fill(model.names[0]) }, "array_size"],
    [{ names: [null, ...model.names.slice(1)] }, "entry_shape"],
    [entry({ secret: "private field" }), "entry_shape"],
    [entry({ label: { secret: "private label" } }), "label_type"],
    [entry({ label: "a" }), "label_length"], [entry({ label: "private".repeat(10) }), "label_length"],
    [entry({ label: "privаtename" }), "label_charset"],
    [entry({ label: "private.com" }), "label_charset"],
    [entry({ direction: "private direction" }), "invalid_direction"],
    [{ names: Array(4).fill({ label: "privatename", direction: "evocative" }) }, "too_few_unique"],
  ];
  for (const [value, failure] of cases) {
    assert.deepEqual(validateContextualNames(value), { failure });
    assert.equal(contextualNamesFailure(value), failure);
    assert.equal(parseContextualNames(value), undefined, "diagnosis must not weaken strict rejection");
    assert.doesNotMatch(JSON.stringify(validateContextualNames(value)), /private|privåte|secret/);
  }
  assert.equal(contextualNamesFailure(model), undefined);
  assert.deepEqual(validateContextualNames(model), { names: model.names });
});

test("Latin case and canonical diacritics normalize conservatively before deduplication", () => {
  const raw = ["BlåBÄR", "CAFÉ", "ÖRTGÅRD", "ÅKER", "Cafe\u0301", "blabar", "HERB24"];
  const parsed = parseContextualNames({ names: raw.map(label => ({ label, direction: "evocative" })) });
  assert.deepEqual(parsed?.map(name => name.label), ["blabar", "cafe", "ortgard", "aker", "herb24"]);
  assert.equal(contextualNamesFailure({ names: raw.map(label => ({ label, direction: "evocative" })) }), undefined);
  assert.ok(parsed?.every(name => /^[a-z][a-z0-9]{2,21}$/.test(name.label)));
  const collision = { names: ["CAFÉ", "Café", "cafe", "Cafe\u0301"].map(label => ({ label, direction: "compound" })) };
  assert.deepEqual(validateContextualNames(collision), { failure: "too_few_unique" });
  assert.equal(parseContextualNames(collision), undefined);
});

test("normalized names still obey previous-name and excluded-word filters", () => {
  const raw = ["BlåBÄR", "CAFÉ", "ÖRTGÅRD", "ÅKER", "FJÄLL", "LÖV"];
  const parsed = parseContextualNames({ names: raw.map(label => ({ label, direction: "evocative" })) });
  assert.ok(parsed);
  const filtered = selectContextualNames(parsed, { ...input,
    constraints: { minLength: 3, maxLength: 22, nameLanguage: "sv", nameStyle: "balanced", includeWords: [], excludeWords: ["cafe"] },
    refinement: { previousNames: ["blabar.com"], likedNames: [], reasons: ["too_generic"] },
  });
  assert.deepEqual(filtered.map(name => name.label), ["ortgard", "aker", "fjall", "lov"]);
});

test("invalid individual labels are discarded without URL truncation or arbitrary script stripping", () => {
  const invalid = ["bad.name", "https://private.example", "private/path", " name", "two words", "name\n",
    "name\u0000", "name\u200d", "na\u034fme", "\u0301name", "na\u0654me", "privаtename",
    "名字", "όνομα", "ＡＬＰＨＡ", "name-brand", "na🙂me", "1name", "ørestad", "aa", "x".repeat(23)];
  const value = { names: [...invalid.map(label => ({ label, direction: "evocative" })), ...model.names.slice(0, 4)] };
  assert.equal(value.names.length <= 32, true);
  assert.deepEqual(parseContextualNames(value), model.names.slice(0, 4));
  assert.equal(contextualNamesFailure(value), undefined, "a usable remaining batch is not a schema failure");
  assert.equal(parseContextualNames({ names: [...value.names, ...model.names] }), undefined, "input maximum stays 32 before filtering");
  const tooFew = { names: [{ label: "private.example", direction: "evocative" }, ...model.names.slice(0, 3)] };
  assert.deepEqual(validateContextualNames(tooFew), { failure: "label_charset" });
});

test("structural injection and invalid directions or types invalidate even otherwise usable batches", () => {
  for (const entry of [
    { label: "invalid.url", direction: "evocative", price: 1 },
    { label: "invalid.url", direction: "private injected direction" },
    { label: { private: "value" }, direction: "evocative" },
    { label: "goodname", direction: "evocative", status: "available" },
    { label: "goodname", direction: "evocative", score: 99 },
    { label: "goodname", instruction: "private extra field" },
  ]) {
    for (const entries of [[entry, ...model.names], [...model.names, entry]]) {
      assert.equal(parseContextualNames({ names: entries }), undefined);
      assert.match(contextualNamesFailure({ names: entries })!, /^(entry_shape|invalid_direction|label_type)$/);
    }
  }
});

test("hard constraints and feedback apply before selecting AI ideas; priority words stay soft", () => {
  const constrained: NamingInput = { ...input, constraints: { minLength: 4, maxLength: 10, nameLanguage: "en", nameStyle: "balanced", includeWords: ["flower"], excludeWords: ["signal"] }, refinement };
  const selected = selectContextualNames(model.names, constrained);
  assert.equal(selected.length, 3);
  assert.ok(selected.every(name => name.label.length <= 10 && !["sunroom", "bloompath", "softsignal"].includes(name.label)));
  assert.equal(satisfiesNamingConstraints("fieldletter", constrained), false);
  assert.equal(satisfiesNamingConstraints("calmcraft", constrained), true, "priority words are not required words");
  assert.equal(satisfiesNamingConstraints("calmcraft", { ...input, requiredReferences: ["flower"] }), false);
  assert.deepEqual(selectContextualNames(model.names, input).slice(0, 4).map(name => name.direction), ["evocative", "compound", "evocative", "compound"]);
});

test("rule refinement excludes seen labels before bounded selection and actually produces a new batch", () => {
  const first = generateCandidates(["com", "app"], 50, "coffee", "en");
  const feedback = { previousNames: first.map(name => name.domain), likedNames: [], reasons: ["too_long" as const] };
  const next = refineRuleCandidates(generateCandidates(["com", "app"], 50, "coffee", "en", undefined, undefined, undefined, feedback), { ...input, theme: "coffee", refinement: feedback });
  const previous = new Set(first.map(name => name.domain.split(".")[0]));
  assert.ok(next.length >= 10);
  assert.ok(next.every(name => !previous.has(name.domain.split(".")[0])));
  assert.ok(next[0].domain.split(".")[0].length <= next.at(-1)!.domain.split(".")[0].length);
});

let requestNumber = 0;
async function invoke(handler: ReturnType<typeof createDomainSearchHandler>, body: Record<string, unknown>) {
  let status = 0; let result: Record<string, unknown> = {};
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `contextual-fixture-${++requestNumber}` }, body }, {
    setHeader() {}, status(code) { status = code; return this; }, json(value) { result = value as Record<string, unknown>; }, end() {},
  });
  return { status, body: result };
}

test("real handler generates from brief once, verifies independently and reports its actual source/count", async () => {
  const original = globalThis.fetch;
  const seen: NamingInput[] = [];
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
  const handler = createDomainSearchHandler(async (data, _request, accepted) => { assert.deepEqual(accepted, consent); seen.push(data); return model.names; });
  try {
    const result = await invoke(handler, { advanced: true, brief: input.brief, tlds: ["com"], providers: ["cloudflare"], count: 50, aiConsent: consent });
    assert.equal(result.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].brief, input.brief);
    assert.equal(result.body.requested, 50);
    assert.equal((result.body.results as unknown[]).length, 8, "never pad to 50 and falsely label local names AI");
    assert.deepEqual(result.body.generation, { source: "ai", refinementApplied: false });
    assert.ok((result.body.results as { status: string; estimatedValue: number; authoritative: boolean }[]).every(name => name.status === "unknown" && name.estimatedValue === 0 && !name.authoritative));
  } finally { globalThis.fetch = original; }
});

test("no permission, exact checks, Swipe and invalid refinement never call naming provider", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => new Response("", { status: 404, headers: { "content-type": "application/rdap+json" } });
  const handler = createDomainSearchHandler(async () => { calls++; return model.names; });
  try {
    const base = { theme: "garden", tlds: ["com"], providers: ["cloudflare"], count: 4 };
    assert.equal((await invoke(handler, base)).body.generation && calls, 0);
    await invoke(handler, { ...base, domains: ["example.com"], aiConsent: consent });
    await invoke(handler, { ...base, swipe: true, aiConsent: consent });
    assert.equal((await invoke(handler, { ...base, aiConsent: { version: "2026-09-10", accepted: true } })).status, 400);
    assert.equal((await invoke(handler, { ...base, refinement: { ...refinement, likedNames: ["outsider.com"] }, aiConsent: consent })).status, 400);
    assert.equal((await invoke(handler, { ...base, domains: ["example.com"], refinement, aiConsent: consent })).status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("unavailable naming provider falls back once without making model-derived claims", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => new Response("", { status: 404, headers: { "content-type": "application/rdap+json" } });
  const handler = createDomainSearchHandler(async () => { calls++; return undefined; });
  try {
    const result = await invoke(handler, { theme: "harbor", tlds: ["com"], count: 8, providers: ["cloudflare"], aiConsent: consent });
    assert.equal(result.status, 200); assert.equal(calls, 1);
    assert.deepEqual(result.body.generation, { source: "rules", fallbackReason: "ai_unavailable", refinementApplied: false });
  } finally { globalThis.fetch = original; }
});

test("the full visible theme reaches naming without silent 100-character truncation", async () => {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
  const handler = createDomainSearchHandler(async data => { seen.push(data.theme); return model.names; });
  const theme = "A garden service for busy families who want calm welcoming spaces without complicated maintenance. Specifically use a playful Swedish tone.";
  try {
    assert.equal((await invoke(handler, { theme, tlds: ["com"], providers: ["cloudflare"], count: 4, aiConsent: consent })).status, 200);
    assert.deepEqual(seen, [theme]);
    const invalid = await invoke(handler, { theme: "x".repeat(6_001), tlds: ["com"], aiConsent: consent });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "theme_too_long");
    assert.equal(seen.length, 1);
  } finally { globalThis.fetch = original; }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  completeNamePackageCandidateEvidence, expandNamePackageDomainMatrix, generateNamePackageCandidates,
  NAME_PACKAGE_CANDIDATE_DOMAIN_LIMIT, NAME_PACKAGE_WEB_DOMAIN_LIMIT,
} from "../api/_shared/name-package-candidates.js";
import { parseNamePackageSearchRequest } from "../api/_shared/name-package-contract.js";
import { NAMES_API_TLDS } from "../api/_shared/names-contract.js";
import { createDomainSearchHandler, createTrustedConnectorEngineRequest } from "../api/domain-search.js";
import { AI_CONSENT_VERSION } from "../shared/ai-consent.js";

const request = parseNamePackageSearchRequest({ query: "creative software studio", tlds: ["com", "dev", "app"], platforms: ["github"], count: 10 });

test("API discovery checks one coherent label across every selected extension within one bounded reserve", () => {
  const planned = generateNamePackageCandidates(request);
  assert.equal(planned.labels.length, 10); assert.equal(planned.domains.length, 30);
  assert.equal(new Set(planned.domains).size, 30);
  for (const label of planned.labels) assert.deepEqual(planned.domains.filter(domain => domain.startsWith(`${label}.`)), request.tlds.map(tld => `${label}.${tld}`));
  assert.deepEqual(generateNamePackageCandidates(request), planned);
  const full = generateNamePackageCandidates({ ...request, tlds: [...NAMES_API_TLDS] });
  assert.ok(full.domains.length <= NAME_PACKAGE_CANDIDATE_DOMAIN_LIMIT);
  assert.equal(full.domains.length, full.labels.length * NAMES_API_TLDS.length);
  assert.throws(() => generateNamePackageCandidates({ ...request, query: "https://private.test" }));
});

test("browser matrix preserves complete packages and original naming provenance inside50checks", () => {
  const seeds = Array.from({ length: 50 }, (_, index) => ({ domain: `nordform${index}.com`, namingPattern: "contextual", rank: index }));
  const matrix = expandNamePackageDomainMatrix(seeds, [...NAMES_API_TLDS]);
  assert.equal(matrix.length, 44); assert.ok(matrix.length <= NAME_PACKAGE_WEB_DOMAIN_LIMIT);
  for (let index = 0; index < 4; index++) {
    const group = matrix.filter(row => row.domain.startsWith(`nordform${index}.`));
    assert.equal(group.length, 11); assert.ok(group.every(row => row.namingPattern === "contextual" && row.rank === index));
  }
  assert.equal(expandNamePackageDomainMatrix(seeds, ["com", "dev"], 9).length, 8);
  assert.deepEqual(expandNamePackageDomainMatrix(seeds, ["com", "dev"], 1), []);
  for (const budget of [0, 51, -1, 1.5, Number.NaN]) assert.throws(() => expandNamePackageDomainMatrix(seeds, ["com"], budget));
  for (const suffixes of [[], ["com", "com"], ["co.uk"], ["http://evil.test"]]) assert.throws(() => expandNamePackageDomainMatrix(seeds, suffixes));
  assert.deepEqual(expandNamePackageDomainMatrix([{ domain: "https://evil.test" }, { domain: "name.test/path" }], ["com"]), []);
});

test("missing provider rows remain unknown and unrelated rows cannot become name-package evidence", () => {
  const result = completeNamePackageCandidateEvidence({ privateTrace: "secret", results: [
    { domain: "nordform.com", status: "taken", authoritative: true, checkedAt: "2026-09-16T12:00:00Z" },
    { domain: "other.com", status: "available", authoritative: true },
  ] }, ["nordform.com", "nordform.dev"]);
  assert.deepEqual(result, { results: [
    { domain: "nordform.com", status: "taken", authoritative: true, checkedAt: "2026-09-16T12:00:00Z" },
    { domain: "nordform.dev", status: "unknown", authoritative: false, checkMethod: "none", source: null, checkedAt: null },
  ] });
  assert.throws(() => completeNamePackageCandidateEvidence({ results: null }, ["nordform.com"]));
});

test("trusted matrix builder does not accept forged identity or oversized reserves", () => {
  const body = { theme: "studio", tlds: ["com"], count: 10 };
  const built = createTrustedConnectorEngineRequest({ method: "POST", headers: {} }, body, "package_owner", "req_packagebounds1234", ["nordform.com"]);
  assert.deepEqual(built.body, body);
  assert.throws(() => createTrustedConnectorEngineRequest({ headers: {} }, body, "invalid principal", "req_packagebounds1234", ["nordform.com"]));
  assert.throws(() => createTrustedConnectorEngineRequest({ headers: {} }, body, "package_owner", "req_packagebounds1234", Array.from({ length: 121 }, (_, index) => `name${index}.com`)));
});

let sequence = 0;
async function invoke(handler: ReturnType<typeof createDomainSearchHandler>, body: Record<string, unknown>, ip?: string) {
  let status = 0, data: Record<string, unknown> = {};
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `package-matrix-fixture-${++sequence}` }, body }, {
    setHeader() {}, status(value) { status = value; return this; }, json(value) { data = value as Record<string, unknown>; }, end() {},
  });
  return { status, data };
}

test("real browser handler groups contextual labels, never bypasses consent and preserves unknown provider failures", async () => {
  const originalFetch = globalThis.fetch;
  let aiCalls = 0;
  // Offline provider failure fixture: not one real registry, registrar or AI call.
  globalThis.fetch = async () => new Response("fixture unavailable", { status: 503 });
  const handler = createDomainSearchHandler(async () => { aiCalls++; return ["northform", "sunfield", "brightnest", "clearpath", "fieldcraft"]
    .map(label => ({ label, direction: "compound" as const })); });
  try {
    const input = { theme: "creative software studio", namePackages: true, tlds: ["com", "dev", "app"], providers: ["cloudflare"], count: 50 };
    const contextual = await invoke(handler, { ...input, aiConsent: { version: AI_CONSENT_VERSION, accepted: true } });
    assert.equal(contextual.status, 200); assert.equal(aiCalls, 1);
    assert.deepEqual(contextual.data.namePackages, { mode: "same_label_matrix", candidateCount: 5, requestedTlds: ["com", "dev", "app"], maximumDomainChecks: 50, plannedDomainChecks: 15 });
    const rows = contextual.data.results as Array<{ domain: string; status: string; authoritative: boolean }>;
    assert.equal(rows.length, 15); assert.ok(rows.every(row => row.status === "unknown" && row.authoritative === false));
    for (const label of ["northform", "sunfield"]) assert.deepEqual(rows.filter(row => row.domain.startsWith(`${label}.`)).map(row => row.domain), input.tlds.map(tld => `${label}.${tld}`));
    const rules = await invoke(handler, { ...input, tlds: [...NAMES_API_TLDS], count: 80 });
    assert.equal(rules.status, 200); assert.equal(aiCalls, 1, "No implicit AI consent");
    assert.ok((rules.data.results as unknown[]).length <= 50);
    assert.equal((rules.data.namePackages as { maximumDomainChecks: number }).maximumDomainChecks, 50);
    const exact = await invoke(handler, { ...input, domains: ["alreadyselected.com"] });
    assert.equal(exact.status, 200); assert.equal((exact.data.results as unknown[]).length, 1);
    assert.equal(exact.data.namePackages, undefined);
    assert.equal((await invoke(handler, { ...input, namePackages: "true" })).status, 400);
    assert.equal((await invoke(handler, { ...input, swipe: true })).status, 400);
    assert.equal((await invoke(handler, { ...input, domains: Array.from({ length: 13 }, (_, index) => `large${index}.com`) })).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});

test("public package flag retains the existing shared six-request anonymous rate limit", async () => {
  const handler = createDomainSearchHandler(async () => { assert.fail("Invalid providers must prevent AI work"); });
  const input = { theme: "software studio", namePackages: true, tlds: ["com"], providers: ["invalid"] };
  for (let i = 0; i < 6; i++) assert.equal((await invoke(handler, input, "package-shared-quota-fixture")).status, 400);
  assert.equal((await invoke(handler, input, "package-shared-quota-fixture")).status, 429);
});

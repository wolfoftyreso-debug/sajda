import test from "node:test";
import assert from "node:assert/strict";
import { AI_CONSENT_VERSION, hasCurrentAiConsent, parseAiConsent } from "../shared/ai-consent";
import { aiPermissionForRequest, AI_CONSENT_STORAGE_KEY, hasAiPermission, setAiPermission, withAiPermission } from "../src/lib/aiConsent";
import deepReview from "../api/deep-review";
import domainSearch from "../api/domain-search";
import { parseNamesApiRequest } from "../api/_shared/names-contract";
import { parseProductOperationInput } from "../api/_shared/mcp-tools";

const consent = { version: AI_CONSENT_VERSION, accepted: true } as const;
test("versioned AI permission is exact, opt-in only, and omission means no AI", () => {
  assert.deepEqual(parseAiConsent(consent), consent);
  assert.equal(parseAiConsent(undefined), undefined);
  for (const invalid of [null, {}, true, "true", { version: AI_CONSENT_VERSION, accepted: "true" },
    { ...consent, version: "old" }, { ...consent, accepted: false }, { ...consent, extra: 1 }]) {
    assert.equal(hasCurrentAiConsent(invalid), false);
    assert.throws(() => parseAiConsent(invalid), /omit aiConsent/);
  }
});

test("device permission dispatch removes stale cached consent and never leaks to other URLs", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  } });
  const request = { method: "POST", body: JSON.stringify({ theme: "coffee", aiConsent: consent }) };
  try {
    assert.equal(hasAiPermission(), false);
    assert.equal(aiPermissionForRequest(), undefined);
    assert.equal(JSON.parse(withAiPermission("/api/domain-search", request)!.body as string).aiConsent, undefined);
    setAiPermission(true);
    assert.deepEqual(aiPermissionForRequest(), consent);
    assert.deepEqual(JSON.parse(withAiPermission("/api/deep-review", request)!.body as string).aiConsent, consent);
    setAiPermission(false);
    assert.equal(JSON.parse(withAiPermission("/api/deep-review", request)!.body as string).aiConsent, undefined);
    for (const value of ["not json", JSON.stringify({ ...consent, version: "old" }), "null"]) {
      storage.set(AI_CONSENT_STORAGE_KEY, value); assert.equal(hasAiPermission(), false);
    }
    const clean = { method: "POST", body: "{}" };
    setAiPermission(true);
    for (const url of ["/api/contact", "/api/v1/domains", "https://external.invalid/api/domain-search", "/api/domain-search?other=1"]) {
      assert.equal(withAiPermission(url, clean), clean);
    }
  } finally {
    setAiPermission(false);
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});

function responseCapture() {
  let status = 0; let body: Record<string, unknown> = {};
  const response = { setHeader() {}, status(code: number) { status = code; return this; },
    json(value: unknown) { body = value as Record<string, unknown>; }, end() {} };
  return { response, result: () => ({ status, body }) };
}

test("real review handler still ranks with AI configured but absent permission and no provider calls", async () => {
  const previous = process.env.AI_GATEWAY_ENABLED;
  const originalFetch = globalThis.fetch;
  process.env.AI_GATEWAY_ENABLED = "true";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Forbidden provider transport"); };
  try {
    const output = responseCapture();
    await deepReview({ method: "POST", headers: { "x-forwarded-for": "consent-review-local" }, body: {
      theme: "coffee", candidates: [{ domain: "coffeegrove.com", status: "available", availabilityVerified: true, checkMethod: "rdap" }],
    } }, output.response);
    assert.equal(output.result().status, 200);
    assert.equal(output.result().body.analysisSource, "local");
    assert.equal((output.result().body.top10 as unknown[]).length, 1);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.AI_GATEWAY_ENABLED; else process.env.AI_GATEWAY_ENABLED = previous;
  }
});

test("real product handlers reject stale permission before any provider call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Forbidden provider transport"); };
  try {
    for (const handler of [domainSearch, deepReview]) {
      const output = responseCapture();
      await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "consent-invalid" },
        body: { aiConsent: { ...consent, version: "old" }, tlds: ["com"] } }, output.response);
      assert.equal(output.result().status, 400);
      assert.equal(output.result().body.code, "ai_consent_invalid");
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("advanced search without permission and exact checks with permission never call third-party AI", async () => {
  const previous = process.env.AI_GATEWAY_ENABLED;
  const originalFetch = globalThis.fetch;
  process.env.AI_GATEWAY_ENABLED = "true";
  const urls: string[] = [];
  globalThis.fetch = async input => { urls.push(String(input)); return new Response("", { status: 404 }); };
  try {
    for (const exact of [false, true]) {
      const output = responseCapture();
      await domainSearch({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `consent-search-${exact}` },
        body: { advanced: true, theme: "coffee", brief: "A small coffee business with friendly easy to spell names.",
          tlds: ["se"], providers: ["cloudflare"], count: 1,
          ...(exact ? { domains: ["coffeegrove.se"], aiConsent: consent } : {}) } }, output.response);
      assert.equal(output.result().status, 200);
      assert.equal((output.result().body.briefAnalysis as { mode: string }).mode, "local");
    }
    assert.equal(urls.some(url => url.includes("ai-gateway") || url.includes("generativelanguage")), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.AI_GATEWAY_ENABLED; else process.env.AI_GATEWAY_ENABLED = previous;
  }
});

test("stable API and MCP search cannot opt into hidden advanced/AI paths", () => {
  const body = { query: "coffee", tlds: ["com"] };
  for (const extra of [{ advanced: true }, { brief: "private briefing" }, { aiConsent: consent }]) {
    assert.throws(() => parseNamesApiRequest({ ...body, ...extra }));
    assert.throws(() => parseProductOperationInput("domains_search", { ...body, ...extra }));
  }
  assert.equal(parseNamesApiRequest(body).theme, "coffee");
  assert.equal(parseProductOperationInput("domains_search", body).query, "coffee");
});

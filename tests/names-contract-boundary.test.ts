import assert from "node:assert/strict";
import test from "node:test";
import { parseNamesApiRequest } from "../api/_shared/names-contract.js";
import publicDomains from "../api/v1/public/domains.js";
import { createDomainsApiHandler } from "../api/v1/domains.js";
import { createMcpProductExecutor } from "../api/_shared/mcp-product.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import type { ApiKeyPrincipal } from "../api/_shared/developer-api-keys.js";

const implicitList = Array.from({ length: 12 }, (_, index) => `${String.fromCharCode(97 + index)}.com`).join(" ");
const response = () => ({
  code: 200, body: undefined as unknown,
  status(code: number) { this.code = code; return this; },
  setHeader() {}, json(body: unknown) { this.body = body; }, end(body?: string) { this.body = body; },
});

test("machine query cannot silently become an oversized exact list or bypass selected endings", () => {
  assert.ok(implicitList.length <= 100, "The regression must pass the ordinary query size guard.");
  for (const query of [implicitList, "example.net", "A business inspired by example.net", "https://example.net/path"])
    assert.throws(() => parseNamesApiRequest({ query, tlds: ["com"], count: 1 }), /domains.*exact|exact.*domains/iu, query);
  assert.deepEqual(parseNamesApiRequest({ domains: ["EXAMPLE.NET"], tlds: ["net"], count: 1 }).domains, ["example.net"]);
});

test("public REST rejects implicit exact query before any provider call instead of returning twelve for one", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  };
  try {
    for (const [index, query] of [implicitList, "example.net"].entries()) {
      const result = response();
      await publicDomains({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${80 + index}` },
        body: { query, tlds: ["com"], providers: ["loopia"], count: 1 } }, result);
      assert.equal(result.code, 400, "Implicit exact names must not reach the broader UI parser.");
      assert.match(JSON.stringify(result.body), /domains.*exact|exact.*domains/iu);
    }
    assert.equal(providerCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("ordinary punctuation, multilingual briefs and empty exploration remain valid machine queries", () => {
  for (const query of ["", "Nordic design studio.", "Clear. Short. Easy to remember.", "A studio, e.g. for furniture design.",
    "Version 2.0 for designers", "A.I. tools for founders", "Dr. Smith and friends", "Stilren design. För småföretag!",
    "Création de noms. Pour les cafés.", "Una marca para pequeñas empresas.", "现代品牌。适合设计工作室。",
    "Short names for a .com business", "Clean... memorable... modern"])
    assert.equal(parseNamesApiRequest({ query, tlds: ["com"], count: 1 }).theme, query);
});

test("authenticated REST rejects implicit exact names without provider work", async () => {
  const principal: ApiKeyPrincipal = { userId: "synthetic-names-owner", keyId: "synthetic-key", scopes: ["domains:search"], environment: "development" };
  const handler = createDomainsApiHandler({
    authenticate: async () => ({ status: "authenticated", principal, clientId: "synthetic-names-owner" }),
    quota: async () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 }),
  });
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw new Error("Offline contract test forbids network."); };
  try {
    for (const query of [implicitList, "example.net"]) {
      const result = response();
      await handler({ method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"s".repeat(32)}` },
        body: { query, tlds: ["com"], count: 1 } }, result);
      assert.equal(result.code, 400);
      assert.equal((result.body as { code: string }).code, "invalid_request");
    }
    assert.equal(providerCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("authenticated MCP rejects implicit exact names before product quota or engine dispatch", async () => {
  const principal: ApiKeyPrincipal = { userId: "synthetic-mcp-owner", keyId: "synthetic-key", scopes: ["domains:search"], environment: "development" };
  let quotaCalls = 0, engineCalls = 0;
  const execute = createMcpProductExecutor({
    quota: async () => { quotaCalls++; return { allowed: true, remaining: 100, resetAt: Date.now() + 60_000 }; },
    domainSearch: async () => { engineCalls++; throw new Error("Implicit exact query must not enter the engine."); },
  });
  for (const query of [implicitList, "example.net"])
    await assert.rejects(execute("domains_search", { query, tlds: ["com"], count: 1 }, principal),
      error => error instanceof AccountAccessError && error.code === "invalid_request" && error.status === 400);
  assert.equal(quotaCalls, 0);
  assert.equal(engineCalls, 0);
});

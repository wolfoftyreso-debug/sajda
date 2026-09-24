/** Anonymous MCP conformance probe. --live makes two bounded read-only searches
 * against real registry/registrar providers. Never uses preview bypass or keys. */
import assert from "node:assert/strict";
import { CONNECTOR_HOSTS } from "../shared/connector-catalogue.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = new URL(process.env.SAJDA_TEST_ORIGIN || "http://127.0.0.1:8095");
assert.ok((origin.protocol === "https:" || (origin.protocol === "http:" && origin.hostname === "127.0.0.1")) &&
  !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/", "Use a clean HTTPS origin or loopback QA origin.");
const client = new Client({ name: "sajda-public-connector-probe", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("/api/mcp/public", origin), {
  fetch: (url, options) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(65_000) }),
});
try {
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.version, "1.6.0");
  assert.deepEqual((await client.listPrompts()).prompts.map(prompt => prompt.name), ["sajda-naming-companion", "find-business-names"]);
  assert.deepEqual((await client.listResources()).resources.map(resource => resource.uri), ["sajda://connector/guide", "sajda://connector/policy"]);
  const policyResource = await client.readResource({ uri: "sajda://connector/policy" });
  const policy = JSON.parse(policyResource.contents[0].text);
  assert.equal(policy.background_chat_access, false);
  assert.equal(policy.requires_consent_before_search, true);
  const prompt = await client.getPrompt({ name: "sajda-naming-companion", arguments: { locale: "sv" } });
  assert.ok(prompt.messages[0].content.text.includes("Vill du att Sajda tar fram 10 företagsnamn"));
  await assert.rejects(client.getPrompt({ name: "sajda-naming-companion", arguments: { chat: "must not accept transcripts" } }), /optional locale/u);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["business_names_recommend", "domains_suggest", "domains_check", "name_packages_search", "brand_index_assess", "brand_lookup"]);
  assert.ok(tools.every(tool => tool.annotations?.readOnlyHint && !tool.annotations?.destructiveHint));
  console.log(JSON.stringify({ event: "anonymous_mcp_discovery_pass", origin: origin.origin, tools: tools.map(tool => tool.name) }));
  if (process.argv.includes("--business")) {
    const result = await client.callTool({ name: "business_names_recommend", arguments: {
      businessDescription: "Software for small businesses to plan delivery routes and reduce logistics administration",
      nameLanguage: "fr", locale: "sv", tlds: ["com"], count: 10, markets: ["US", "FR"], platforms: ["github"], providers: ["loopia"],
    } }, undefined, { timeout: 65_000 });
    assert.equal(result.structuredContent?.ok, true);
    const data = result.structuredContent.data;
    assert.equal(data.schema_version, "sajda.business-names.v1");
    assert.equal(data.requested_count, 10);
    assert.equal(data.returned_count, data.recommendations.length);
    assert.ok(data.returned_count <= 10);
    assert.equal(data.completeness, data.returned_count === 10 ? "complete" : data.returned_count ? "partial" : "none");
    assert.equal(data.methodology.ai_used, false);
    assert.equal(data.result_summary.locale, "sv");
    assert.equal(data.result_summary.counts.returned, data.returned_count);
    assert.equal(data.result_summary.counts.missing, 10 - data.returned_count);
    assert.ok(data.result_summary.next_steps.length > 0);
    if (data.returned_count < 10) assert.ok(data.result_summary.reasons.length > 0);
    assert.equal(result.content[0].type, "text");
    assert.ok(result.content[0].text.startsWith(data.result_summary.headline));
    assert.ok(result.content[0].text.includes(data.result_summary.explanation));
    assert.match(result.content[0].text, /^Vi hittade/u);
    for (const row of data.recommendations) {
      assert.ok(row.available_domains.length > 0);
      for (const domain of row.available_domains) assert.ok(row.package.evidence.domains.some(item =>
        item.domain === domain && item.status === "available" && item.authoritative && item.freshness.status === "fresh"));
      assert.equal(row.package.brand_index.legalClearance, false);
    }
    console.log(JSON.stringify({ event: "anonymous_business_names_pass", origin: origin.origin,
      returned: data.returned_count, completeness: data.completeness, explanation: result.content[0].text,
      checkedDomainStatuses: data.intelligence.packages.flatMap(row => row.evidence.domains.map(domain => domain.status)),
      names: data.recommendations.map(row => ({ name: row.name, domains: row.available_domains, index: row.package.brand_index.score })) }));
  }
  if (process.argv.includes("--isolated")) {
    for (const path of ["/", "/api/auth", "/api/account/membership", "/api/mcp"]) {
      const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, path === "/" ? 200 : 404);
      assert.equal(response.headers.get("set-cookie"), null);
      console.log(JSON.stringify({ event: "anonymous_isolation_pass", path, status: response.status }));
    }
    const manifestResponse = await fetch(new URL("/connector.json", origin), { redirect: "error" });
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.public_tools.length, 6);
    assert.deepEqual(manifest.host_install_paths_documented, CONNECTOR_HOSTS.map(host => host.name));
    for (const host of CONNECTOR_HOSTS) {
      const logo = await fetch(new URL(host.logo, origin), { redirect: "error", signal: AbortSignal.timeout(15000) });
      assert.equal(logo.status, 200, host.id);
      assert.match(logo.headers.get("content-type"), /image\/svg\+xml/u);
      assert.match(await logo.text(), /<svg\s/u);
    }
    assert.deepEqual(manifest.host_install_e2e_verified, []);
    const kitResponse = await fetch(new URL("/downloads/sajda-connector.zip", origin), { redirect: "error" });
    assert.equal(kitResponse.status, 200);
    const kit = Buffer.from(await kitResponse.arrayBuffer());
    const { createHash } = await import("node:crypto");
    assert.equal(createHash("sha256").update(kit).digest("hex"), manifest.kit_sha256);
    assert.equal(kit.readUInt32LE(0), 0x04034b50);
    console.log(JSON.stringify({ event: "public_install_kit_pass", bytes: kit.length, hosts: manifest.host_install_paths_documented }));
  }
  if (process.argv.includes("--live")) {
    const result = await client.callTool({ name: "domains_suggest", arguments: {
      query: "calm planning app for independent founders", tlds: ["com", "app", "dev"], count: 10, locale: "en",
      budget: { amount: 30, currency: "USD", period: "first_year" },
    } }, undefined, { timeout: 65_000 });
    const output = result.structuredContent;
    assert.equal(output?.ok, true, JSON.stringify(output));
    const data = output.data;
    assert.equal(data.purchasePerformed, false);
    assert.equal(data.requestedCount, 10);
    assert.ok(data.returnedCount <= 10);
    assert.equal(data.items.length, data.returnedCount);
    assert.equal(data.shortfall, 10 - data.returnedCount);
    assert.equal(data.confirmedCount, data.returnedCount);
    assert.equal(data.result_summary.counts.returned, data.confirmedCount);
    assert.equal(data.result_summary.counts.missing, data.shortfall);
    assert.equal(data.result_summary.stop_reason, data.search.stopReason);
    assert.ok(result.content[0].text.startsWith(data.result_summary.headline));
    assert.ok(result.content[0].text.includes(data.result_summary.explanation));
    assert.ok(data.items.every(item => item.evidenceType === "confirmed_exact_offer"));
    assert.equal(data.provisionalCount, data.provisionalItems.length);
    assert.ok(data.provisionalItems.every(item => item.evidenceType === "conditional_tld_estimate"));
    assert.ok(data.search.candidatePoolSize > 10 && data.search.candidatePoolSize <= 120);
    assert.ok(data.search.quoteBatches <= 6);
    // A conforming partial/empty response is NOT acceptance of the ten-exact-
    // matches product goal. Keep that readiness result separate from protocol QA.
    console.log(JSON.stringify({ event: "ten_exact_budget_matches", achieved: data.confirmedCount === 10,
      confirmed: data.confirmedCount, provisional: data.provisionalCount, stopReason: data.search.stopReason }));
    console.log(JSON.stringify({ event: "live_budget_shortlist", data }));
    const exact = await client.callTool({ name: "domains_check", arguments: { domains: ["example.com"], locale: "en" } }, undefined, { timeout: 65_000 });
    assert.equal(exact.structuredContent?.ok, true);
    const checked = exact.structuredContent.data;
    assert.equal(checked.purchasePerformed, false);
    assert.equal(checked.results.length, 1);
    assert.equal(checked.results[0].domain, "example.com");
    assert.equal(checked.results[0].status, "taken", "Known registered domain must not be recommended as available.");
    console.log(JSON.stringify({ event: "live_exact_check", domain: checked.results[0].domain,
      status: checked.results[0].status, source: checked.results[0].source, checkedAt: checked.results[0].checkedAt }));
  }
} finally { await client.close(); }

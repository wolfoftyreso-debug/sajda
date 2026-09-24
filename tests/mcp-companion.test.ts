import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "../api/mcp.js";
import { createPublicMcpHandler } from "../api/mcp/public.js";
import { CONNECTOR_HOST_INSTRUCTIONS, CONNECTOR_POLICY, getConnectorOffer } from "../shared/connector-policy.js";

async function serve(t: TestContext, access: "public" | "private") {
  const calls: string[] = [], quotas: string[] = [];
  let now = 1_000_000;
  const handler = access === "public"
    ? createPublicMcpHandler({ requestOrigin: () => "http://localhost", now: () => now,
      execute: async operation => { calls.push(operation); throw new Error("Metadata must not execute product work"); } })
    : createMcpHandler({ requestOrigin: () => "http://localhost",
      authorize: async () => ({ userId: "metadata-only", keyId: "metadata-only", scopes: [], environment: "development" }),
      quota: async (_principal, dimension) => { quotas.push(dimension); return { allowed: true, remaining: 100, resetAt: now + 60_000 }; },
      execute: async operation => { calls.push(operation); throw new Error("Metadata must not execute product work"); } });
  const http = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/mcp${access === "public" ? "/public" : ""}`;
  const client = new Client({ name: "sajda-companion-protocol-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(url), access === "private"
    ? { requestInit: { headers: { authorization: "Bearer metadata-only" } } } : undefined);
  t.after(async () => { await client.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); });
  await client.connect(transport);
  const post = (method: string, params?: Record<string, unknown>) => fetch(url, { method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 50, method, ...(params ? { params } : {}) }) });
  return { client, calls, quotas, post, transport, reset: () => { now += 60_000; } };
}

const invalidParams = (error: unknown) => error instanceof McpError && error.code === ErrorCode.InvalidParams;

for (const access of ["public", "private"] as const) {
  test(`${access} HTTP SDK discovers static companion prompts and policy without product work`, async t => {
    const fixture = await serve(t, access), { client } = fixture;
    assert.equal(client.getServerVersion()?.version, access === "public" ? "1.6.0" : "1.5.0");
    assert.equal(fixture.transport.sessionId, undefined);
    assert.deepEqual(client.getServerCapabilities()?.prompts, { listChanged: false });
    assert.deepEqual(client.getServerCapabilities()?.resources, { subscribe: false, listChanged: false });
    assert.equal(client.getServerCapabilities()?.tasks, undefined);
    assert.ok(client.getInstructions()?.includes(CONNECTOR_HOST_INSTRUCTIONS));
    const catalogue = await client.listPrompts();
    assert.deepEqual(catalogue.prompts.map(prompt => prompt.name), ["sajda-naming-companion", "find-business-names"]);
    assert.equal(catalogue.nextCursor, undefined);
    for (const prompt of catalogue.prompts) assert.deepEqual(prompt.arguments?.map(argument => [argument.name, argument.required]), [["locale", false]]);
    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map(resource => resource.uri), ["sajda://connector/guide", "sajda://connector/policy"]);
    assert.deepEqual((await client.listResourceTemplates()).resourceTemplates, []);
    const policy = (await client.readResource({ uri: "sajda://connector/policy" })).contents[0];
    assert.equal(policy.mimeType, "application/json");
    assert.ok("text" in policy);
    assert.deepEqual(JSON.parse(policy.text), CONNECTOR_POLICY);
    const guide = (await client.readResource({ uri: "sajda://connector/guide" })).contents[0];
    assert.equal(guide.mimeType, "text/markdown"); assert.ok("text" in guide);
    assert.match(guide.text, /Merely installing Sajda.*does not enable contextual offers or authorize a search/u);
    assert.match(guide.text, /no chat-history reader, background listener/u);
    assert.match(guide.text, /before calling|before.*acceptance|wait for the user's acceptance/u);
    assert.ok(guide.text.includes(CONNECTOR_HOST_INSTRUCTIONS));
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, access === "public" ? 6 : 21);
    const naming = tools.find(tool => tool.name === "business_names_recommend")!;
    assert.match(naming.description!, /concrete new business, product or project/u);
    assert.match(naming.description!, /ask before sending a brief/u);
    assert.match(naming.description!, /Never upload chat history/u);
    assert.deepEqual(fixture.calls, []);
    if (access === "private") {
      assert.ok(fixture.quotas.length > 0);
      assert.ok(fixture.quotas.every(dimension => dimension === "requests"), "Only generic request quota, no product/search quota");
    }
  });

  test(`${access} HTTP SDK retrieves localized opt-in prompts without granting search consent`, async t => {
    const fixture = await serve(t, access), { client } = fixture;
    for (const locale of ["en", "sv", "es", "fr", "zh"] as const) {
      const companion = await client.getPrompt({ name: "sajda-naming-companion", arguments: { locale } });
      assert.equal(companion.messages.length, 1); assert.equal(companion.messages[0].role, "user");
      const content = companion.messages[0].content; assert.equal(content.type, "text");
      assert.ok(content.text.includes(getConnectorOffer(locale)));
      assert.ok(content.text.includes(CONNECTOR_HOST_INSTRUCTIONS));
      assert.match(content.text, /permission to offer, not permission to send my business brief or search/u);
      assert.match(content.text, /only retrieved for inspection, do not enable offers/u);
    }
    const start = (await client.getPrompt({ name: "find-business-names" })).messages[0].content;
    assert.equal(start.type, "text");
    assert.match(start.text, /ask for my acceptance before calling business_names_recommend with count 10/u);
    assert.match(start.text, /desired naming language/u);
    assert.match(start.text, /Retrieving this prompt alone does not authorize any search/u);
    assert.deepEqual(fixture.calls, []);
  });

  test(`${access} HTTP SDK rejects unknown prompts, unapproved arguments and non-catalogue resources`, async t => {
    const fixture = await serve(t, access), { client } = fixture;
    await assert.rejects(client.getPrompt({ name: "start-background-chat-reader" }), invalidParams);
    for (const args of [{ locale: "de" }, { locale: "sv-SE" }, { locale: "" }, { conversation: "private transcript" },
      { businessDescription: "private idea" }, { brief: "private idea" }, { consent: "true" }, { locale: "sv", userId: "other" }]) {
      await assert.rejects(client.getPrompt({ name: "sajda-naming-companion", arguments: args }), invalidParams);
      await assert.rejects(client.getPrompt({ name: "find-business-names", arguments: args }), invalidParams);
    }
    for (const uri of ["sajda://connector/unknown", "sajda://connector/policy?chat=private", "file:///secret", "http://127.0.0.1/admin"]) {
      await assert.rejects(client.readResource({ uri }), invalidParams);
    }
    await assert.rejects(client.listPrompts({ cursor: "unexpected" }), invalidParams);
    await assert.rejects(client.listResources({ cursor: "unexpected" }), invalidParams);
    await assert.rejects(client.listResourceTemplates({ cursor: "unexpected" }), invalidParams);
    const subscribed = await fixture.post("resources/subscribe", { uri: "sajda://connector/policy" });
    assert.equal((await subscribed.json()).error.code, ErrorCode.MethodNotFound);
    assert.deepEqual(fixture.calls, []);
  });
}

test("new public metadata methods remain bounded by the shared request guard without searches", async t => {
  const fixture = await serve(t, "public");
  fixture.reset(); // Ignore the initialize/initialized messages from the completed handshake.
  for (let count = 0; count < 120; count++) {
    const response = await fixture.post(count % 2 ? "prompts/get" : "resources/read", count % 2
      ? { name: "sajda-naming-companion", arguments: { locale: "sv" } } : { uri: "sajda://connector/policy" });
    assert.equal(response.status, 200); assert.ok((await response.json()).result);
  }
  const limited = await fixture.post("prompts/list");
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
  fixture.reset();
  assert.equal((await fixture.post("resources/list")).status, 200);
  assert.deepEqual(fixture.calls, []);
});

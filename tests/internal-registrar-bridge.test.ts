import assert from "node:assert/strict";
import { request as httpRequest, createServer } from "node:http";
import test from "node:test";
import handler from "../infra/public-connector/internal-registrar.js";

const bridgeToken = "test_bridge_token_1234567890123456789012";
const accountId = "0123456789abcdef0123456789abcdef";
const connectorToken = "connector_test_token";

function call(port: number, options: { authorization?: string; body?: string; contentType?: string; method?: string } = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: unknown }>((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: "/api/internal/registrar/cloudflare",
      method: options.method ?? "POST", headers: { ...(options.authorization ? { Authorization: options.authorization } : {}),
        "Content-Type": options.contentType ?? "application/json" } }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers,
        body: text ? JSON.parse(text) as unknown : null }));
    });
    request.on("error", reject);
    request.end(options.body ?? JSON.stringify({ domains: ["nordkit.com"] }));
  });
}

test("private registrar bridge rejects anonymous callers and batches authenticated read-only checks", async t => {
  const names = Array.from({ length: 21 }, (_, index) => `nordkit${index}.com`);
  const saved = { bridge: process.env.SAJDA_REGISTRAR_BRIDGE_TOKEN,
    account: process.env.SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID, connector: process.env.SAJDA_CONNECTOR_CLOUDFLARE_TOKEN };
  process.env.SAJDA_REGISTRAR_BRIDGE_TOKEN = bridgeToken;
  process.env.SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID = accountId;
  process.env.SAJDA_CONNECTOR_CLOUDFLARE_TOKEN = connectorToken;
  t.after(() => {
    for (const [name, value] of [["SAJDA_REGISTRAR_BRIDGE_TOKEN", saved.bridge],
      ["SAJDA_CONNECTOR_CLOUDFLARE_ACCOUNT_ID", saved.account], ["SAJDA_CONNECTOR_CLOUDFLARE_TOKEN", saved.connector]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const providerCalls: string[][] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${connectorToken}`);
    const domains = (JSON.parse(String(init?.body)) as { domains: string[] }).domains;
    providerCalls.push(domains);
    return Response.json({ success: true, errors: [], messages: [], result: { domains: domains.map(name => ({
      name, registrable: true, tier: "standard", pricing: { currency: "USD", registration_cost: "10.46", renewal_cost: "10.46" },
    })) } });
  });
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())); });

  const anonymous = await call(address.port);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.body, { error: "unauthorized" });
  assert.equal(providerCalls.length, 0);
  const invalid = await call(address.port, { authorization: `Bearer ${bridgeToken}`, body: JSON.stringify({ domains: ["NordKit.com"] }) });
  assert.equal(invalid.status, 400);
  assert.equal(providerCalls.length, 0);
  const result = await call(address.port, { authorization: `Bearer ${bridgeToken}`, body: JSON.stringify({ domains: names }) });
  assert.equal(result.status, 200);
  assert.deepEqual(providerCalls.map(batch => batch.length), [20, 1]);
  assert.equal((result.body as { status: string }).status, "ok");
  assert.equal(Object.keys((result.body as { offers: Record<string, unknown> }).offers).length, 21);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(`${bridgeToken}|${connectorToken}|${accountId}`));
});

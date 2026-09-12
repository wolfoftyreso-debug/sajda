import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("isolated public deployment bundles no private services and serves only anonymous MCP", async t => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const built = spawnSync(process.execPath, ["scripts/build-public-connector.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).privateDependencies, 0);
  const output = new URL("../tmp/public-connector-release/.vercel/output/", import.meta.url);
  const config = JSON.parse(await readFile(new URL("config.json", output), "utf8"));
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes.filter(route => route.dest === "/api/mcp/public").map(route => route.src), ["/api/mcp/public"]);
  assert.equal(config.routes.at(-1).status, 404);
  assert.equal(config.crons, undefined);
  const functionConfig = JSON.parse(await readFile(new URL("functions/api/mcp/public.func/.vc-config.json", output), "utf8"));
  assert.equal(functionConfig.runtime, "nodejs24.x");
  assert.equal(functionConfig.maxDuration, 60);
  assert.equal(functionConfig.environment, undefined);
  const { default: handler } = await import(new URL("functions/api/mcp/public.func/index.mjs", output));
  const server = createServer((req, res) => void handler(req, res));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const old = { VERCEL: process.env.VERCEL, VERCEL_URL: process.env.VERCEL_URL };
  process.env.VERCEL = "1"; process.env.VERCEL_URL = host;
  t.after(async () => {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  const client = new Client({ name: "artifact-qa", version: "1" });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://${host}/api/mcp/public`)));
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ["domains_suggest", "domains_check"]);
  for (const path of ["/api/mcp", "/api/account/membership", "/api/auth", "/api/domain-search", "/anything"])
    assert.equal((await fetch(`http://${host}${path}`)).status, 404, path);
  await assert.rejects(client.callTool({ name: "account_get", arguments: {} }), /Unknown public/u);
});

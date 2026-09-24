import assert from "node:assert/strict";
import test from "node:test";
import { CONNECTOR_HOSTS } from "../shared/connector-catalogue.mjs";
import { connectorConfig, connectorInstallUrl } from "../shared/connector-install.mjs";

const endpoint = "https://sajda-connector.vercel.app/api/mcp/public";

test("remote host configurations retain each client's documented transport and approval format", () => {
  const expected = {
    cursor: { mcpServers: { sajda: { url: endpoint } } },
    vscode: { servers: { sajda: { type: "http", url: endpoint } } },
    windsurf: { mcpServers: { sajda: { serverUrl: endpoint } } },
    cline: { mcpServers: { sajda: { type: "streamableHttp", url: endpoint, disabled: false, autoApprove: [] } } },
    zed: { context_servers: { sajda: { url: endpoint } } },
    "gemini-cli": { mcpServers: { sajda: { httpUrl: endpoint } } },
  };
  for (const [host, config] of Object.entries(expected)) {
    const result = connectorConfig(host, endpoint);
    assert.deepEqual(JSON.parse(result), config, `${host}: do not substitute a different host's JSON schema`);
    assert.doesNotMatch(result, /Authorization|Bearer|api[_-]?key|secret|trust/iu);
  }
  assert.equal(connectorConfig("codex", endpoint), `[mcp_servers.sajda]\nurl = "${endpoint}"\n`);
  for (const host of ["chatgpt", "claude", "grok", "perplexity", "replit", "lovable"]) {
    assert.equal(connectorConfig(host, endpoint), null, `${host}: settings-based installation must not offer an invented config`);
  }
});

test("shared setup helpers reject unsafe, credential-bearing and private endpoints for remote installation", () => {
  const invalid = [
    "http://sajda.example/api/mcp/public", "javascript:alert(1)",
    "https://user:private-secret@sajda.example/api/mcp/public", endpoint + "?token=private-secret", endpoint + "#fragment",
    "https://sajda.example/api/mcp", "https://sajda.example/api/mcp/public/", "https://sajda.example/",
    "https://localhost/api/mcp/public", "https://dev.localhost/api/mcp/public", "https://service.local/api/mcp/public",
    "https://127.0.0.1/api/mcp/public", "https://192.168.1.7/api/mcp/public", "https://[::1]/api/mcp/public",
    "https://intranet/api/mcp/public",
  ];
  for (const host of CONNECTOR_HOSTS) {
    assert.equal(connectorInstallUrl(host.id, null), null);
    assert.equal(connectorConfig(host.id, null), null);
    for (const url of invalid) {
      assert.throws(() => connectorInstallUrl(host.id, url), undefined, `${host.id}: rejected ${url}`);
      if (host.configKind !== "none") assert.throws(() => connectorConfig(host.id, url), undefined, `${host.id}: no copyable config for ${url}`);
    }
  }
  for (const unknown of ["unsupported", "constructor", "__proto__"]) {
    assert.throws(() => connectorInstallUrl(unknown, endpoint), /Unknown connector host/u);
    assert.throws(() => connectorConfig(unknown, endpoint), /Unknown connector host/u);
  }
});

test("settings-based clients and documented review links never substitute another host's installation route", () => {
  const exact = {
    chatgpt: "https://chatgpt.com/plugins",
    grok: "https://grok.com/connectors",
    lovable: "https://lovable.dev/dashboard?connectors=",
  };
  for (const [host, url] of Object.entries(exact)) assert.equal(connectorInstallUrl(host, endpoint), url);
  const claude = new URL(connectorInstallUrl("claude", endpoint));
  assert.equal(claude.origin + claude.pathname, "https://claude.ai/customize/connectors");
  assert.deepEqual(Object.fromEntries(claude.searchParams), { modal: "add-custom-connector", connectorName: "Sajda", connectorUrl: endpoint });
  const cursor = new URL(connectorInstallUrl("cursor", endpoint));
  assert.equal(cursor.origin + cursor.pathname, "https://cursor.com/link/mcp/install");
  assert.deepEqual(JSON.parse(atob(cursor.searchParams.get("config"))), { url: endpoint });
  const replit = new URL(connectorInstallUrl("replit", endpoint));
  assert.equal(replit.origin + replit.pathname, "https://replit.com/integrations");
  assert.deepEqual(JSON.parse(atob(replit.searchParams.get("mcp"))), { displayName: "Sajda", baseUrl: endpoint });
  for (const host of CONNECTOR_HOSTS.filter(item => ["perplexity", "codex", "vscode", "windsurf", "cline", "zed", "gemini-cli"].includes(item.id))) {
    assert.equal(connectorInstallUrl(host.id, endpoint), host.documentation);
  }
});

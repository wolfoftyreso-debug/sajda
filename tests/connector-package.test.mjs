import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { CONNECTOR_POLICY, CONNECTOR_POLICY_VERSION } from "../shared/connector-policy.ts";

const packageRoot = new URL("../integrations/sajda-connector/", import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, packageRoot), "utf8"));

test("portable and compatibility manifests resolve the same self-contained naming plugin", async () => {
  const portable = await readJson("plugin.json");
  const compatibility = await readJson(".codex-plugin/plugin.json");
  assert.equal(portable.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(portable.name, "sajda-connector");
  assert.equal(portable.name, compatibility.name);
  assert.equal(portable.version, compatibility.version);
  assert.equal(portable.description, compatibility.description);
  assert.equal(portable.author.name, compatibility.author.name);
  assert.equal(compatibility.skills, "./skills/");
  assert.equal(compatibility.mcpServers, "./.mcp.json");
  assert.equal(portable.extensions["com.openai"].apps, undefined);
  assert.equal(compatibility.apps, undefined);
  assert.ok((await stat(new URL("skills/sajda-naming/SKILL.md", packageRoot))).isFile());
  assert.ok((await stat(new URL(compatibility.mcpServers, packageRoot))).isFile());
});

test("every distributed connection uses the canonical anonymous endpoint without credentials", async () => {
  const portable = await readJson("mcp.json");
  assert.equal(portable.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  assert.deepEqual(portable.mcpServers, {
    sajda: { type: "streamable-http", url: CONNECTOR_POLICY.endpoint },
  });
  assert.deepEqual((await readJson(".mcp.json")).mcpServers, {
    sajda: { type: "http", url: CONNECTOR_POLICY.endpoint },
  });
  assert.deepEqual((await readJson("configs/cursor/mcp.json")).mcpServers, {
    sajda: { url: CONNECTOR_POLICY.endpoint },
  });
  assert.deepEqual(await readJson("configs/replit/install.json"), {
    displayName: "Sajda", baseUrl: CONNECTOR_POLICY.endpoint,
  });
});

test("host templates use one canonical policy insertion and skill declares its reviewed policy version", async () => {
  for (const path of ["configs/cursor/sajda-naming.mdc", "configs/replit/replit.md", "configs/lovable/project-instructions.md"]) {
    const template = await readFile(new URL(path, packageRoot), "utf8");
    assert.equal(template.split("<!-- SAJDA_HOST_POLICY -->").length, 2, `${path} must receive exactly one policy expansion`);
    assert.ok(!template.includes("[TODO:"));
  }
  const skill = await readFile(new URL("skills/sajda-naming/SKILL.md", packageRoot), "utf8");
  assert.ok(skill.includes(CONNECTOR_POLICY_VERSION), "Review the concise skill when the shared policy version changes");
  assert.ok(!skill.includes("[TODO:"));
});

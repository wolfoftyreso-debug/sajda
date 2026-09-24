import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { buildConnectorKit, CONNECTOR_KIT_FILES } from "../scripts/build-connector-kit.mjs";
import { createConnectorZip } from "../scripts/connector-archive.mjs";
import { renderConnectorHub } from "../scripts/connector-hub.mjs";
import { CONNECTOR_HOSTS, CONNECTOR_REVIEWED_AT } from "../shared/connector-catalogue.mjs";
import { connectorConfig, connectorInstallUrl } from "../shared/connector-install.mjs";

test("ZIP paths are bounded, deterministic and safe", () => {
  const entries = [{ name: "skills/sajda-naming/SKILL.md", data: "Svenska åäö 中文" }];
  assert.deepEqual(createConnectorZip(entries), createConnectorZip(entries));
  for (const name of ["../secret", "/secret", "a/../secret", "a\\secret", "a//secret"])
    assert.throws(() => createConnectorZip([{ name, data: "x" }]), /Unsafe/u);
  assert.throws(() => createConnectorZip([...entries, ...entries]), /duplicate/u);
  assert.throws(() => createConnectorZip([{ name: "big.txt", data: "x".repeat(256001) }]), /limit/u);
});

test("distribution contains only approved files with one current policy", async () => {
  const output = await mkdtemp(join(tmpdir(), "sajda-connector-kit-"));
  const report = await buildConnectorKit(fileURLToPath(new URL("..", import.meta.url)), output);
  assert.equal(report.files.length, CONNECTOR_KIT_FILES.length + 2);
  const zip = await readFile(join(output, "downloads/sajda-connector.zip"));
  assert.equal(createHash("sha256").update(zip).digest("hex"), report.sha256);
  const policy = JSON.parse(await readFile(join(output, "policy.json"), "utf8"));
  assert.equal(policy.background_chat_access, false);
  assert.equal(policy.requires_consent_before_search, true);
  const instructions = await readFile(join(output, "host-instructions.txt"), "utf8");
  const entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const length = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26);
    assert.equal(zip.readUInt16LE(offset + 8), 0);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    entries.set(name, zip.toString("utf8", offset + 30 + nameLength, offset + 30 + nameLength + length));
    offset += 30 + nameLength + length;
  }
  assert.deepEqual([...entries.keys()], report.files);
  assert.equal(entries.get("HOST-INSTRUCTIONS.md"), instructions);
  for (const name of ["configs/cursor/sajda-naming.mdc", "configs/replit/replit.md", "configs/lovable/project-instructions.md"]) {
    assert.ok(entries.get(name).includes(instructions.trim()));
    assert.ok(!entries.get(name).includes("<!-- SAJDA_HOST_POLICY -->"));
  }
  const manifest = JSON.parse(await readFile(join(output, "connector.json"), "utf8"));
  assert.equal(manifest.kit_sha256, report.sha256);
  assert.deepEqual(manifest.host_install_e2e_verified, []);
  assert.equal(manifest.background_chat_access, false);
  assert.deepEqual(manifest.host_install_paths_documented, CONNECTOR_HOSTS.map(host => host.name));
  assert.equal(manifest.host_install_paths_documented.length, 13);
  assert.equal(manifest.directory_approval, "not_claimed");
  assert.equal(manifest.authentication, "none");
  assert.equal(manifest.account_access.anonymous_private_access, false);
  assert.equal(manifest.account_access.public_endpoint_supports_accounts, false);
  assert.equal(manifest.account_access.oauth_available, false);
  assert.equal(manifest.account_access.authentication, "separate_scoped_api_key");
  assert.equal(manifest.account_access.instructions_url, "https://sajda-connector.vercel.app/#account");
});

test("public hub gives all 13 hosts local logos, documented setup and the correct public configuration", () => {
  const endpoint = "https://sajda-connector.vercel.app/api/mcp/public";
  const html = renderConnectorHub(endpoint);
  const $ = load(html);
  assert.equal($("#setup article").length, CONNECTOR_HOSTS.length);
  assert.equal($("#setup img").length, CONNECTOR_HOSTS.length);
  assert.equal($("#setup .host-group").length, 3);
  assert.equal($("#setup > code").text(), endpoint);
  for (const host of CONNECTOR_HOSTS) {
    const card = $(`#host-${host.id}`);
    assert.equal(card.length, 1);
    assert.equal(card.find("h3").text(), host.name);
    assert.equal(card.find("img").attr("src"), host.logo);
    assert.equal(card.find("img").attr("alt"), "");
    assert.ok(Number(card.find("img").attr("width")) > 0);
    assert.ok(Number(card.find("img").attr("height")) > 0);
    assert.deepEqual(card.find("li").toArray().map(item => $(item).text()), host.steps);
    assert.ok(card.text().includes(host.limitation));
    assert.equal(card.children("a").attr("href"), connectorInstallUrl(host.id, endpoint));
    assert.equal(card.find("details a").attr("href"), host.documentation);
    const configuration = connectorConfig(host.id, endpoint);
    assert.equal(card.find("pre").length, configuration ? 1 : 0);
    if (configuration) assert.equal(card.find("pre").text(), configuration);
    assert.doesNotMatch(card.find("pre").text(), /Bearer|Authorization|api[_-]?key|token/iu);
  }
  assert.equal($("script,iframe,form,input,object,embed").length, 0);
  assert.ok(!/\bon(?:load|click|error)\s*=/iu.test(html));
  assert.ok($("body").text().includes("not a claim of marketplace approval"));
  assert.ok($("body").text().includes(CONNECTOR_REVIEWED_AT));
  assert.ok($("body").text().includes("6 of 10"));
  assert.equal($('a[href="/connectors/LICENSE.txt"]').length, 1);
  for (const anchor of $('a[target="_blank"]').toArray()) {
    assert.match($(anchor).attr("rel"), /noopener/u);
    assert.match($(anchor).attr("rel"), /noreferrer/u);
  }
  const links = $("a[href]").toArray().map(anchor => $(anchor).attr("href"));
  const cursor = new URL(links.find(link => link.startsWith("https://cursor.com/link/mcp/install?")));
  assert.deepEqual(JSON.parse(Buffer.from(cursor.searchParams.get("config"), "base64").toString()), { url: endpoint });
  const replit = new URL(links.find(link => link.startsWith("https://replit.com/integrations?")));
  assert.deepEqual(JSON.parse(Buffer.from(replit.searchParams.get("mcp"), "base64").toString()), { displayName: "Sajda", baseUrl: endpoint });
});

test("public hub describes account access separately without inventing a usable private server or universal sign-in", () => {
  const endpoint = "https://sajda-connector.vercel.app/api/mcp/public";
  const $ = load(renderConnectorHub(endpoint));
  assert.equal($('header a[href="#account"]').text(), "Connect your Sajda account");
  const account = $("#account");
  assert.equal(account.length, 1);
  assert.match(account.text(), /authenticated API and MCP server/u);
  assert.match(account.text(), /separate from the anonymous search/u);
  assert.match(account.text(), /read-only key cannot write/u);
  assert.match(account.text(), /New keys do not include account access by default/u);
  assert.match(account.text(), /secure Authorization header field/u);
  assert.match(account.text(), /public connector cannot access private data/u);
  assert.match(account.text(), /ownership, permissions and your current plan/u);
  assert.match(account.text(), /not a universal OAuth sign-in claim/u);
  assert.doesNotMatch(account.text(), /search history|watchlist/iu);
  assert.equal(account.find("code,pre,input,form").length, 0);
  assert.ok(!account.text().includes(endpoint));
  assert.equal(account.find('a[href*="/api/mcp"],a[href*="token="],a[href*="key="]').length, 0);
});

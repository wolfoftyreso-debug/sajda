import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { load } from "cheerio";
import { CONNECTOR_HOSTS, CONNECTOR_REVIEWED_AT } from "../shared/connector-catalogue.mjs";

const root = new URL("../", import.meta.url);

test("connector inventory has reviewable official guidance for every supported host", () => {
  const ids = CONNECTOR_HOSTS.map(host => host.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ["chatgpt", "claude", "grok", "cursor", "replit", "lovable", "perplexity", "codex", "vscode", "windsurf", "cline", "zed", "gemini-cli"]) {
    assert.ok(ids.includes(required), `Missing host: ${required}`);
  }
  for (const host of CONNECTOR_HOSTS) {
    assert.match(host.id, /^[a-z]+(?:-[a-z]+)*$/u);
    assert.equal(new URL(host.documentation).protocol, "https:");
    assert.equal(host.reviewedAt, CONNECTOR_REVIEWED_AT);
    assert.equal(host.steps.length, 3);
    assert.ok(host.steps.every(step => step.length > 20));
    assert.ok(host.limitation.length > 20, `${host.id}: state the host-specific scope`);
    assert.equal(host.logo, `/connectors/${host.id}.svg`);
    assert.ok(["review-link", "settings", "configuration"].includes(host.installMethod));
  }
});

test("every connector logo matches a pinned licensed asset and is a standalone safe SVG", async t => {
  const provenance = JSON.parse(await readFile(new URL("docs/connector-logo-provenance.json", root), "utf8"));
  assert.deepEqual(provenance.assets.map(asset => asset.id).sort(), CONNECTOR_HOSTS.map(host => host.id).sort());
  const notice = await readFile(new URL(provenance.licenseNotice, root), "utf8");
  assert.match(notice, /Copyright \(c\) 2023 LobeHub/u);
  assert.match(notice, /Permission is hereby granted/u);
  assert.match(notice, /CC0 1\.0 Universal/u);

  for (const asset of provenance.assets) await t.test(asset.id, async () => {
    assert.match(asset.source, /^https:\/\/raw\.githubusercontent\.com\/(?:lobehub\/lobe-icons|simple-icons\/simple-icons)\/[a-f0-9]{40}\/.+\.svg$/u);
    assert.equal(asset.modified, false);
    const file = new URL(asset.file, root);
    assert.ok(fileURLToPath(file).startsWith(fileURLToPath(new URL("public-clean/connectors/", root))));
    const bytes = await readFile(file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, `${asset.id}: changed from pinned upstream bytes`);
    assert.ok(bytes.length > 100 && bytes.length < 32_768);
    const source = bytes.toString("utf8");
    assert.doesNotMatch(source, /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|@import|@font-face|javascript:|vbscript:/iu);
    const $ = load(source, { xmlMode: true });
    assert.equal($("svg").length, 1);
    const viewBox = $("svg").attr("viewBox")?.trim().split(/[\s,]+/u).map(Number);
    assert.ok(viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0);
    assert.ok($("path[d]").toArray().some(element => ($(element).attr("d")?.length ?? 0) > 40), "Published logo geometry must be present");
    assert.equal($("script,foreignObject,iframe,object,embed,image,text,font,font-face,animate,animateTransform,set").length, 0);
    for (const match of source.matchAll(/url\s*\(([^)]*)\)/giu)) {
      assert.match(match[1].trim().replace(/^["']|["']$/gu, ""), /^#[A-Za-z_][\w:.-]*$/u, "Paint references must stay inside the asset");
    }
    $("*").each((_index, element) => {
      for (const [name, value] of Object.entries(element.attribs ?? {})) {
        assert.doesNotMatch(name, /^on/iu, "No event handlers");
        if (name === "src" || /(?:^|:)href$/iu.test(name)) assert.match(value, /^#[A-Za-z_][\w:.-]*$/u, "No external dependencies");
      }
    });
  });
});

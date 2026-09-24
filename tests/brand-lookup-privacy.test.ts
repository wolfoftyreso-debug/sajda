import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("central privacy renders a five-language Wikidata recipient and bounded-cache disclosure", async () => {
  const source = await readFile(new URL("../src/pages/Legal.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("Legal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let dictionary: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "brandLookupPrivacy"
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) dictionary = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(dictionary);
  const entries = new Map<string, Record<string, string>>();
  for (const locale of dictionary.properties) {
    assert.ok(ts.isPropertyAssignment(locale) && ts.isIdentifier(locale.name) && ts.isObjectLiteralExpression(locale.initializer));
    const fields: Record<string, string> = {};
    for (const field of locale.initializer.properties) {
      assert.ok(ts.isPropertyAssignment(field) && ts.isIdentifier(field.name) && ts.isStringLiteral(field.initializer));
      fields[field.name.text] = field.initializer.text;
    }
    entries.set(locale.name.text, fields);
  }
  assert.deepEqual([...entries.keys()], ["en", "sv", "es", "fr", "zh"]);
  for (const [locale, fields] of entries) {
    assert.deepEqual(Object.keys(fields), ["title", "body"]); assert.ok(fields.title.length > 0);
    for (const value of ["Wikidata", "Q", "128", "5", "15"]) assert.ok(fields.body.includes(value), `${locale} must disclose ${value}`);
  }
  const english = entries.get("en")!.body;
  for (const pattern of [/name you enter/u, /chosen language/u, /without account credentials/u,
    /does not add your account email or project brief/u, /personal or confidential/u, /temporary server-memory cache/u,
    /not saved cloud or account profiles/u, /not a general retention guarantee/u, /contacts that service directly/u, /do not verify ownership/u]) {
    assert.match(english, pattern);
  }
  assert.match(source, /\{ icon: SearchCheck, \.\.\.brandLookupPrivacy\[language\] \}/u,
    "The disclosure must be part of the visible central privacy cards, not an unused dictionary.");
});

test("lookup privacy inventory distinguishes source cache behavior from retention and App Store declarations", async () => {
  const inventory = await readFile(new URL("../docs/APP-PRIVACY-INVENTORY.md", import.meta.url), "utf8");
  assert.match(inventory, /Name-first brand lookup \(SOURCE\)/u);
  assert.match(inventory, /Wikidata as a recipient/u); assert.match(inventory, /not a guaranteed physical purge schedule or a global retention guarantee/u);
  assert.match(inventory, /\*\*not\*\* a completed App Store privacy declaration/u);
  assert.match(inventory, /at\s+most 128 entries per instance, with 5-minute search and 15-minute profile/u);
  const client = await readFile(new URL("../src/lib/brandLookupClient.ts", import.meta.url), "utf8");
  assert.match(client, /credentials: "omit"/u);
  const adapter = await readFile(new URL("../api/_shared/brand-lookup.ts", import.meta.url), "utf8");
  assert.match(adapter, /cache\.size >= 128/u); assert.match(adapter, /300_000 : 900_000/u);
});

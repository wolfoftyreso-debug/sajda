import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isNativeUIReady, waitForNativeUI } from "../scripts/assert-ios-ready.mjs";

const ready = { ready: true, navigation: 5, heading: true, input: true,
  rootChildren: 1, documentState: "complete", errors: [] };

test("native readiness rejects a process, blank document, spinner, broken JS and missing controls", () => {
  assert.equal(isNativeUIReady(ready), true);
  for (const snapshot of [null, {}, { ready: true },
    { ...ready, navigation: 0 }, { ...ready, heading: false }, { ...ready, input: false },
    { ...ready, rootChildren: 0 }, { ...ready, documentState: "loading" },
    { ...ready, errors: ["Module failed"] }, { ...ready, evaluationFailed: true },
    { ...ready, errors: undefined }]) assert.equal(isNativeUIReady(snapshot), false);
});

test("native readiness records successful WebKit evidence and fails missing or blank evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sajda-native-ready-"));
  const source = path.join(directory, "source.json");
  const output = path.join(directory, "output.json");
  try {
    await assert.rejects(waitForNativeUI(source, output, { timeoutMs: 5, intervalMs: 1 }), /did not render/u);
    assert.equal(JSON.parse(await readFile(output, "utf8")).ready, false);
    const blank = { ...ready, ready: false, rootChildren: 0, heading: false, input: false };
    await writeFile(source, JSON.stringify(blank));
    await assert.rejects(waitForNativeUI(source, output, { timeoutMs: 5, intervalMs: 1 }), /did not render/u);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), blank);
    await writeFile(source, JSON.stringify(ready));
    await waitForNativeUI(source, output, { timeoutMs: 50, intervalMs: 1 });
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), ready);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native smoke diagnostics run only in opt-in debug simulators and inspect visible search controls", async () => {
  const swift = await readFile(new URL("../ios/App/App/SajdaNativePlugin.swift", import.meta.url), "utf8");
  const diagnostics = swift.slice(swift.indexOf("#if DEBUG && targetEnvironment(simulator)"));
  assert.match(diagnostics, /environment\["SAJDA_CI_SMOKE"\] == "1"/u);
  assert.match(diagnostics, /injectionTime: \.atDocumentStart/u);
  assert.match(diagnostics, /securitypolicyviolation/u);
  assert.match(diagnostics, /getBoundingClientRect\(\)/u);
  assert.match(diagnostics, /#domain-theme:not\(:disabled\)/u);
  assert.doesNotMatch(diagnostics, /innerHTML|innerText|textContent|localStorage|storedToken/u);
  const shell = await readFile(new URL("../scripts/smoke-ios.sh", import.meta.url), "utf8");
  assert.match(shell, /run_step app-ready 75 node scripts\/assert-ios-ready\.mjs/u);
  assert.doesNotMatch(shell, /sleep 10/u);
});

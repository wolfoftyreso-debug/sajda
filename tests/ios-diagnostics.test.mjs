import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectIOSDiagnostics } from "../scripts/collect-ios-diagnostics.mjs";

const simulator = "00000000-0000-4000-8000-000000000001";

test("simulator failure evidence is bounded and app-scoped, including after launch timeout", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sajda-ios-evidence-test-"));
  const container = path.join(directory, "container");
  await mkdir(path.join(container, "tmp"), { recursive: true });
  await writeFile(path.join(container, "tmp/sajda-ui-smoke.json"), '{"ready":false,"errors":[]}');
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return args.includes("get_app_container")
      ? { status: 0, stdout: container + "\n" }
      : { status: null, error: { code: "ETIMEDOUT" }, stdout: "x".repeat(210_000), stderr: "" };
  };
  try {
    const result = await collectIOSDiagnostics(simulator, directory, run);
    assert.equal(result.readiness, "captured");
    assert.deepEqual(result.logs, { status: null, error: "ETIMEDOUT", truncated: true });
    assert.equal((await readFile(path.join(directory, "sajda-iphone-smoke.log"), "utf8")).length, 200_000);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "sajda-ui-smoke.json"), "utf8")), { ready: false, errors: [] });
    assert.deepEqual(calls.map(call => call.options.timeout), [10_000, 20_000]);
    assert.equal(calls.every(call => call.command === "xcrun" && call.options.killSignal === "SIGKILL"), true);
    assert.deepEqual(calls[1].args.slice(-5), ["compact", "--last", "2m", "--predicate", 'process == "App"']);
    await assert.rejects(collectIOSDiagnostics("all", directory, run), /job-owned simulator UUID/u);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});

test("smoke preserves the original failure while capturing evidence before owned cleanup", async () => {
  const source = await readFile(new URL("../scripts/smoke-ios.sh", import.meta.url), "utf8");
  assert.match(source, /run_step launch 120 /u);
  assert.match(source, /trap finish_smoke EXIT/u);
  const cleanup = source.slice(source.indexOf("finish_smoke()"), source.indexOf("SAJDA_SIMULATOR_TARGET="));
  assert.match(cleanup, /local result=\$\?/u);
  assert.match(cleanup, /exit "\$result"/u);
  assert.ok(cleanup.indexOf("failure-evidence") < cleanup.indexOf("run_step shutdown"));
  assert.ok(cleanup.indexOf("failure-screenshot") < cleanup.indexOf("run_step delete"));
  assert.match(source, /run_step app-ready 75 /u, "Do not weaken the observable UI readiness gate");
});

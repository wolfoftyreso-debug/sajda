import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { selectSimulatorTarget } from "../scripts/ios-simulator-target.mjs";

// Command-harness contracts only: execute the actual embedded Node helper with
// harmless local child processes. These tests do not run bash, Xcode or simctl,
// and are not evidence of native app compilation, installation or launch.
const script = await readFile(new URL("../scripts/smoke-ios.sh", import.meta.url), "utf8");
const embedded = script.match(/run_step\(\) \{\r?\n\s+node -e '([\s\S]*?)'\s+"\$@"\r?\n\}/u);
assert.ok(embedded, "Extract run_step's actual embedded Node program without replacing its implementation");

function runHarness(stage, seconds, command, args = []) {
  const result = spawnSync(process.execPath, ["-e", embedded[1], stage, String(seconds), command, ...args], {
    encoding: "utf8", timeout: 5_000, killSignal: "SIGKILL",
  });
  assert.equal(result.error, undefined, "The outer test guard must not time out or fail to launch the harness");
  assert.equal(result.signal, null, "The harness must exit itself after reporting the child outcome");
  const events = result.stdout.split(/\r?\n/u).filter(line => line.startsWith('{"event":"simulator_step_'))
    .map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => [event.event, event.stage]), [
    ["simulator_step_started", stage], ["simulator_step_finished", stage],
  ], "Every phase logs one matching start and finish, even when its command fails");
  for (const event of events) assert.equal(new Date(event.at).toISOString(), event.at);
  assert.ok(Date.parse(events[1].at) >= Date.parse(events[0].at));
  return { ...result, finished: events[1] };
}

test("iOS smoke command-harness contract: successful child preserves output and reports success", () => {
  const result = runHarness("fixture-success", 2, process.execPath, ["-e",
    'console.log("child stdout"); console.error("child stderr"); console.log(process.argv[1]);', "argument with spaces"]);
  assert.equal(result.status, 0);
  assert.equal(result.finished.status, 0);
  assert.equal(result.finished.signal, null);
  assert.equal(result.finished.error, undefined);
  assert.match(result.stdout, /child stdout\r?\nargument with spaces/u);
  assert.match(result.stderr, /child stderr/u);
});

test("iOS smoke command-harness contract: failed child cannot make the phase pass", () => {
  const result = runHarness("fixture-failure", 2, process.execPath, ["-e",
    'console.error("expected child failure"); process.exit(23);']);
  assert.equal(result.status, 1);
  assert.equal(result.finished.status, 23);
  assert.equal(result.finished.signal, null);
  assert.equal(result.finished.error, undefined);
  assert.match(result.stderr, /expected child failure/u);
});

test("iOS smoke command-harness contract: unknown command reports ENOENT and fails", () => {
  const result = runHarness("fixture-missing", 2, path.join(tmpdir(), `sajda-missing-command-${randomUUID()}`));
  assert.equal(result.status, 1);
  assert.equal(result.finished.status, null);
  assert.equal(result.finished.error, "ENOENT");
});

test("iOS smoke command-harness contract: short deadline terminates a hanging child and fails", () => {
  const result = runHarness("fixture-timeout", 0.25, process.execPath, ["-e", "setInterval(() => {}, 1000);"]);
  assert.equal(result.status, 1);
  assert.equal(result.finished.status, null);
  assert.equal(result.finished.signal, "SIGKILL");
  assert.equal(result.finished.error, "ETIMEDOUT");
});

const oldRuntime = "com.apple.CoreSimulator.SimRuntime.iOS-26-2";
const activeRuntime = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
const phoneType = "com.apple.CoreSimulator.SimDeviceType.iPhone-17";
const inventory = () => ({
  runtimes: [
    { identifier: oldRuntime, version: "26.2", isAvailable: true },
    { identifier: activeRuntime, version: "26.5", isAvailable: true },
  ],
  devicetypes: [{ identifier: phoneType, name: "iPhone 17" }],
  devices: {
    [oldRuntime]: [{ name: "iPhone 17", deviceTypeIdentifier: phoneType, isAvailable: true }],
    [activeRuntime]: [{ name: "iPhone 17", deviceTypeIdentifier: phoneType, isAvailable: true }],
  },
});

test("iOS smoke runtime selection follows the active SDK instead of first enumeration order", () => {
  assert.deepEqual(selectSimulatorTarget(inventory(), "26.5"), {
    runtimeIdentifier: activeRuntime, deviceTypeIdentifier: phoneType, runtimeVersion: "26.5", deviceName: "iPhone 17",
  });
  assert.equal(selectSimulatorTarget(inventory(), "26.5.1").runtimeIdentifier, activeRuntime);
});

test("iOS smoke runtime selection refuses unavailable, wrong-platform and unmatched runtimes", () => {
  assert.throws(() => selectSimulatorTarget(inventory(), "27.0"), /No available iPhone runtime matches/u);
  assert.throws(() => selectSimulatorTarget(inventory(), "latest"), /Unknown iOS Simulator SDK/u);
  const unavailable = inventory(); unavailable.runtimes[1].isAvailable = false;
  assert.throws(() => selectSimulatorTarget(unavailable, "26.5"), /No available iPhone runtime matches/u);
  const missingPhone = inventory(); missingPhone.devices[activeRuntime][0].isAvailable = false;
  assert.throws(() => selectSimulatorTarget(missingPhone, "26.5"), /No available iPhone runtime matches/u);
  const noPhones = inventory(); noPhones.devicetypes[0].identifier = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro";
  assert.throws(() => selectSimulatorTarget(noPhones, "26.5"), /No available iPhone runtime matches/u);
});

test("iOS smoke source contract creates only a job-owned simulator and retains explicit boot deadlines", () => {
  assert.match(script, /xcrun --sdk iphonesimulator --show-sdk-version/u);
  assert.match(script, /xcrun simctl create "Sajda CI Smoke"/u);
  assert.match(script, /run_step boot-ready 900 xcrun simctl bootstatus/u);
  assert.match(script, /run_step delete 30 xcrun simctl delete "\$SAJDA_SIMULATOR_ID"/u);
  assert.doesNotMatch(script, /simctl (?:erase|delete|shutdown) all/u);
});

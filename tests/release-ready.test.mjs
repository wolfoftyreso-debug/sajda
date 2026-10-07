import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";
import { launchEvidenceIssues } from "../scripts/check-launch-evidence.mjs";
import {
  assertReleaseReady, checkReleaseReady, readReleaseGitState, releaseReadyArguments, releaseReadyIssues,
} from "../scripts/check-release-ready.mjs";

const branch = "codex/launch-hardening", commit = "a".repeat(40);
const webGates = ["baseline", "final_origin", "transactional_email", "social_auth", "stripe_sandbox",
  "legal_and_operations", "deployed_golden_paths", "production_and_indexing"];
const clean = () => ({ commit, branch, dirty: false });
function complete() {
  const timestamp = new Date(Date.now() - 60_000).toISOString();
  return {
    schema_version: 1, repository: "https://github.com/wolfoftyreso-debug/sajda.git",
    release_branch: branch, release_commit: commit, recorded_at: timestamp, recorded_by: "synthetic release operator",
    verdict: "go", rules: { contains_secrets: false, contains_personal_data: false, live_charge_performed: false, legal_approval_inferred: false },
    gates: [...webGates, "app_store"].map(id => id === "app_store"
      ? { id, status: "blocked", environment: "apple_sandbox_and_testflight", evidence: [], remaining_blocker: "Apple enrollment is pending" }
      : { id, status: "verified", environment: "synthetic_environment", evidence: [{ type: "command", reference: "synthetic redacted receipt", observed_at: timestamp }], remaining_blocker: null }),
  };
}

test("release preflight requires an explicit supported context and an evidence path", () => {
  for (const args of [[], ["receipt.json"], ["--web"], ["--ios"], ["--production", "receipt.json"],
    ["receipt.json", "--web"], ["--web", "--ios"], ["--web", "receipt.json", "--dirty-ok"]]) {
    assert.throws(() => releaseReadyArguments(args), /explicit_context_and_evidence_path_required/u);
  }
  for (const context of ["web", "ios"]) {
    assert.deepEqual(releaseReadyArguments([`--${context}`, "receipt.json"]), { context, evidencePath: resolve("receipt.json") });
  }
});

test("a supported literal GO on the actual clean named revision passes only its selected context", () => {
  const evidence = complete();
  assert.deepEqual(releaseReadyIssues(evidence, clean(), "web"), []);
  assert.equal(assertReleaseReady(evidence, clean(), "web"), evidence);
  assert.deepEqual(releaseReadyIssues(evidence, clean(), "ios"), ["app_store_not_verified"]);
  const appStore = evidence.gates.find(gate => gate.id === "app_store");
  appStore.status = "verified"; appStore.remaining_blocker = null;
  appStore.evidence = [{ type: "provider", reference: "synthetic App Store receipt", observed_at: evidence.recorded_at }];
  assert.deepEqual(releaseReadyIssues(evidence, clean(), "ios"), []);
});

test("the release receipt cannot substitute another commit, branch or dirty working tree", () => {
  const evidence = complete();
  assert.deepEqual(releaseReadyIssues(evidence, { ...clean(), commit: "b".repeat(40) }, "web"), ["release_commit_mismatch"]);
  assert.deepEqual(releaseReadyIssues(evidence, { ...clean(), branch: "main" }, "web"), ["release_branch_mismatch"]);
  assert.deepEqual(releaseReadyIssues(evidence, { ...clean(), dirty: true }, "web"), ["git_worktree_dirty"]);
  for (const state of [{ ...clean(), branch: null }, { ...clean(), branch: "HEAD" }, { ...clean(), branch: "" }]) {
    assert.ok(releaseReadyIssues(evidence, state, "web").includes("git_branch_unavailable"));
  }
  for (const state of [undefined, {}, { ...clean(), commit: "short" }, { ...clean(), dirty: undefined }]) {
    assert.ok(releaseReadyIssues(evidence, state, "web").includes("git_context_invalid"));
  }
});

test("historical NO-GO and conditional receipts remain schema-valid but cannot authorize release", () => {
  for (const verdict of ["no_go", "go_with_conditions"]) {
    const evidence = complete(); evidence.verdict = verdict;
    assert.deepEqual(launchEvidenceIssues(evidence), []);
    assert.deepEqual(releaseReadyIssues(evidence, clean(), "web"), ["release_go_required"]);
  }
});

test("every failed, blocked or unstarted web gate independently blocks both contexts", () => {
  for (const id of webGates) for (const status of ["failed", "blocked", "not_started"]) {
    const evidence = complete(), gate = evidence.gates.find(item => item.id === id);
    gate.status = status; gate.remaining_blocker = "Synthetic unresolved gate";
    for (const context of ["web", "ios"]) {
      const issues = releaseReadyIssues(evidence, clean(), context);
      assert.ok(issues.includes("launch_evidence_invalid"));
      assert.ok(issues.includes(`${id}_not_verified`), `${context}: ${id}`);
      assert.throws(() => assertReleaseReady(evidence, clean(), context), /Release preflight blocked/u);
    }
  }
});

test("malformed, evidence-free and future receipts fail closed without echoing their contents", () => {
  for (const change of [
    evidence => { evidence.gates[0].evidence = []; },
    evidence => { evidence.gates[0].id = "private-do-not-echo"; },
    evidence => { evidence.gates[0].evidence[0].reference = "provider secret sk_live_privateDoNotEcho"; },
    evidence => { evidence.recorded_at = new Date(Date.now() + 120_000).toISOString(); },
    evidence => { evidence.release_commit = "private-do-not-echo"; },
  ]) {
    const evidence = complete(); change(evidence);
    assert.ok(releaseReadyIssues(evidence, clean(), "web").includes("launch_evidence_invalid"));
    assert.throws(() => assertReleaseReady(evidence, clean(), "web"), error => !/private|sk_live|provider secret/u.test(error.message));
  }
  assert.ok(releaseReadyIssues(null, clean(), undefined).includes("release_context_invalid"));
});

test("commit binding does not invent a universal daily expiry for stable evidence", () => {
  const evidence = complete(); evidence.recorded_at = "2025-01-01T00:00:00.000Z";
  for (const gate of evidence.gates) for (const item of gate.evidence) item.observed_at = evidence.recorded_at;
  assert.deepEqual(releaseReadyIssues(evidence, clean(), "web"), []);
});

test("command reads the receipt and actual Git state rather than accepting caller-supplied revision arguments", async () => {
  const evidence = complete(), reads = [];
  const dependencies = {
    readEvidence: async (path, encoding) => { reads.push([path, encoding]); return JSON.stringify(evidence); },
    readGit: async () => { reads.push("git"); return clean(); },
  };
  assert.deepEqual(await checkReleaseReady(["--web", "receipt.json"], dependencies), { context: "web", commit, branch });
  assert.deepEqual(reads, [[resolve("receipt.json"), "utf8"], "git"]);
  await assert.rejects(() => checkReleaseReady(["--web", "receipt.json", "--commit", commit], dependencies), /explicit_context/u);
  await assert.rejects(() => checkReleaseReady(["--web", "receipt.json"], {
    ...dependencies, readGit: async () => ({ ...clean(), commit: "b".repeat(40) }),
  }), /release_commit_mismatch/u);
  await assert.rejects(() => checkReleaseReady(["--web", "receipt.json"], {
    ...dependencies, readEvidence: async () => "private-do-not-echo-not-json",
  }), error => error.message === "Release preflight blocked: launch_evidence_unreadable");
});

test("real Git inspection distinguishes clean, untracked, staged, unstaged and detached states without revealing filenames", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sajda-release-preflight-"));
  const root = resolve(temporary), tempRoot = resolve(tmpdir());
  assert.ok(root.startsWith(tempRoot + sep) && basename(root).startsWith("sajda-release-preflight-"));
  const hooks = join(root, "empty-hooks"); await mkdir(hooks);
  const git = args => execFileSync("git", ["-c", "core.hooksPath=" + hooks, "-c", "commit.gpgsign=false",
    "-c", "user.name=Synthetic Release QA", "-c", "user.email=release-qa@example.invalid", ...args],
  { cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git(["init", "--initial-branch=" + branch]);
    const tracked = join(root, "fixture.txt"), untracked = join(root, "private-filename-do-not-echo.txt");
    await writeFile(tracked, "synthetic fixture\n"); git(["add", "fixture.txt"]); git(["commit", "-m", "Synthetic fixture"]);
    const first = await readReleaseGitState(root);
    assert.match(first.commit, /^[0-9a-f]{40}$/u); assert.equal(first.branch, branch); assert.equal(first.dirty, false);
    const evidence = complete(); evidence.release_commit = first.commit;
    assert.deepEqual(releaseReadyIssues(evidence, first, "web"), []);
    await writeFile(untracked, "private synthetic fixture\n");
    const dirty = await readReleaseGitState(root);
    assert.equal(dirty.dirty, true); assert.doesNotMatch(JSON.stringify(dirty), /private|fixture/u);
    await unlink(untracked); assert.equal((await readReleaseGitState(root)).dirty, false);
    await writeFile(tracked, "changed synthetic fixture\n"); assert.equal((await readReleaseGitState(root)).dirty, true);
    git(["add", "fixture.txt"]); assert.equal((await readReleaseGitState(root)).dirty, true);
    git(["checkout", "--detach"]); assert.equal((await readReleaseGitState(root)).branch, null);
  } finally {
    // Only the explicitly created and validated temporary test repository is removed.
    assert.ok(root.startsWith(tempRoot + sep) && basename(root).startsWith("sajda-release-preflight-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("npm keeps historical schema/CI checks separate from explicit production release preflight", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["check:release-ready"], "node scripts/check-release-ready.mjs");
  assert.equal(packageJson.scripts["check:launch-evidence"], "node scripts/check-launch-evidence.mjs");
  assert.doesNotMatch(packageJson.scripts["check:ci"], /check:release-ready|check:launch-evidence/u);
});

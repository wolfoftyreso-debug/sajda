import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { launchEvidenceIssues } from "./check-launch-evidence.mjs";

const run = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webGates = Object.freeze([
  "baseline", "final_origin", "transactional_email", "social_auth", "stripe_sandbox",
  "legal_and_operations", "deployed_golden_paths", "production_and_indexing",
]);
const contexts = new Set(["web", "ios"]);

export class ReleaseReadyError extends Error {
  constructor(issues) {
    // Only internal codes reach output. Evidence references, file contents,
    // Git filenames and Git error output may contain private information.
    super(`Release preflight blocked: ${issues.join(", ")}`);
    this.name = "ReleaseReadyError";
    this.issues = issues;
  }
}

export function releaseReadyArguments(args) {
  if (args.length !== 2 || !["--web", "--ios"].includes(args[0])
    || typeof args[1] !== "string" || !args[1].trim() || args[1].startsWith("--")) {
    throw new ReleaseReadyError(["explicit_context_and_evidence_path_required"]);
  }
  return { context: args[0].slice(2), evidencePath: resolve(args[1]) };
}

export async function readReleaseGitState(cwd = projectRoot) {
  const options = { cwd, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 10_000, windowsHide: true };
  const git = async args => (await run("git", ["--no-optional-locks", ...args], options)).stdout;
  try {
    const commit = (await git(["rev-parse", "--verify", "HEAD"])).trim();
    let branch = null;
    try {
      branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
    } catch (error) {
      // A detached checkout is not an approved named release branch.
      if (error?.code !== 1) throw error;
    }
    const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=none"]);
    // Catch a branch/commit change during the read rather than combining two
    // different revisions into a passing snapshot. This does not lock Git.
    const lastCommit = (await git(["rev-parse", "--verify", "HEAD"])).trim();
    let lastBranch = null;
    try {
      lastBranch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
    } catch (error) {
      if (error?.code !== 1) throw error;
    }
    if (commit !== lastCommit || branch !== lastBranch) throw new ReleaseReadyError(["git_context_changed"]);
    return { commit, branch, dirty: status.length > 0 };
  } catch (error) {
    if (error instanceof ReleaseReadyError) throw error;
    throw new ReleaseReadyError(["git_context_unavailable"]);
  }
}

export function releaseReadyIssues(evidence, gitState, context) {
  const issues = [];
  if (!contexts.has(context)) issues.push("release_context_invalid");
  const validCommit = typeof gitState?.commit === "string" && /^[0-9a-f]{40}$/u.test(gitState.commit);
  const validBranch = typeof gitState?.branch === "string" && gitState.branch.trim().length > 0
    && gitState.branch !== "HEAD" && !/[\r\n\0]/u.test(gitState.branch);
  if (!validCommit || typeof gitState?.dirty !== "boolean") issues.push("git_context_invalid");
  if (!validBranch) issues.push("git_branch_unavailable");
  if (gitState?.dirty === true) issues.push("git_worktree_dirty");

  // Historical schema validity is deliberately separate from release approval.
  // Do not echo validator details: an invalid gate ID/reference is untrusted.
  if (launchEvidenceIssues(evidence).length) issues.push("launch_evidence_invalid");
  if (evidence?.verdict !== "go") issues.push("release_go_required");
  if (validCommit && evidence?.release_commit !== gitState.commit) issues.push("release_commit_mismatch");
  if (validBranch && evidence?.release_branch !== gitState.branch) issues.push("release_branch_mismatch");

  const gates = new Map((Array.isArray(evidence?.gates) ? evidence.gates : [])
    .filter(gate => gate && typeof gate === "object").map(gate => [gate.id, gate]));
  const required = context === "ios" ? [...webGates, "app_store"] : webGates;
  for (const id of required) if (gates.get(id)?.status !== "verified") issues.push(`${id}_not_verified`);
  return [...new Set(issues)];
}

export function assertReleaseReady(evidence, gitState, context) {
  const issues = releaseReadyIssues(evidence, gitState, context);
  if (issues.length) throw new ReleaseReadyError(issues);
  return evidence;
}

export async function checkReleaseReady(args, dependencies = {}) {
  const { context, evidencePath } = releaseReadyArguments(args);
  let evidence;
  try {
    evidence = JSON.parse(await (dependencies.readEvidence ?? readFile)(evidencePath, "utf8"));
  } catch {
    throw new ReleaseReadyError(["launch_evidence_unreadable"]);
  }
  const gitState = await (dependencies.readGit ?? readReleaseGitState)();
  assertReleaseReady(evidence, gitState, context);
  return { context, commit: gitState.commit, branch: gitState.branch };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkReleaseReady(process.argv.slice(2));
    console.log(`Release preflight: PASS (${result.context}; clean Git ${result.commit.slice(0, 12)}; supported GO).`);
    console.log("Metadata checks only: inspect the actual provider/runtime receipts and obtain release authorization separately. No deployment performed.");
  } catch (error) {
    console.error(error instanceof ReleaseReadyError ? error.message : "Release preflight blocked: unexpected_failure");
    process.exitCode = 1;
  }
}

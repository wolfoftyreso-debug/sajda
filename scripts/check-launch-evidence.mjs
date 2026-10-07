import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedGates = Object.freeze([
  "baseline",
  "final_origin",
  "transactional_email",
  "social_auth",
  "stripe_sandbox",
  "legal_and_operations",
  "deployed_golden_paths",
  "production_and_indexing",
  "app_store",
]);
const webReleaseGates = Object.freeze(expectedGates.slice(0, -1));
const statuses = new Set(["verified", "failed", "blocked", "not_started"]);
const verdicts = new Set(["go", "go_with_conditions", "no_go"]);
const evidenceTypes = new Set(["approval", "command", "database", "deployment", "http", "log", "provider", "screenshot"]);
const secretPattern = /(?:sk_(?:live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|re_[A-Za-z0-9_-]{10,}|pk1_[A-Za-z0-9_-]{8,}|sk1_[A-Za-z0-9_-]{8,}|postgres(?:ql)?:\/\/|(?:token|code|secret|password)=)/iu;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return record(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function utcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

export function launchEvidenceIssues(input) {
  const issues = [];
  if (!exactKeys(input, ["schema_version", "repository", "release_branch", "release_commit", "recorded_at", "recorded_by", "verdict", "rules", "gates"])) {
    issues.push("top_level_schema_invalid");
    return issues;
  }
  if (input.schema_version !== 1) issues.push("schema_version_invalid");
  if (input.repository !== "https://github.com/wolfoftyreso-debug/sajda.git") issues.push("repository_invalid");
  if (input.release_branch !== "codex/launch-hardening") issues.push("release_branch_invalid");
  if (typeof input.release_commit !== "string" || !/^[0-9a-f]{40}$/u.test(input.release_commit)) issues.push("release_commit_invalid");
  const recordedAt = utcTimestamp(input.recorded_at) ? Date.parse(input.recorded_at) : NaN;
  if (!Number.isFinite(recordedAt) || recordedAt > Date.now() + 60_000) issues.push("recorded_at_invalid");
  if (typeof input.recorded_by !== "string" || input.recorded_by.trim().length < 2 || input.recorded_by.length > 120) issues.push("recorded_by_invalid");
  if (!verdicts.has(input.verdict)) issues.push("verdict_invalid");

  const ruleKeys = ["contains_secrets", "contains_personal_data", "live_charge_performed", "legal_approval_inferred"];
  if (!exactKeys(input.rules, ruleKeys) || ruleKeys.some(key => typeof input.rules[key] !== "boolean")) issues.push("rules_invalid");
  else {
    for (const key of ["contains_secrets", "contains_personal_data", "legal_approval_inferred"]) {
      if (input.rules[key] !== false) issues.push(`${key}_must_be_false`);
    }
  }

  if (!Array.isArray(input.gates) || input.gates.length !== expectedGates.length) {
    issues.push("gates_invalid");
    return issues;
  }
  const byId = new Map();
  for (const gate of input.gates) {
    if (!exactKeys(gate, ["id", "status", "environment", "evidence", "remaining_blocker"])) {
      issues.push("gate_schema_invalid");
      continue;
    }
    if (!expectedGates.includes(gate.id) || byId.has(gate.id)) issues.push("gate_id_invalid");
    else byId.set(gate.id, gate);
    if (!statuses.has(gate.status)) issues.push(`${gate.id}_status_invalid`);
    if (typeof gate.environment !== "string" || gate.environment.trim().length < 2 || gate.environment.length > 80) issues.push(`${gate.id}_environment_invalid`);
    const hasEvidence = Array.isArray(gate.evidence) && gate.evidence.length > 0;
    if (!Array.isArray(gate.evidence) || gate.evidence.length > 50) issues.push(`${gate.id}_evidence_invalid`);
    else for (const item of gate.evidence) {
      if (!exactKeys(item, ["type", "reference", "observed_at"]) || !evidenceTypes.has(item.type)
        || typeof item.reference !== "string" || item.reference.trim().length < 3 || item.reference.length > 500
        || !utcTimestamp(item.observed_at)
        || Number.isFinite(recordedAt) && Date.parse(item.observed_at) > recordedAt) issues.push(`${gate.id}_evidence_invalid`);
    }
    const hasBlocker = typeof gate.remaining_blocker === "string" && gate.remaining_blocker.trim().length >= 3 && gate.remaining_blocker.length <= 500;
    if (gate.status === "verified" && (!hasEvidence || gate.remaining_blocker !== null)) issues.push(`${gate.id}_verified_evidence_invalid`);
    if (gate.status === "blocked" && !hasBlocker) issues.push(`${gate.id}_blocker_required`);
    if (gate.remaining_blocker !== null && !hasBlocker) issues.push(`${gate.id}_blocker_invalid`);
  }
  for (const gateId of expectedGates) if (!byId.has(gateId)) issues.push("gate_id_invalid");
  if (["go", "go_with_conditions"].includes(input.verdict)
    && webReleaseGates.some(id => byId.get(id)?.status !== "verified")) issues.push("release_verdict_not_supported");
  if (secretPattern.test(JSON.stringify(input))) issues.push("credential_material_detected");
  return [...new Set(issues)];
}

export function assertLaunchEvidence(input) {
  const issues = launchEvidenceIssues(input);
  if (issues.length) throw new Error(`Launch evidence rejected: ${issues.join(", ")}`);
  return input;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const evidencePath = process.argv[2];
  if (!evidencePath) throw new Error("Usage: npm run check:launch-evidence -- <redacted-evidence.json>");
  const document = JSON.parse(await readFile(resolve(evidencePath), "utf8"));
  assertLaunchEvidence(document);
  console.log(`Launch evidence: OK (${document.gates.length} gates; verdict ${document.verdict})`);
}

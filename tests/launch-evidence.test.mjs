import assert from "node:assert/strict";
import test from "node:test";
import { launchEvidenceIssues } from "../scripts/check-launch-evidence.mjs";

const gateIds = ["baseline", "final_origin", "transactional_email", "social_auth", "stripe_sandbox",
  "legal_and_operations", "deployed_golden_paths", "production_and_indexing", "app_store"];

function complete() {
  return {
    schema_version: 1,
    repository: "https://github.com/wolfoftyreso-debug/sajda.git",
    release_branch: "codex/launch-hardening",
    release_commit: "a".repeat(40),
    recorded_at: "2026-10-04T01:00:00.000Z",
    recorded_by: "authorized release operator",
    verdict: "go_with_conditions",
    rules: { contains_secrets: false, contains_personal_data: false, live_charge_performed: false, legal_approval_inferred: false },
    gates: gateIds.map(id => id === "app_store"
      ? { id, status: "blocked", environment: "apple_sandbox_and_testflight", evidence: [], remaining_blocker: "Apple Developer enrollment is pending" }
      : { id, status: "verified", environment: "reviewed_environment", evidence: [{ type: "command", reference: `${id} redacted receipt`, observed_at: "2026-10-04T01:00:00.000Z" }], remaining_blocker: null }),
  };
}

test("redacted launch evidence supports a web verdict while keeping App Store separate", () => {
  assert.deepEqual(launchEvidenceIssues(complete()), []);
});

test("a release verdict cannot outrun a missing web gate", () => {
  const evidence = complete();
  evidence.gates.find(gate => gate.id === "transactional_email").status = "blocked";
  evidence.gates.find(gate => gate.id === "transactional_email").evidence = [];
  evidence.gates.find(gate => gate.id === "transactional_email").remaining_blocker = "Sender verification is pending";
  assert.ok(launchEvidenceIssues(evidence).includes("release_verdict_not_supported"));
});

test("credentials, unsupported schemas and evidence-free verified gates are rejected", () => {
  for (const mutate of [
    evidence => { evidence.gates[0].evidence = []; },
    evidence => { evidence.gates[0].evidence[0].reference = "provider secret sk_live_do_not_store"; },
    evidence => { evidence.unexpected = true; },
    evidence => { evidence.release_commit = "short"; },
  ]) {
    const evidence = complete();
    mutate(evidence);
    assert.ok(launchEvidenceIssues(evidence).length > 0);
  }
});

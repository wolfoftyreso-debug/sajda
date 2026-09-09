import assert from "node:assert/strict";
import test from "node:test";
import { isLostDomainOpportunity, type LostDomainOpportunity } from "../shared/lost-domain-opportunity";

const priority: LostDomainOpportunity = { version: 1, tier: "priority_review", score: 95,
  breakdown: { registry: 40, dns: 15, mail: 10, website: 5, name: 15, source: 10, penalties: 0 },
  reasons: ["registry_record_absent", "observed_source_link"],
  missingChecks: ["registrar", "history", "trademark", "market_comparables"] };

test("opportunity payload validates bounded review scores and the exact breakdown sum", () => {
  assert.equal(isLostDomainOpportunity(priority), true);
  assert.equal(isLostDomainOpportunity({ ...priority, tier: "review", score: 69,
    breakdown: { ...priority.breakdown, website: 0, penalties: 21 }, missingChecks: ["website", ...priority.missingChecks] }), true);
  for (const score of [-1, 101, NaN, Infinity, 95.1, "95", 94]) assert.equal(isLostDomainOpportunity({ ...priority, score }), false);
  for (const value of [null, [], {}, { ...priority, version: 2 }, { ...priority, tier: "valuable" }]) assert.equal(isLostDomainOpportunity(value), false);
});

test("priority cannot claim completed website/mail checks or hide mandatory unperformed diligence", () => {
  assert.equal(isLostDomainOpportunity({ ...priority, breakdown: { ...priority.breakdown, mail: 0 }, score: 85 }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, breakdown: { ...priority.breakdown, website: 0 }, score: 90 }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, missingChecks: ["website", ...priority.missingChecks] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, missingChecks: [] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, missingChecks: [...priority.missingChecks, "private_contacts"] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, missingChecks: [...priority.missingChecks, "history"] }), false);
});

test("arbitrary text, oversized signals and high-score excluded/watch blocks fail validation", () => {
  assert.equal(isLostDomainOpportunity({ ...priority, reasons: ["<script>alert(1)</script>"] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, reasons: ["x".repeat(81)] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, reasons: ["same", "same"] }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, breakdown: { ...priority.breakdown, name: 21 }, score: 101 }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, tier: "excluded" }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, tier: "watch" }), false);
  assert.equal(isLostDomainOpportunity({ ...priority, tier: "excluded", score: 0, breakdown: { ...priority.breakdown, penalties: 95 } }), true);
});

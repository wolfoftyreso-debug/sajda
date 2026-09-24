import assert from "node:assert/strict";
import test from "node:test";
import { nameProjectSearchEntry } from "../src/lib/nameProjectSearch";
import { projectEntryCopy } from "../src/i18n/projectEntryCopy";

const project = {
  id: "c4129878-d6ab-47b6-b1d6-e9a47e6b95e5", title: "Founder's next app", description: "A planning app",
  audience: "Small teams", desiredStyle: "Short and easy to say", languages: ["en"],
  budget: { currency: "USD", maxFirstYearCents: 3000, maxAnnualRenewalCents: 5000 },
  archived: false, version: 1, shortlistDomains: ["example.com"],
  createdAt: "2026-09-13T10:00:00.000Z", updatedAt: "2026-09-13T10:00:00.000Z",
};
test("project search is a validated same-account form handoff, not a price guarantee", () => {
  const state = { nameProject: project, nameProjectAccountId: "owner" };
  for (const account of [null, "other"]) assert.equal(nameProjectSearchEntry(state, account), null);
  assert.equal(nameProjectSearchEntry({ nameProject: project }, "owner"), null);
  for (const change of [{ archived: true }, { owner: "other" }, { id: "wrong" }, { description: "bad\u0000" }]) {
    assert.equal(nameProjectSearchEntry({ ...state, nameProject: { ...project, ...change } }, "owner"), null);
  }
  const entry = nameProjectSearchEntry(state, "owner")!;
  assert.match(entry.brief, /USD 30\.00/);
  assert.match(entry.brief, /renewal budget per domain: USD 50\.00/);
  assert.match(entry.brief, /Audience: Small teams/);
  assert.equal(entry.criteria.nameLanguage, "en");
  assert.equal("maxPrice" in entry.criteria, false);
  assert.deepEqual(Object.keys(entry).sort(), ["brief", "criteria", "project"]);
});
test("language preferences respect supported engine controls and absent budgets stay absent", () => {
  for (const [languages, expected] of [[["sv"], "sv"], [["en", "sv"], "mixed"], [["fr"], "auto"], [["es"], "auto"], [["de"], "auto"], [["it"], "auto"], [["pt"], "auto"], [["zh"], "auto"]] as const) {
    const result = nameProjectSearchEntry({ nameProjectAccountId: "owner", nameProject: { ...project, languages, budget: { currency: "EUR", maxFirstYearCents: null, maxAnnualRenewalCents: null } } }, "owner")!;
    assert.equal(result.criteria.nameLanguage, expected);
    assert.doesNotMatch(result.brief, /undefined/);
    assert.doesNotMatch(result.brief, /budget/);
  }
  const zero = nameProjectSearchEntry({ nameProjectAccountId: "owner", nameProject: { ...project, budget: { ...project.budget, maxFirstYearCents: 0 } } }, "owner")!;
  assert.match(zero.brief, /USD 0\.00/);
});
test("project entry copy covers all five languages without implying enforced budget or payment", () => {
  for (const copy of Object.values(projectEntryCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(projectEntryCopy.en).sort());
    assert.ok(Object.values(copy).every(Boolean));
  }
  assert.match(projectEntryCopy.en.budget, /not an automatic price filter/);
});

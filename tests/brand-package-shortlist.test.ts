import assert from "node:assert/strict";
import test from "node:test";
import { brandShortlistEntryKey, brandShortlistEntrySchema, nameProjectSchema, nameProjectInputSchema, NAME_PROJECT_BRAND_SHORTLIST_LIMIT, type BrandShortlistEntry, type NameProject } from "../shared/name-projects";
import { BRAND_NAME_LANGUAGES } from "../shared/name-languages";
import { prepareBrandPackageSave, brandPackageSearchEntry } from "../src/lib/brandPackageShortlist";
import { nameProjectToDraft, parseNameProjectDraft } from "../src/lib/nameProjectDraft";
import { brandShortlistCopy } from "../src/i18n/brandShortlistCopy";

const entry: BrandShortlistEntry = { label: "northlane", requiredTlds: ["com", "se"], platforms: ["github", "instagram"], markets: ["US", "SE"], source: "user_supplied" };
const project = (extra: Partial<NameProject> = {}): NameProject => ({ id: "aaaaaaaa-0000-4000-8000-000000000001", title: "Brand shortlist", description: "A builder's workspace", audience: "Founders", desiredStyle: "Short",
  languages: ["en"], archived: false, budget: { currency: "USD", maxFirstYearCents: 2000, maxAnnualRenewalCents: null }, shortlistDomains: ["example.com"], version: 1,
  createdAt: "2030-01-01T00:00:00.000Z", updatedAt: "2030-01-01T00:00:00.000Z", ...extra });

test("legacy projects remain valid and brand configurations cannot contain client evidence or scores", () => {
  assert.equal(nameProjectSchema.safeParse(project()).success, true);
  assert.equal(nameProjectSchema.parse(project()).brandShortlist, undefined);
  assert.deepEqual(brandShortlistEntrySchema.parse(entry), entry);
  assert.equal(brandShortlistEntrySchema.safeParse({ ...entry, requiredTlds: ["co.uk", "xn--p1ai"] }).success, true);
  for (const extra of [{ available: true }, { owned: true }, { score: 99 }, { evidence: [] }, { checkedAt: new Date().toISOString() }, { source: "verified" }, { userId: "victim" }]) {
    assert.equal(brandShortlistEntrySchema.safeParse({ ...entry, ...extra }).success, false);
  }
  for (const patch of [{ label: "https://example.com" }, { label: "NorthLane" }, { label: "北方" }, { label: "a".repeat(64) }, { requiredTlds: [] },
    { requiredTlds: ["com", "com"] }, { requiredTlds: ["com/path"] }, { platforms: ["github", "github"] }, { markets: [] }, { markets: ["US", "US"] }, { markets: ["XX"] },
    { note: "bad\u0000text" }, { note: "\ud800" }, { note: "x".repeat(501) }]) assert.equal(brandShortlistEntrySchema.safeParse({ ...entry, ...patch }).success, false, JSON.stringify(patch));
  assert.equal(nameProjectSchema.safeParse(project({ brandShortlist: [entry, entry] })).success, false);
  assert.equal(nameProjectSchema.safeParse(project({ brandShortlist: Array.from({ length: NAME_PROJECT_BRAND_SHORTLIST_LIMIT + 1 }, (_, i) => ({ ...entry, label: `brand${i}` })) })).success, false);
});

test("saving a package preserves the whole brief, domain shortlist and revision while replacing only its same-name-and-language configuration", () => {
  const original = project({ brandShortlist: [{ ...entry, note: "Initial choice" }, { ...entry, label: "otherbrand" }] });
  const changed = { ...entry, requiredTlds: ["dev"], note: "A new market plan" };
  const input = prepareBrandPackageSave(original, changed);
  assert.equal(input.expectedVersion, 1);
  assert.deepEqual(input.shortlistDomains, original.shortlistDomains);
  assert.deepEqual(input.budget, original.budget);
  assert.equal(input.description, original.description);
  assert.deepEqual(input.brandShortlist, [changed, original.brandShortlist![1]]);
  assert.equal(original.brandShortlist![0].note, "Initial choice");
  assert.equal(nameProjectInputSchema.safeParse(input).success, true);
  input.brandShortlist![0].requiredTlds.push("io");
  assert.deepEqual(changed.requiredTlds, ["dev"], "The save is an immutable deep copy");
  assert.throws(() => prepareBrandPackageSave(project({ archived: true }), entry), /archived_project/);
});

test("name-language selection is persisted, validated and part of package identity with an English legacy default", () => {
  assert.equal(brandShortlistEntryKey(entry), brandShortlistEntryKey({ ...entry, nameLanguage: "en" }));
  for (const nameLanguage of BRAND_NAME_LANGUAGES) {
    assert.equal(brandShortlistEntrySchema.parse({ ...entry, nameLanguage }).nameLanguage, nameLanguage);
    assert.deepEqual(nameProjectSchema.parse(project({ languages: [nameLanguage] })).languages, [nameLanguage]);
  }
  for (const nameLanguage of ["auto", "mixed", "zh", "EN", "", null, { language: "fr" }]) {
    assert.equal(brandShortlistEntrySchema.safeParse({ ...entry, nameLanguage }).success, false);
  }
  const french: BrandShortlistEntry = { ...entry, nameLanguage: "fr" };
  const original = project({ brandShortlist: [entry] });
  const input = prepareBrandPackageSave(original, french);
  assert.deepEqual(input.brandShortlist, [entry, french], "Saving French does not silently replace an English/legacy choice");
  assert.equal(nameProjectSchema.safeParse(project({ brandShortlist: [entry, french] })).success, true);
  assert.equal(nameProjectSchema.safeParse(project({ brandShortlist: [entry, { ...entry, nameLanguage: "en" }] })).success, false);
  const changedFrench = { ...french, note: "French pronunciation" };
  assert.deepEqual(prepareBrandPackageSave(project({ brandShortlist: [entry, french] }), changedFrench).brandShortlist, [entry, changedFrench]);
  assert.deepEqual(prepareBrandPackageSave(original, { ...entry, nameLanguage: "en" }).brandShortlist, [{ ...entry, nameLanguage: "en" }]);
  const row = project({ brandShortlist: [entry, french] });
  const state = { nameProject: row, nameProjectAccountId: "owner-a", brandPackage: french };
  assert.equal(brandPackageSearchEntry(state, "owner-a")?.entry.nameLanguage, "fr");
  assert.equal(brandPackageSearchEntry({ ...state, brandPackage: { ...french, nameLanguage: "sv" } }, "owner-a"), null);
  const draft = parseNameProjectDraft(nameProjectToDraft(row));
  assert.equal(draft.success, true);
  if (draft.success) assert.deepEqual(draft.data.brandShortlist, [entry, french]);
});

test("ordinary project editor mutations and exports keep brand-package choices intact", () => {
  const row = project({ brandShortlist: [entry] });
  const draft = nameProjectToDraft(row);
  draft.title = "Changed brief title";
  draft.brandShortlist![0].note = "Remember pronunciation";
  assert.equal(row.brandShortlist![0].note, undefined);
  const parsed = parseNameProjectDraft(draft);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.brandShortlist, [{ ...entry, note: "Remember pronunciation" }]);
});

test("reopening is an exact owner-bound stored-configuration handoff, with no stored live result or automatic check", () => {
  const row = project({ brandShortlist: [entry] });
  const state = { nameProject: row, nameProjectAccountId: "owner-a", brandPackage: entry };
  const reopened = brandPackageSearchEntry(state, "owner-a");
  assert.deepEqual(reopened, { project: row, entry });
  assert.equal(brandPackageSearchEntry(state, "owner-b"), null);
  assert.equal(brandPackageSearchEntry(state, null), null);
  assert.equal(brandPackageSearchEntry({ ...state, nameProject: project() }, "owner-a"), null);
  assert.equal(brandPackageSearchEntry({ ...state, nameProject: { ...row, archived: true } }, "owner-a"), null);
  assert.equal(brandPackageSearchEntry({ ...state, brandPackage: { ...entry, markets: ["FR"] } }, "owner-a"), null);
  assert.equal(brandPackageSearchEntry({ ...state, brandPackage: { ...entry, score: 99 } }, "owner-a"), null);
  reopened!.entry.requiredTlds.push("dev");
  assert.deepEqual(entry.requiredTlds, ["com", "se"], "Router state is snapshotted, not retained as a mutable reference");
});

test("brand-package persistence copy covers every supported locale and keeps rechecking visible", () => {
  const keys = Object.keys(brandShortlistCopy.en).sort();
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    assert.deepEqual(Object.keys(brandShortlistCopy[language]).sort(), keys);
    for (const value of Object.values(brandShortlistCopy[language])) assert.ok(value.trim());
  }
  assert.match(brandShortlistCopy.en.savedHelp, /must be checked again/);
  assert.match(brandShortlistCopy.sv.sectionHelp, /aktuellt underlag/);
});

import { nameProjectInputSchema, type NameProject, type NameProjectInput } from "../../shared/name-projects";
import type { Language } from "@/i18n/languagePreference";

export type NameProjectDraft = Omit<NameProjectInput, "budget"> & { budget: { currency: NameProjectInput["budget"]["currency"]; maxFirstYearCents: string; maxAnnualRenewalCents: string } };
export function emptyNameProjectDraft(language: Language = "en"): NameProjectDraft {
  return { id: "", expectedVersion: 0, title: "", description: "", audience: "", desiredStyle: "", languages: [language], budget: { currency: "USD", maxFirstYearCents: "", maxAnnualRenewalCents: "" }, archived: false, shortlistDomains: [] };
}
export function nameProjectToDraft(project: NameProject): NameProjectDraft {
  const { version, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = project;
  return { ...input, ...(input.brandShortlist ? { brandShortlist: structuredClone(input.brandShortlist) } : {}), expectedVersion: version, languages: [...input.languages], shortlistDomains: [...input.shortlistDomains], budget: { currency: input.budget.currency,
    maxFirstYearCents: input.budget.maxFirstYearCents === null ? "" : (input.budget.maxFirstYearCents / 100).toFixed(2),
    maxAnnualRenewalCents: input.budget.maxAnnualRenewalCents === null ? "" : (input.budget.maxAnnualRenewalCents / 100).toFixed(2) } };
}
/** Empty means unspecified; zero is a real zero budget. No currency conversion occurs. */
export function parseProjectBudget(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/u.test(trimmed)) return NaN;
  const [whole, decimal = ""] = trimmed.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function parseNameProjectDraft(draft: NameProjectDraft) {
  return nameProjectInputSchema.safeParse({ ...draft, id: draft.id || "00000000-0000-4000-8000-000000000001", budget: { currency: draft.budget.currency,
    maxFirstYearCents: parseProjectBudget(draft.budget.maxFirstYearCents), maxAnnualRenewalCents: parseProjectBudget(draft.budget.maxAnnualRenewalCents) } });
}
export function exportNameProject(project: NameProject): string {
  return JSON.stringify({ format: "sajda.name-project.v1", exportedAt: new Date().toISOString(),
    notice: "Private decision brief. Budgets are user limits, not quotes. Shortlisted names are saved references, not current availability, valuation or monitoring results.", project }, null, 2);
}

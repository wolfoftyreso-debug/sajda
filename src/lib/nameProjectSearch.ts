import { nameProjectSchema, type NameProject } from "../../shared/name-projects";
import { DEFAULT_ADVANCED_SEARCH_CRITERIA, type AdvancedSearchCriteria } from "./advancedSearchCriteria";
import { NAME_LANGUAGE_LABELS } from "../../shared/name-languages";

const languageNames = { ...NAME_LANGUAGE_LABELS, zh: "Chinese" };

/** Router state is a local form preset, never authorization or an automatic search. */
export function nameProjectSearchEntry(state: unknown, accountId: string | null): {
  project: NameProject; brief: string; criteria: AdvancedSearchCriteria;
} | null {
  if (!accountId || !state || typeof state !== "object" || Array.isArray(state)) return null;
  const entry = state as Record<string, unknown>;
  if (entry.nameProjectAccountId !== accountId) return null;
  const result = nameProjectSchema.safeParse(entry.nameProject);
  if (!result.success || result.data.archived) return null;
  const project = result.data;
  const budget = project.budget;
  const money = (value: number) => `${budget.currency} ${(value / 100).toFixed(2)}`;
  const brief = [
    `Project: ${project.title}`,
    project.description,
    project.audience && `Audience: ${project.audience}`,
    project.desiredStyle && `Naming style: ${project.desiredStyle}`,
    `Languages: ${project.languages.map(item => languageNames[item]).join(", ")}`,
    budget.maxFirstYearCents !== null && `Preferred first-year budget per domain: ${money(budget.maxFirstYearCents)}.`,
    budget.maxAnnualRenewalCents !== null && `Preferred annual renewal budget per domain: ${money(budget.maxAnnualRenewalCents)}.`,
  ].filter(Boolean).join("\n\n");
  return { project, brief, criteria: {
    ...DEFAULT_ADVANCED_SEARCH_CRITERIA,
    includeWords: [], excludeWords: [],
    // Generic search has English/Swedish/mixed controls. Other preferences stay
    // in the brief; brand-package search applies its separate language control.
    nameLanguage: project.languages.length > 1 ? "mixed" : project.languages[0] === "sv" ? "sv" : project.languages[0] === "en" ? "en" : "auto",
  } };
}

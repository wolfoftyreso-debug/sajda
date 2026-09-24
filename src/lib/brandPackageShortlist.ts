import { brandShortlistEntryKey, brandShortlistEntrySchema, nameProjectSchema, nameProjectInputSchema, type BrandShortlistEntry, type NameProject, type NameProjectInput } from "../../shared/name-projects";

/** Router state only pre-fills a form. It is not evidence or permission to run checks. */
export function brandPackageSearchEntry(state: unknown, accountId: string | null): { project: NameProject; entry: BrandShortlistEntry } | null {
  if (!accountId || !state || typeof state !== "object" || Array.isArray(state)) return null;
  const raw = state as Record<string, unknown>;
  if (raw.nameProjectAccountId !== accountId) return null;
  const project = nameProjectSchema.safeParse(raw.nameProject);
  const entry = brandShortlistEntrySchema.safeParse(raw.brandPackage);
  if (!project.success || project.data.archived || !entry.success) return null;
  const stored = project.data.brandShortlist?.find(item => brandShortlistEntryKey(item) === brandShortlistEntryKey(entry.data));
  if (!stored || JSON.stringify(stored) !== JSON.stringify(entry.data)) return null;
  return { project: project.data, entry: entry.data };
}

/** Exact revisioned save. Conflicts must be reloaded, never silently merged. */
export function prepareBrandPackageSave(project: NameProject, raw: BrandShortlistEntry): NameProjectInput {
  const validated = nameProjectSchema.parse(project);
  if (validated.archived) throw new Error("archived_project");
  const entry = brandShortlistEntrySchema.parse(raw);
  const { version, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = validated;
  const brandShortlist = structuredClone(input.brandShortlist ?? []);
  const index = brandShortlist.findIndex(item => brandShortlistEntryKey(item) === brandShortlistEntryKey(entry));
  if (index < 0) brandShortlist.push(entry); else brandShortlist[index] = entry;
  return nameProjectInputSchema.parse({ ...input, expectedVersion: version, brandShortlist });
}

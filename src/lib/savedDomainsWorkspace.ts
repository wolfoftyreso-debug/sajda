import { getPublicSuffix } from "tldts";

export type SavedDomainSort = "newest" | "name" | "oldest";
interface SavedRow { domain: string; created_at: string }
/** Registry suffix, not a private hosting suffix: example.co.uk stays .co.uk. */
export function savedDomainExtension(domain: string): string {
  return getPublicSuffix(domain, { allowPrivateDomains: false }) ?? "";
}
export function selectSavedDomains<T extends SavedRow>(items: T[], query: string, extension: string, sort: SavedDomainSort, language: string): T[] {
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase(language);
  const compareName = (a: T, b: T) => a.domain.localeCompare(b.domain, language, { numeric: true });
  const timestamp = (item: T) => Number.isFinite(Date.parse(item.created_at)) ? Date.parse(item.created_at) : 0;
  return items.filter(item => (!needle || item.domain.normalize("NFKC").toLocaleLowerCase(language).includes(needle))
    && (!extension || savedDomainExtension(item.domain) === extension))
    .sort((a, b) => sort === "name" ? compareName(a, b)
      : (sort === "oldest" ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a)) || compareName(a, b));
}

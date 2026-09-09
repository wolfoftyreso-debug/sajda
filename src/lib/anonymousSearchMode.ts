import { isLocalTestMode } from "@/lib/localTestMode";

export const SEARCH_TLD_IDS = [
  "com",
  "ai",
  "dev",
  "io",
  "app",
  "se",
  "nu",
  "net",
  "org",
  "xyz",
  "info",
  "biz",
] as const;

/**
 * Only offer suffixes with an audited HTTPS registry connector for generated
 * searches. Exact .se/.nu/.io requests can still explain an unknown status,
 * but must not fill generated batches with predictably uncheckable entries.
 */
export const PUBLIC_SEARCH_TLD_IDS = SEARCH_TLD_IDS.filter((tld) => !["io", "se", "nu"].includes(tld));

/**
 * Enables the deliberately anonymous, self-contained search surface used by
 * the local workstation test and the public Vercel deployment. It is opt-in
 * at build time; normal authenticated deployments stay unchanged.
 */
export function isPublicSearchMode(): boolean {
  return typeof window !== "undefined"
    && import.meta.env.VITE_PUBLIC_SEARCH_MODE === "true";
}

export function isAnonymousSearchMode(): boolean {
  return isLocalTestMode() || isPublicSearchMode();
}

export function getAnonymousSearchTlds(): readonly string[] {
  if (isLocalTestMode()) return PUBLIC_SEARCH_TLD_IDS;
  if (isPublicSearchMode()) return PUBLIC_SEARCH_TLD_IDS;
  return [];
}

/**
 * Search starts with every supported ending selected. The selector remains
 * editable so a focused search can be reduced to one or more extensions.
 */
export function getDefaultAnonymousSearchTlds(): readonly string[] {
  return getAnonymousSearchTlds();
}

/**
 * Swipe uses the same verified registry connectors as creative search.
 * Keep this list shared so a UI-only .com restriction cannot return.
 */
export function getSwipeTlds(): readonly string[] {
  return getAnonymousSearchTlds();
}

export function getAnonymousSearchEndpoint(): string {
  return isLocalTestMode() ? "/api/local-search" : "/api/domain-search";
}

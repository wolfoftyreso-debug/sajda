import { parse } from "tldts";
import type { PackageDomainInput } from "../../shared/name-packages";

/** Ephemeral navigation input only: never carries scores, identity claims or auth. */
export function brandPackageLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 253) return null;
  const text = value.trim().toLowerCase();
  const parsed = text.includes(".") ? parse(text, { allowPrivateDomains: false }) : null;
  const label = parsed ? parsed.domain === text ? parsed.domainWithoutSuffix : null : text;
  return label && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !label.startsWith("xn--") ? label : null;
}
export function brandPackageSeed(state: unknown): string | null {
  if (!state || typeof state !== "object" || !("brandPackageSeed" in state)) return null;
  return brandPackageLabel(state.brandPackageSeed);
}
/** Only requested exact rows may replace evidence; unrelated candidates survive. */
export function mergeBrandDomainChecks(previous: PackageDomainInput[], checked: PackageDomainInput[], requested: readonly string[]): PackageDomainInput[] {
  const allowed = new Set(requested);
  const rows = new Map(previous.map(row => [row.domain, row]));
  for (const row of checked) if (allowed.has(row.domain)) rows.set(row.domain, row);
  return [...rows.values()];
}

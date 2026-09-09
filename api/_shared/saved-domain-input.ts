import { domainToASCII } from "node:url";
import { z } from "zod";

export function normalizeSavedDomain(input: string): string | null {
  const value = input.trim().toLowerCase();
  // eslint-disable-next-line no-control-regex -- Reject control characters before URL/IDN normalization can discard them.
  if (/[\s/\\:@?#%\u0000-\u001f\u007f]/u.test(value)) return null;
  const domain = domainToASCII(value);
  if (!domain || domain.length > 253 || !domain.includes(".")) return null;
  const labels = domain.split(".");
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
  const tld = labels[labels.length - 1];
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/u.test(tld) ? domain : null;
}

const domain = z.string().max(253).transform(normalizeSavedDomain).refine(value => value !== null, "Enter a domain, not a URL.");

export const saveDomainInput = z.object({
  domain,
  registrarPrice: z.number().finite().min(0).max(1e12).default(0),
  estimatedValue: z.number().finite().min(0).max(1e12).default(0),
  confidenceScore: z.number().finite().min(0).max(100).default(0),
  rationale: z.string().max(4000).default(""),
}).strict();

export const removeDomainInput = z.object({ domain }).strict();

export function parseSavedDomainCursor(value: unknown): string | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/u.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new Error("invalid_cursor");
  }
  return value;
}

/** Bump when recipients, data categories or purposes change. Never infer consent. */
export const AI_CONSENT_VERSION = "2026-09-10" as const;
export type AiConsent = { version: typeof AI_CONSENT_VERSION; accepted: true };

export function hasCurrentAiConsent(value: unknown): value is AiConsent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === AI_CONSENT_VERSION && record.accepted === true
    && Object.keys(record).every(key => key === "version" || key === "accepted");
}

/** Omission explicitly selects non-AI processing, including older clients. */
export function parseAiConsent(value: unknown): AiConsent | undefined {
  if (value === undefined) return undefined;
  if (!hasCurrentAiConsent(value)) throw new Error(`AI permission must be {version:"${AI_CONSENT_VERSION}",accepted:true}; omit aiConsent to continue without third-party AI.`);
  return { version: AI_CONSENT_VERSION, accepted: true };
}

import { AI_CONSENT_VERSION, hasCurrentAiConsent, type AiConsent } from "../../shared/ai-consent";

export const AI_CONSENT_STORAGE_KEY = "sajda.ai-permission";
const listeners = new Set<() => void>();
let memoryChoice: boolean | undefined;

export function hasAiPermission(): boolean {
  if (typeof window === "undefined") return false;
  let stored: string | null;
  try { stored = window.localStorage.getItem(AI_CONSENT_STORAGE_KEY); }
  catch { return memoryChoice === true; }
  try { return hasCurrentAiConsent(JSON.parse(stored ?? "null")); }
  catch { return false; }
}

export function setAiPermission(accepted: boolean): void {
  memoryChoice = accepted;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, JSON.stringify({ version: AI_CONSENT_VERSION, accepted }));
    } catch { /* A blocked storage area keeps the explicit choice in this session. */ }
  }
  for (const notify of listeners) notify();
}

export function subscribeAiPermission(notify: () => void): () => void {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (event.key === AI_CONSENT_STORAGE_KEY || event.key === null) { memoryChoice = undefined; notify(); }
  };
  if (typeof window !== "undefined") window.addEventListener?.("storage", onStorage);
  return () => { listeners.delete(notify); if (typeof window !== "undefined") window.removeEventListener?.("storage", onStorage); };
}

/** Read at dispatch, not at mount: revocation applies to the next request. */
export function aiPermissionForRequest(): AiConsent | undefined {
  return hasAiPermission() ? { version: AI_CONSENT_VERSION, accepted: true } : undefined;
}

export function withAiPermission(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!(typeof input === "string" && ["/api/domain-search", "/api/deep-review"].includes(input))
    || init?.method !== "POST" || typeof init.body !== "string") return init;
  try {
    const body: unknown = JSON.parse(init.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) return init;
    // A stale caller-cached choice cannot override the current device setting.
    const { aiConsent: _prior, ...request } = body as Record<string, unknown>;
    void _prior;
    const consent = aiPermissionForRequest();
    return { ...init, body: JSON.stringify({ ...request, ...(consent ? { aiConsent: consent } : {}) }) };
  } catch { return init; }
}

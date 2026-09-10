import type { Language } from "@/i18n/LanguageProvider";
import { productFetch } from "./productFetch";

export const CONTACT_EMAIL = "dev@hypbit.com";
export const CONTACT_LIMITS = { name: 80, email: 254, subject: 120, message: 5000, website: 200 } as const;
export type ContactDraft = { name: string; email: string; subject: string; message: string; website: string };
export type ContactSubmission = Readonly<ContactDraft & { locale: Language; submissionId: string }>;
export type ContactField = keyof ContactDraft;
export type ContactErrorCode = "invalid_request" | "forbidden_origin" | "submission_conflict" | "submission_in_progress"
  | "submission_expired" | "request_too_large" | "unsupported_media_type" | "rate_limited" | "contact_unavailable" | "delivery_unavailable" | "unconfirmed";

const codes = new Set<ContactErrorCode>([
  "invalid_request", "forbidden_origin", "submission_conflict", "submission_in_progress", "request_too_large",
  "submission_expired", "unsupported_media_type", "rate_limited", "contact_unavailable", "delivery_unavailable",
]);
const singleLine = (value: string) => !Array.from(value).some(character => {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || code === 127;
});

function validAddress(email: string): boolean {
  const parts = email.split("@");
  if (parts.length !== 2 || email.length > CONTACT_LIMITS.email) return false;
  const [local, domain] = parts;
  const labels = domain.split(".");
  return Boolean(local) && local.length <= 64 && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u.test(local)
    && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") && labels.length >= 2
    && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))
    && /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/u.test(labels[labels.length - 1]);
}

const normalizedMessage = (message: string) => message.replace(/\r\n?/gu, "\n").trim();

export function validateContactDraft(draft: ContactDraft): ContactField[] {
  const invalid: ContactField[] = [];
  const name = draft.name.trim();
  const email = draft.email.trim();
  const subject = draft.subject.trim();
  const message = normalizedMessage(draft.message);
  if (name.length < 2 || name.length > CONTACT_LIMITS.name || !singleLine(name)) invalid.push("name");
  if (!validAddress(email)) invalid.push("email");
  if (subject.length < 3 || subject.length > CONTACT_LIMITS.subject || !singleLine(subject)) invalid.push("subject");
  if (message.length < 20 || message.length > CONTACT_LIMITS.message || Array.from(message).some(character => {
    const code = character.codePointAt(0) ?? 0;
    return code === 127 || (code < 32 && code !== 9 && code !== 10);
  })) invalid.push("message");
  if (draft.website.trim()) invalid.push("website");
  return invalid;
}

/** The identifier lives only in memory and is reused for an unchanged retry. */
export function prepareContactSubmission(
  draft: ContactDraft,
  locale: Language,
  previous?: ContactSubmission,
  newId: () => string = () => crypto.randomUUID(),
): ContactSubmission {
  const normalized = { name: draft.name.trim(), email: draft.email.trim(), subject: draft.subject.trim(), message: normalizedMessage(draft.message), website: draft.website.trim(), locale };
  // Switching interface language cannot create a second email after an
  // uncertain delivery. Keep the previous locale as well as its identifier.
  if (previous && Object.entries(normalized).every(([key, value]) => key === "locale" || previous[key as keyof typeof normalized] === value)) return previous;
  return Object.freeze({ ...normalized, submissionId: newId() });
}

export class ContactRequestError extends Error {
  constructor(readonly code: ContactErrorCode, readonly retryAfterSeconds?: number) {
    super(code);
    this.name = "ContactRequestError";
  }
}

/** "accepted" confirms provider acceptance, never inbox delivery. */
export async function sendContactSubmission(submission: ContactSubmission, signal?: AbortSignal): Promise<{ requestId: string }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 30_000);
  try {
    const response = await productFetch("/api/contact", {
      method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission), signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => undefined);
    const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : undefined;
    if (response.status === 200 && body?.ok === true && body.status === "accepted"
      && typeof body.requestId === "string" && /^[A-Za-z0-9_-]{8,100}$/u.test(body.requestId)) {
      return { requestId: body.requestId };
    }
    const code = !response.ok && body?.ok === false && typeof body.code === "string" && codes.has(body.code as ContactErrorCode)
      ? body.code as ContactErrorCode : "unconfirmed";
    const retryAfter = typeof body?.retryAfterSeconds === "number" && Number.isInteger(body.retryAfterSeconds) && body.retryAfterSeconds > 0
      ? Math.min(body.retryAfterSeconds, 86400) : undefined;
    throw new ContactRequestError(code, retryAfter);
  } catch (error) {
    if (error instanceof ContactRequestError) throw error;
    throw new ContactRequestError("unconfirmed");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

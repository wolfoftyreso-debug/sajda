import type { IncomingMessage } from "node:http";
import { AccountEmailError, accountEmailConfigured, sendContactEmail } from "./_shared/account-email.js";
import { accountRequestOrigin, requireSameOrigin } from "./_shared/account-origin.js";
import { AccountAccessError } from "./_shared/account-error.js";
import { reserveContactSubmission } from "./_shared/contact-guard.js";
import { createRequestId } from "./_shared/public-api.js";

type ContactRequest = Pick<IncomingMessage, "method" | "headers"> & {
  body?: unknown; socket?: { remoteAddress?: string };
  [Symbol.asyncIterator]?: IncomingMessage[typeof Symbol.asyncIterator];
};
interface ContactResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): ContactResponse;
  json(value: unknown): void;
}
interface ContactBody { submissionId: string; name: string; email: string; subject: string; message: string; website: string; locale: string }
class ContactError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfterSeconds?: number) { super(message); }
}
export const config = { maxDuration: 30 };
const MAX_BODY_BYTES = 24_576;
const invalid = () => new ContactError(400, "invalid_request", "Check the contact form and try again.");
const unavailable = () => new ContactError(503, "contact_unavailable", "Contact delivery is temporarily unavailable. Your message has not been confirmed. Please try again later.");

function line(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") throw invalid();
  const text = value.trim();
  if (text.length < min || text.length > max || [...text].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw invalid();
  return text;
}
function address(value: unknown): string {
  const text = line(value, 3, 254), parts = text.split("@");
  if (parts.length !== 2) throw invalid();
  const [local, domain] = parts;
  const labels = domain.split(".");
  if (!local || local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u.test(local)
    || local.startsWith(".") || local.endsWith(".") || local.includes("..") || labels.length < 2
    || !labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))
    || !/^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/u.test(labels.at(-1)!)) throw invalid();
  return text;
}

/** Parse once into canonical values used both by Resend and the retry fingerprint. */
export function parseContactBody(value: unknown): ContactBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  const fields = ["submissionId", "name", "email", "subject", "message", "website", "locale"];
  if (Object.keys(record).length !== fields.length || Object.keys(record).some(key => !fields.includes(key))) throw invalid();
  const submissionId = line(record.submissionId, 36, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(submissionId)) throw invalid();
  if (typeof record.website !== "string" || record.website.length > 200 || record.website.trim()) throw invalid();
  const locale = line(record.locale, 2, 2);
  if (!["sv", "en", "es", "fr", "zh"].includes(locale)) throw invalid();
  if (typeof record.message !== "string") throw invalid();
  const message = record.message.replace(/\r\n?/gu, "\n").trim();
  if (message.length < 20 || message.length > 5_000
    || [...message].some(character => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && code !== 9 && code !== 10);
    })) throw invalid();
  return { submissionId, name: line(record.name, 2, 80), email: address(record.email),
    subject: line(record.subject, 3, 120), message, website: "", locale };
}

async function readContactBody(request: ContactRequest): Promise<ContactBody> {
  const type = request.headers["content-type"];
  if (typeof type !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/iu.test(type)) {
    throw new ContactError(415, "unsupported_media_type", "Send an application/json request.");
  }
  const declaredSize = request.headers["content-length"];
  if (declaredSize !== undefined && (typeof declaredSize !== "string" || !/^\d+$/u.test(declaredSize))) throw invalid();
  if (Number(declaredSize) > MAX_BODY_BYTES) throw new ContactError(413, "request_too_large", "This message is too large.");
  let text: string;
  try {
    if (request.body !== undefined) text = typeof request.body === "string" ? request.body
      : Buffer.isBuffer(request.body) ? request.body.toString("utf8") : JSON.stringify(request.body);
    else {
      const chunks: Buffer[] = [];
      let bytes = 0;
      if (request[Symbol.asyncIterator]) for await (const chunk of request as IncomingMessage) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_BODY_BYTES) throw new ContactError(413, "request_too_large", "This message is too large.");
        chunks.push(buffer);
      }
      text = Buffer.concat(chunks).toString("utf8");
    }
    if (typeof text !== "string") throw invalid();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new ContactError(413, "request_too_large", "This message is too large.");
    return parseContactBody(JSON.parse(text));
  } catch (error) { if (error instanceof ContactError) throw error; throw invalid(); }
}

export function createContactHandler(deps: {
  emailReady?: () => boolean;
  reserve?: typeof reserveContactSubmission;
  send?: typeof sendContactEmail;
  environment?: () => NodeJS.ProcessEnv;
  log?: (record: Record<string, string | number>) => void;
} = {}) {
  return async (request: ContactRequest, response: ContactResponse): Promise<void> => {
    const requestId = createRequestId();
    for (const [name, value] of Object.entries({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Request-Id": requestId })) response.setHeader(name, value);
    try {
      if (request.method !== "POST") { response.setHeader("Allow", "POST"); throw new ContactError(405, "method_not_allowed", "Use POST for the contact form."); }
      try {
        const origin = accountRequestOrigin(request.headers, deps.environment?.() ?? process.env);
        requireSameOrigin(request.headers, origin);
      } catch (error) {
        if (error instanceof AccountAccessError && error.status === 403) throw new ContactError(403, "forbidden_origin", "Open the contact form on the Sajda website.");
        throw unavailable();
      }
      const body = await readContactBody(request);
      if (!(deps.emailReady ?? accountEmailConfigured)()) throw unavailable();
      const { submissionId, name, email, subject, message, locale } = body;
      const reservation = await (deps.reserve ?? reserveContactSubmission)({ id: submissionId,
        canonicalBody: JSON.stringify({ name, email, subject, message, locale }) }, request.headers, request.socket?.remoteAddress);
      if (reservation.kind === "conflict") throw new ContactError(409, "submission_conflict", "This submission identifier belongs to a different message. Refresh the form before sending a new message.");
      if (reservation.kind === "expired") throw new ContactError(409, "submission_expired", "This message can no longer be retried automatically. Please contact dev@hypbit.com before sending it again.");
      if (reservation.kind === "rate_limited" || reservation.kind === "in_progress") throw new ContactError(
        reservation.kind === "rate_limited" ? 429 : 409,
        reservation.kind === "rate_limited" ? "rate_limited" : "submission_in_progress",
        "Please wait before retrying this message.", reservation.retryAfterSeconds);
      if (reservation.kind === "unavailable") throw unavailable();
      if (reservation.kind === "send") {
        try { await (deps.send ?? sendContactEmail)({ id: submissionId, name, email, subject, message }); }
        catch (error) {
          await reservation.finish(false).catch(() => false);
          if (error instanceof AccountEmailError && error.status === 400) throw invalid();
          throw new ContactError(503, "delivery_unavailable", "Delivery could not be confirmed. Keep this form and retry the same message in a minute.", 60);
        }
        if (!await reservation.finish(true).catch(() => false)) throw new ContactError(503, "delivery_unavailable",
          "Delivery could not be confirmed. Keep this form and retry the same message in a minute.", 60);
      }
      (deps.log ?? (record => console.info(JSON.stringify(record))))({ event: "contact_accepted", requestId, submissionId });
      response.status(200).json({ ok: true, status: "accepted", requestId });
    } catch (error) {
      const failure = error instanceof ContactError ? error : unavailable();
      if (failure.retryAfterSeconds) response.setHeader("Retry-After", failure.retryAfterSeconds);
      // Never log the message, submission fingerprint, email or provider error.
      if (failure.status >= 500) (deps.log ?? (record => console.error(JSON.stringify(record))))({ event: "contact_failed", requestId, code: failure.code });
      response.status(failure.status).json({ ok: false, code: failure.code, error: failure.message, requestId,
        ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}) });
    }
  };
}

export default createContactHandler();

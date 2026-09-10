import { createHash } from "node:crypto";
import { accountEmailCopy, emailLanguage, type EmailLanguage } from "../../shared/account-email-copy.js";

export interface AccountEmailMessage {
  kind: "verify" | "reset";
  to: string;
  url: string;
  language?: EmailLanguage;
}

export interface ContactEmailMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

// Operator mailbox is fixed server-side, never supplied by a public request.
export const CONTACT_RECIPIENT = "dev@hypbit.com";

export class AccountEmailError extends Error {
  constructor(
    readonly code: "email_not_configured" | "invalid_email_request" | "email_delivery_failed",
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountEmailError";
  }
}

// This module belongs only in Vercel Functions. Never expose these variables
// through VITE_* or include the provider response, recipient, or action URL in logs.
function validAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254 || value !== value.trim()) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u.test(local)
    || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2
    && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))
    && /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/u.test(labels[labels.length - 1]);
}

function emailConfiguration(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.SAJDA_EMAIL_FROM?.trim() ?? "";
  if (!/^re_[A-Za-z0-9_-]{8,256}$/u.test(apiKey) || !from || from.length > 350) return null;
  // Accept one bare sender address or a conventional friendly-name mailbox.
  const named = /^([^<>\r\n]+) <([^<>]+)>$/u.exec(from);
  if (named) {
    if (!/^[\p{L}\p{N} .&'_-]{1,80}$/u.test(named[1]) || !validAddress(named[2])) return null;
  } else if (!validAddress(from)) return null;
  return { apiKey, from };
}

/** Configuration presence/syntax only; it does not claim domain verification. */
export function accountEmailConfigured(): boolean {
  return emailConfiguration() !== null;
}

function safeActionUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || /\s|\\/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (loopback && process.env.VERCEL) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback && !process.env.VERCEL)) return null;
    return url.toString();
  } catch { return null; }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function hasControlCharacters(value: string, multiline = false): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)));
  });
}

function emailContent(kind: AccountEmailMessage["kind"], url: string, language: EmailLanguage) {
  const copy = accountEmailCopy[language];
  const content = copy[kind];
  const safety = copy.safety;
  const text = `Sajda\n\n${content.heading}\n\n${content.introduction}\n\n${content.action}:\n${url}\n\n${safety}\n\n${content.notice}\n\n${copy.footer}`;
  const link = escapeHtml(url);
  const html = `<!doctype html><html lang="${language === "zh" ? "zh-Hans" : language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7fb;color:#172033;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5ef;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#176de5">Sajda</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.3">${escapeHtml(content.heading)}</h1>
<p style="font-size:16px;line-height:1.7">${escapeHtml(content.introduction)}</p>
<p style="margin:28px 0"><a href="${link}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#176de5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">${escapeHtml(content.action)}</a></p>
<p style="font-size:14px;line-height:1.7;color:#526176">${escapeHtml(safety)}</p>
<p style="font-size:14px;line-height:1.7;color:#526176">${escapeHtml(content.notice)}</p>
<p style="margin-top:24px;font-size:13px;line-height:1.7;color:#526176">${escapeHtml(copy.fallback)}<br><a href="${link}" style="color:#176de5;word-break:break-all;overflow-wrap:anywhere">${link}</a></p>
</td></tr></table><p style="font-size:12px;line-height:1.6;color:#526176">${escapeHtml(copy.footer)}</p>
</td></tr></table></body></html>`;
  return { subject: content.subject, text, html };
}

/** Resolves only after provider acceptance with an ID, not proof of inbox delivery. */
export async function sendAccountEmail(message: AccountEmailMessage): Promise<void> {
  const configuration = emailConfiguration();
  if (!configuration) throw new AccountEmailError("email_not_configured", 503, "Kontomejl är inte tillgängliga i den här miljön ännu.");
  const actionUrl = safeActionUrl(message?.url);
  if (!actionUrl || !validAddress(message?.to) || !["verify", "reset"].includes(message?.kind)) {
    throw new AccountEmailError("invalid_email_request", 400, "Mejlet kunde inte förberedas. Begär en ny länk.");
  }
  // Bind the key to the immutable rendered payload, including its locale.
  // Same-second verification requests can reuse a token URL in another language.
  // Never put the action token, recipient or locale payload itself in a header.
  const content = emailContent(message.kind, actionUrl, emailLanguage(message.language));
  const idempotencyKey = `sajda-${message.kind}-${createHash("sha256").update(JSON.stringify([message.kind, message.to, content])).digest("hex")}`;
  await sendProviderEmail(configuration, {
    to: [message.to], reply_to: CONTACT_RECIPIENT, ...content,
  }, idempotencyKey);
}

/** Contact messages go only to support; recovery tokens are never copied there. */
export async function sendContactEmail(message: ContactEmailMessage): Promise<void> {
  const configuration = emailConfiguration();
  if (!configuration) throw new AccountEmailError("email_not_configured", 503, "Kontaktformuläret kan inte skicka mejl i den här miljön ännu.");
  if (!message || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(message.id)
    || !validAddress(message.email)
    || typeof message.name !== "string" || message.name.trim().length < 2 || message.name.length > 100
    || typeof message.subject !== "string" || message.subject.trim().length < 3 || message.subject.length > 120
    || typeof message.message !== "string" || message.message.trim().length < 10 || message.message.length > 5000
    || hasControlCharacters(`${message.name}${message.subject}`)
    || hasControlCharacters(message.message, true)) {
    throw new AccountEmailError("invalid_email_request", 400, "Kontrollera kontaktuppgifterna och meddelandet.");
  }
  const { id, name, email, subject, message: body } = message;
  const text = `Nytt meddelande från Sajdas kontaktformulär\n\nNamn: ${name}\nE-post: ${email}\nÄmne: ${subject}\nReferens: ${id}\n\n${body}\n\nSvara på mejlet för att kontakta avsändaren. Innehållet ovan är inskickat av en besökare.`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f4f7fb;color:#172033;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:auto;padding:24px;background:#fff;border-radius:12px;overflow-wrap:anywhere"><h1 style="font-size:24px">Nytt kontaktmeddelande</h1><p><strong>Namn:</strong> ${escapeHtml(name)}<br><strong>E-post:</strong> ${escapeHtml(email)}<br><strong>Ämne:</strong> ${escapeHtml(subject)}</p><p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</p><p style="font-size:12px;color:#526176">Referens: ${escapeHtml(id)}<br>Innehållet är inskickat av en besökare. Svara på mejlet för att kontakta avsändaren.</p></main></body></html>`;
  // Include the immutable payload so mismatched retries cannot send altered mail.
  // The endpoint also binds this UUID to its payload in Postgres before delivery.
  const idempotencyKey = `sajda-contact-${createHash("sha256").update(JSON.stringify([id, name, email, subject, body])).digest("hex")}`;
  await sendProviderEmail(configuration, {
    to: [CONTACT_RECIPIENT], reply_to: email, subject: `Sajda kontakt: ${subject}`, text, html,
  }, idempotencyKey);
}

async function sendProviderEmail(
  configuration: { apiKey: string; from: string },
  content: { to: string[]; reply_to: string; subject: string; text: string; html: string },
  idempotencyKey: string,
): Promise<void> {
  const signal = AbortSignal.timeout(10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: configuration.from, ...content }),
      signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider rejected message");
    const result: unknown = await response.json();
    signal.throwIfAborted();
    if (!result || typeof result !== "object" || !("id" in result)
      || typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test(result.id)
      || "error" in result) throw new Error("Provider acceptance missing");
  } catch {
    // Provider bodies and thrown messages can contain credentials/recipient/link.
    // Deliberately replace them, do not preserve a raw cause or write them to logs.
    throw new AccountEmailError("email_delivery_failed", 503, "Mejlet kunde inte skickas just nu. Vänta en stund och begär en ny länk.");
  }
}

/** A confirmation code is sent only to the signed-in account's stored email.
 * This does not delete anything; deletion still requires an authenticated POST.
 * Never copy codes to the operator mailbox or put them in URLs/logs. */
export async function sendAccountDeletionEmail(message: {
  to: string; code: string; requestId: string; language?: EmailLanguage;
}): Promise<void> {
  const configuration = emailConfiguration();
  if (!configuration) throw new AccountEmailError("email_not_configured", 503, "Account email is temporarily unavailable.");
  if (!validAddress(message.to) || !/^\d{8}$/u.test(message.code)
    || !/^[0-9a-f-]{36}$/u.test(message.requestId)) {
    throw new AccountEmailError("invalid_email_request", 400, "Request a new account deletion code.");
  }
  const copy = {
    en: ["Confirm deletion of your Sajda account", "Your account deletion code", "Enter this code in Sajda to permanently delete your account. It expires in 15 minutes.", "If you did not request this, do not share the code. Your account has not been deleted."],
    sv: ["Bekräfta radering av ditt Sajda-konto", "Din kod för att radera kontot", "Ange koden i Sajda för att radera ditt konto permanent. Koden gäller i 15 minuter.", "Om du inte begärde detta ska du inte dela koden. Ditt konto har inte raderats."],
    es: ["Confirma la eliminación de tu cuenta de Sajda", "Tu código para eliminar la cuenta", "Introduce este código en Sajda para eliminar tu cuenta de forma permanente. Caduca en 15 minutos.", "Si no lo has solicitado, no compartas el código. Tu cuenta no se ha eliminado."],
    fr: ["Confirmez la suppression de votre compte Sajda", "Votre code de suppression", "Saisissez ce code dans Sajda pour supprimer définitivement votre compte. Il expire dans 15 minutes.", "Si vous n’avez pas fait cette demande, ne partagez pas le code. Votre compte n’a pas été supprimé."],
    zh: ["确认删除您的 Sajda 账户", "账户删除验证码", "请在 Sajda 中输入此验证码，以永久删除您的账户。验证码 15 分钟内有效。", "如果您没有发起此请求，请勿向他人透露验证码。您的账户尚未删除。"],
  }[emailLanguage(message.language)];
  const text = `Sajda\n\n${copy[1]}\n\n${message.code}\n\n${copy[2]}\n\n${copy[3]}`;
  const html = `<!doctype html><html lang="${message.language === "zh" ? "zh-Hans" : emailLanguage(message.language)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f7fb;color:#172033;padding:24px"><main style="max-width:520px;margin:auto;background:white;padding:28px;border-radius:12px"><p>Sajda</p><h1 style="font-size:24px">${escapeHtml(copy[1])}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(copy[2])}</p><p style="font-size:32px;font-weight:bold;letter-spacing:4px">${message.code}</p><p style="font-size:14px;line-height:1.6">${escapeHtml(copy[3])}</p></main></body></html>`;
  const digest = createHash("sha256").update(JSON.stringify([message.to, message.requestId, text])).digest("hex");
  await sendProviderEmail(configuration, { to: [message.to], reply_to: CONTACT_RECIPIENT, subject: copy[0], text, html }, `sajda-delete-${digest}`);
}

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { accountEmailConfigured, AccountEmailError, sendAccountEmail, sendContactEmail, type AccountEmailMessage, type ContactEmailMessage } from "../api/_shared/account-email";

const variables = ["RESEND_API_KEY", "SAJDA_EMAIL_FROM", "VERCEL"] as const;
let previousEnvironment: (string | undefined)[];
let originalFetch: typeof globalThis.fetch;
let requests: { url: string; init: RequestInit }[];
const actionUrl = "https://sajda.dev/api/auth/verify-email?token=private-link-token&callbackURL=%2Fwatchlist";
const message: AccountEmailMessage = { kind: "verify", to: "qa+sajda@example.com", url: actionUrl };

beforeEach(() => {
  previousEnvironment = variables.map(key => process.env[key]);
  process.env.RESEND_API_KEY = "re_testonly123456789";
  process.env.SAJDA_EMAIL_FROM = "Sajda <konto@sajda.dev>";
  process.env.VERCEL = "1";
  originalFetch = globalThis.fetch;
  requests = [];
  // All tests replace fetch. No test may send actual email.
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return Response.json({ id: "fixture-email-id" });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  variables.forEach((key, index) => {
    if (previousEnvironment[index] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[index];
  });
});

test("missing email credentials fail closed before any provider request", async () => {
  for (const key of ["RESEND_API_KEY", "SAJDA_EMAIL_FROM"] as const) {
    const configured = process.env[key];
    delete process.env[key];
    assert.equal(accountEmailConfigured(), false);
    await assert.rejects(() => sendAccountEmail(message), (error: unknown) =>
      error instanceof AccountEmailError && error.code === "email_not_configured" && error.status === 503);
    process.env[key] = configured;
  }
  assert.equal(requests.length, 0);
});

test("configuration validates a single sender mailbox and the server API key", () => {
  assert.equal(accountEmailConfigured(), true);
  for (const sender of ["konto@sajda.dev", "Sajda Konton <konto+sajda@sajda.dev>"]) {
    process.env.SAJDA_EMAIL_FROM = sender;
    assert.equal(accountEmailConfigured(), true);
  }
  for (const sender of ["not an email", "Sajda <konto@sajda.dev>\r\nBcc: victim@example.com", "one@sajda.dev,two@sajda.dev", "Sajda <konto@localhost>", "<konto@sajda.dev>", "a..b@sajda.dev", "konto@-sajda.dev"]) {
    process.env.SAJDA_EMAIL_FROM = sender;
    assert.equal(accountEmailConfigured(), false, sender);
  }
  process.env.SAJDA_EMAIL_FROM = "konto@sajda.dev";
  for (const key of ["", "sk_otherprovider", "re_a", "re_123456789\r\nInjected: value"]) {
    process.env.RESEND_API_KEY = key;
    assert.equal(accountEmailConfigured(), false);
  }
});

test("verification and password reset default to English multipart messages over HTTPS", async () => {
  await sendAccountEmail(message);
  await sendAccountEmail({ ...message, kind: "reset" });
  assert.equal(requests.length, 2);
  for (const [index, request] of requests.entries()) {
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.redirect, "error");
    assert.ok(request.init.signal instanceof AbortSignal);
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get("authorization"), "Bearer re_testonly123456789");
    assert.equal(headers.get("content-type"), "application/json");
    const body = JSON.parse(String(request.init.body));
    assert.equal(body.from, "Sajda <konto@sajda.dev>");
    assert.deepEqual(body.to, [message.to]);
    assert.equal(body.reply_to, "dev@hypbit.com");
    assert.match(body.subject, index === 0 ? /Confirm your email address/ : /Reset your password/);
    assert.match(body.text, /Sajda/);
    assert.ok(body.text.includes(actionUrl));
    assert.match(body.html, /<html lang="en">/);
    assert.match(body.html, /table role="presentation"/);
    assert.match(body.html, /max-width:560px/);
    assert.equal("cc" in body || "bcc" in body, false);
  }
});

test("all account email locales have native copy, correct language metadata and unchanged private action URLs", async () => {
  const headings = { en: "Confirm your email address", sv: "Bekräfta din e-postadress", es: "Confirma tu correo electrónico", fr: "Confirmez votre adresse e-mail", zh: "确认你的电子邮箱" } as const;
  for (const language of Object.keys(headings) as (keyof typeof headings)[]) {
    for (const kind of ["verify", "reset"] as const) {
      await sendAccountEmail({ ...message, language, kind });
      const body = JSON.parse(String(requests.at(-1)!.init.body));
      assert.ok(body.html.includes(`<html lang="${language === "zh" ? "zh-Hans" : language}">`));
      assert.ok(body.text.includes(actionUrl));
      assert.ok(body.html.includes("private-link-token&amp;callbackURL="));
      assert.deepEqual(body.to, [message.to]);
      assert.equal(body.reply_to, "dev@hypbit.com");
      assert.equal("cc" in body || "bcc" in body, false);
      if (kind === "verify") assert.ok(body.subject.includes(headings[language]));
      if (language !== "en") assert.ok(!body.text.includes("Choose a new password"));
    }
  }
});

test("unknown or injected email language falls back to English without becoming HTML", async () => {
  for (const language of [undefined, "de", "sv-SE", '__proto__', '<script>alert(1)</script>']) {
    await sendAccountEmail({ ...message, language } as AccountEmailMessage);
    const body = JSON.parse(String(requests.at(-1)!.init.body));
    assert.match(body.subject, /Confirm your email address/);
    assert.match(body.html, /<html lang="en">/);
    assert.doesNotMatch(body.html, /<script>/);
  }
});

const contact: ContactEmailMessage = {
  id: "01234567-89ab-4cde-8012-0123456789ab", name: "Test Besökare", email: "visitor@example.com",
  subject: "Fråga om domänsökning", message: "Detta är ett syntetiskt test, inget faktiskt mejl skickas.",
};

test("contact always sends to the operator and only replies to the visitor", async () => {
  await sendContactEmail({ ...contact, to: "attacker@example.com", from: "attacker@example.com" } as ContactEmailMessage);
  const body = JSON.parse(String(requests[0].init.body));
  assert.deepEqual(body.to, ["dev@hypbit.com"]);
  assert.equal(body.from, "Sajda <konto@sajda.dev>");
  assert.equal(body.reply_to, contact.email);
  assert.equal("cc" in body || "bcc" in body, false);
  assert.equal(body.subject, `Sajda kontakt: ${contact.subject}`);
  assert.ok(body.text.includes(contact.message));
  assert.ok(body.text.includes(contact.id));
});

test("contact content is HTML escaped and private text never appears in idempotency headers", async () => {
  const unsafe = { ...contact, name: '<img src="x">', subject: 'Hej <script>alert(1)</script>', message: '<script>alert(1)</script>\n& en fråga' };
  await sendContactEmail(unsafe);
  const body = JSON.parse(String(requests[0].init.body));
  assert.equal(body.html.includes("<script>"), false);
  assert.equal(body.html.includes('<img src="x">'), false);
  assert.ok(body.html.includes("&lt;script&gt;"));
  assert.ok(body.text.includes(unsafe.message));
  const key = new Headers(requests[0].init.headers).get("idempotency-key");
  assert.match(key!, /^sajda-contact-[a-f0-9]{64}$/);
  assert.equal(key!.includes(contact.email), false);
});

test("contact rejects malformed mailbox, injected headers, missing fields and excessive input", async () => {
  for (const patch of [
    { email: "visitor@example.com\r\nBcc:x@example.com" }, { name: "ab\r\nInjected" },
    { subject: "Hej\nBcc: x@example.com" }, { subject: "x".repeat(121) }, { name: "x".repeat(101) },
    { message: "x".repeat(5001) }, { message: "\u0000".repeat(20) }, { message: "short" },
    { id: "not-a-uuid" }, { id: undefined }, { email: "a@localhost" },
  ]) await assert.rejects(() => sendContactEmail({ ...contact, ...patch } as ContactEmailMessage),
    (error: unknown) => error instanceof AccountEmailError && error.code === "invalid_email_request");
  await assert.rejects(() => sendContactEmail(null as unknown as ContactEmailMessage));
  assert.equal(requests.length, 0);
});

test("identical contact retries use an identical provider key and modified payloads differ", async () => {
  await sendContactEmail(contact);
  await sendContactEmail({ ...contact });
  await sendContactEmail({ ...contact, subject: "Annan fråga" });
  const keys = requests.map(request => new Headers(request.init.headers).get("idempotency-key"));
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test("contact also fails closed on missing configuration and rejected or ambiguous provider acceptance", async () => {
  delete process.env.RESEND_API_KEY;
  await assert.rejects(() => sendContactEmail(contact), (error: unknown) => error instanceof AccountEmailError && error.code === "email_not_configured");
  assert.equal(requests.length, 0);
  process.env.RESEND_API_KEY = "re_testonly123456789";
  for (const payload of [{}, { message: "private provider failure" }, { id: "ok", error: "bad" }]) {
    globalThis.fetch = async () => Response.json(payload);
    await assert.rejects(() => sendContactEmail(contact), (error: unknown) => error instanceof AccountEmailError && error.code === "email_delivery_failed");
  }
});

test("HTML escapes action link attributes and visible fallback without corrupting the plain-text URL", async () => {
  const url = "https://sajda.dev/api/auth/verify-email?token=a'b&callbackURL=%3Cscript%3E";
  await sendAccountEmail({ ...message, url });
  const body = JSON.parse(String(requests[0].init.body));
  assert.ok(body.text.includes(new URL(url).toString()));
  assert.match(body.html, /token=a%27b&amp;callbackURL=/);
  assert.equal(body.html.includes("token=a'b&callbackURL="), false);
  assert.equal(body.html.includes("<script>"), false);
});

test("malformed recipients and message kinds cannot reach the email provider", async () => {
  for (const to of ["a@example.com\r\nBcc:victim@example.com", "a@example.com,b@example.com", "", "x@localhost", "a..b@example.com", "user@127.0.0.1"]) {
    await assert.rejects(() => sendAccountEmail({ ...message, to }), (error: unknown) =>
      error instanceof AccountEmailError && error.code === "invalid_email_request");
  }
  await assert.rejects(() => sendAccountEmail({ ...message, kind: "marketing" as AccountEmailMessage["kind"] }));
  await assert.rejects(() => sendAccountEmail(null as unknown as AccountEmailMessage));
  assert.equal(requests.length, 0);
});

test("deployed action links reject HTTP, local hosts, credentials, fragments and parser tricks", async () => {
  for (const url of [
    "http://sajda.dev/auth?token=secret", "http://localhost:8095/auth", "https://localhost/auth",
    "https://127.0.0.1/auth", "https://[::1]/auth", "javascript:alert(1)", "//sajda.dev/auth",
    "https://user:password@sajda.dev/auth", "https://sajda.dev/auth#token=secret",
    "https://sajda.dev/\nsecret", "https:\\sajda.dev\\auth", "not-a-url", "https://sajda.dev/" + "x".repeat(4100),
  ]) {
    await assert.rejects(() => sendAccountEmail({ ...message, url }), (error: unknown) =>
      error instanceof AccountEmailError && error.code === "invalid_email_request", url);
  }
  assert.equal(requests.length, 0);
});

test("loopback HTTP is allowed only outside Vercel; arbitrary HTTP never is", async () => {
  delete process.env.VERCEL;
  for (const url of ["http://localhost:8095/auth?token=test", "http://127.0.0.1:8095/auth", "http://[::1]:8095/auth"]) {
    await sendAccountEmail({ ...message, url });
  }
  assert.equal(requests.length, 3);
  for (const url of ["http://sajda.dev/auth", "http://localhost.attacker.example/auth", "http://0.0.0.0/auth"]) {
    await assert.rejects(() => sendAccountEmail({ ...message, url }));
  }
  assert.equal(requests.length, 3);
});

test("idempotency hashes kind and action URL without exposing recovery tokens in headers", async () => {
  await sendAccountEmail(message);
  await sendAccountEmail({ ...message });
  await sendAccountEmail({ ...message, kind: "reset" });
  await sendAccountEmail({ ...message, url: `${actionUrl}2` });
  const keys = requests.map(request => new Headers(request.init.headers).get("idempotency-key"));
  assert.match(keys[0]!, /^sajda-verify-[a-f0-9]{64}$/);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert.notEqual(keys[0], keys[3]);
  for (const request of requests) assert.equal(JSON.stringify(request.init.headers).includes("private-link-token"), false);
});

test("locale-specific email retries deduplicate identical payloads without provider key conflicts", async () => {
  await sendAccountEmail(message);
  await sendAccountEmail({ ...message, language: "en" });
  await sendAccountEmail({ ...message, language: "fr" });
  await sendAccountEmail({ ...message, language: "fr" });
  await sendAccountEmail({ ...message, language: "unsupported" } as unknown as AccountEmailMessage);
  const keys = requests.map(request => new Headers(request.init.headers).get("idempotency-key"));
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[0], keys[4]);
  assert.notEqual(keys[0], keys[2]);
  assert.equal(keys[2], keys[3]);
  assert.equal(requests[0].init.body, requests[1].init.body);
  assert.equal(requests[2].init.body, requests[3].init.body);
});

test("provider failures return controlled errors without logging tokens, addresses or raw bodies", async (context) => {
  const logs: unknown[] = [];
  context.mock.method(console, "error", (...args) => logs.push(args));
  context.mock.method(console, "warn", (...args) => logs.push(args));
  const privateDetail = `${actionUrl} ${message.to} re_testonly123456789`;
  for (const status of [400, 401, 403, 429, 500, 503]) {
    globalThis.fetch = async () => Response.json({ message: privateDetail }, { status });
    await assert.rejects(() => sendAccountEmail(message), (error: unknown) => {
      assert.ok(error instanceof AccountEmailError);
      assert.equal(error.code, "email_delivery_failed");
      assert.equal(error.status, 503);
      assert.equal(String(error).includes(privateDetail), false);
      assert.equal("cause" in error, false);
      return true;
    });
  }
  globalThis.fetch = async () => { throw new Error(privateDetail); };
  await assert.rejects(() => sendAccountEmail(message), (error: unknown) => error instanceof AccountEmailError && !String(error).includes(privateDetail));
  assert.deepEqual(logs, []);
});

test("success requires a provider message ID and valid JSON, not merely HTTP 200", async () => {
  for (const payload of [null, {}, { id: "" }, { id: 123 }, { data: { id: "not-rest-contract" } }, { id: "ok", error: "failed" }]) {
    globalThis.fetch = async () => Response.json(payload);
    await assert.rejects(() => sendAccountEmail(message), (error: unknown) => error instanceof AccountEmailError && error.code === "email_delivery_failed");
  }
  globalThis.fetch = async () => new Response("<html>provider proxy failure</html>");
  await assert.rejects(() => sendAccountEmail(message), (error: unknown) => error instanceof AccountEmailError && error.code === "email_delivery_failed");
});

test("provider timeout is ten seconds and aborts as a controlled retryable failure", async (context) => {
  const controller = new AbortController();
  context.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, 10_000);
    return controller.signal;
  });
  globalThis.fetch = async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("raw secret provider timeout")), { once: true });
    controller.abort();
  });
  await assert.rejects(() => sendAccountEmail(message), (error: unknown) =>
    error instanceof AccountEmailError && error.code === "email_delivery_failed" && !String(error).includes("secret"));
});

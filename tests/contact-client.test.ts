import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { CONTACT_EMAIL, ContactRequestError, prepareContactSubmission, sendContactSubmission, validateContactDraft,
  type ContactDraft, type ContactErrorCode } from "../src/lib/contact";
import { contactCopy, contactErrorMessage } from "../src/i18n/contactCopy";
import { applyDocumentMetadata } from "../src/i18n/LanguageProvider";

const draft: ContactDraft = { name: "Test Person", email: "qa+contact@example.test", subject: "Search feedback", message: "This is a safe contact form test message.", website: "" };
const firstId = "f703794d-b2b6-4f91-9a8f-a5ca91dd6720";
const nextId = "c94b2c42-a8b0-4f7b-96f1-6a3f3c477f04";

test("contact validation accepts Unicode messages and rejects field/header abuse", () => {
  assert.deepEqual(validateContactDraft(draft), []);
  assert.deepEqual(validateContactDraft({ ...draft, name: "王小明", message: "这是关于域名搜索的问题，请帮助我们检查这个搜索结果，谢谢。" }), []);
  for (const [field, value] of [
    ["name", "x"], ["name", "x".repeat(81)], ["name", "First\nLast"],
    ["email", "missing-at.example.test"], ["email", "a..b@example.test"], ["email", ".qa@example.test"],
    ["email", "qa@example..test"], ["email", "qa@example.test\r\nBcc:other@example.test"],
    ["subject", "hi"], ["subject", "x".repeat(121)], ["subject", "Test\nBcc: bad"],
    ["message", "x".repeat(19)], ["message", "x".repeat(5001)], ["message", `${draft.message}\u0000`],
    ["website", "https://spam.example.test"],
  ] as const) assert.ok(validateContactDraft({ ...draft, [field]: value }).includes(field), `${field} should be rejected`);
  assert.deepEqual(validateContactDraft({ ...draft, message: `First line of the request.\r\nSecond line\twith detail.` }), []);
});

test("unchanged retries keep one immutable UUID and payload, including after locale changes", () => {
  let newIds = 0;
  const id = () => { newIds += 1; return newIds === 1 ? firstId : nextId; };
  const first = prepareContactSubmission(draft, "sv", undefined, id);
  const retry = prepareContactSubmission({ ...draft, name: ` ${draft.name} ` }, "sv", first, id);
  assert.equal(first, retry);
  assert.equal(Object.isFrozen(first), true);
  const translatedRetry = prepareContactSubmission(draft, "en", first, id);
  assert.equal(translatedRetry, first);
  assert.equal(translatedRetry.locale, "sv");
  assert.equal(newIds, 1);
  const edited = prepareContactSubmission({ ...draft, message: `${draft.message} More details.` }, "en", first, id);
  assert.equal(edited.submissionId, nextId);
  assert.equal(edited.locale, "en");
  assert.equal(newIds, 2);
  const multiline = prepareContactSubmission({ ...draft, message: `${draft.message}\r\nSecond line.` }, "sv", undefined, id);
  assert.equal(prepareContactSubmission({ ...draft, message: `${draft.message}\nSecond line.` }, "sv", multiline, id), multiline);
});

test("contact request validates provider acceptance and keeps retry payload without exposing server errors", async t => {
  const originalFetch = globalThis.fetch;
  const submission = prepareContactSubmission(draft, "sv", undefined, () => firstId);
  const sent: RequestInit[] = [];
  let response: () => Response = () => Response.json({ ok: true, status: "accepted", requestId: firstId });
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, "/api/contact");
    sent.push(init);
    return response();
  };
  try {
    await t.test("only acknowledged 200 accepted is success", async () => {
      assert.equal((await sendContactSubmission(submission)).requestId, firstId);
      for (const payload of [{}, { ok: true }, { ok: true, status: "delivered", requestId: firstId }, { ok: true, status: "accepted", requestId: "<script>" }]) {
        response = () => Response.json(payload);
        await assert.rejects(sendContactSubmission(submission), (error: ContactRequestError) => error.code === "unconfirmed");
      }
    });
    await t.test("retry and terminal errors stay structured; unknown text is never displayed", async () => {
      for (const [status, code] of [[400, "invalid_request"], [409, "submission_expired"], [409, "submission_in_progress"], [429, "rate_limited"], [503, "contact_unavailable"], [503, "delivery_unavailable"]] as const) {
        response = () => Response.json({ ok: false, code, error: "Secret provider detail must not leak", retryAfterSeconds: 60 }, { status });
        await assert.rejects(sendContactSubmission(submission), (error: ContactRequestError) => error.code === code && error.retryAfterSeconds === 60 && error.message === code);
      }
      response = () => new Response("Unavailable", { status: 502 });
      await assert.rejects(sendContactSubmission(submission), (error: ContactRequestError) => error.code === "unconfirmed");
      response = () => { throw new Error("Network interrupted"); };
      await assert.rejects(sendContactSubmission(submission), (error: ContactRequestError) => error.code === "unconfirmed");
    });
    for (const init of sent) {
      assert.equal(init.method, "POST");
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.equal(init.body, JSON.stringify(submission));
      assert.deepEqual(init.headers, { "Content-Type": "application/json" });
      assert.equal("to" in JSON.parse(String(init.body)), false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("all locales explain privacy, real acceptance, retry expiry and password-reset recipient", async () => {
  const errors: ContactErrorCode[] = ["invalid_request", "forbidden_origin", "submission_conflict", "submission_expired", "submission_in_progress",
    "request_too_large", "unsupported_media_type", "rate_limited", "contact_unavailable", "delivery_unavailable", "unconfirmed"];
  for (const language of ["sv", "en", "es", "fr", "zh"] as const) {
    assert.match(contactCopy[language].privacy, /Resend/u);
    assert.match(contactCopy[language].privacy, /dev@hypbit\.com/u);
    assert.match(contactErrorMessage("submission_expired", language), /dev@hypbit\.com/u);
    for (const code of errors) assert.ok(contactErrorMessage(code, language).length > 10);
  }
  assert.equal(CONTACT_EMAIL, "dev@hypbit.com");
  const component = await readFile(new URL("../src/pages/Contact.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /localStorage|sessionStorage/u);
  assert.match(component, /<form noValidate onSubmit=\{submit\}/u);
  assert.match(component, /activeRequest\.current \|\| receipt/u);
  assert.match(component, /to="\/auth\?mode=reset"/u);
  assert.match(component, /aria-invalid/u);
  assert.match(component, /role="alert"/u);
  assert.match(component, /name="website" tabIndex=\{-1\}/u);
});

test("contact metadata survives the global language pass and resets when leaving contact", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const attributes = new Map<string, string>();
  const document = { title: "", documentElement: { lang: "" }, querySelector: (selector: string) => ({
    setAttribute: (_name: string, value: string) => attributes.set(selector, value),
  }) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  try {
    for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
      applyDocumentMetadata(language, "/contact"); // page entry
      applyDocumentMetadata(language, "/contact"); // global language effect runs afterwards
      assert.equal(document.title, `${contactCopy[language].title} — Sajda`);
      assert.equal(attributes.get("meta[property='og:title']"), document.title);
      assert.equal(attributes.get("meta[name='description']"), contactCopy[language].lead);
    }
    applyDocumentMetadata("sv", "/");
    assert.equal(document.title, "Sajda — Domänsökning");
    applyDocumentMetadata("en", "/contact/");
    assert.equal(document.title, "Contact Sajda — Sajda");
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
});

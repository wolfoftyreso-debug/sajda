import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { sendAccountDeletionEmail } from "../api/_shared/account-email.js";

const variables = ["RESEND_API_KEY", "SAJDA_EMAIL_FROM"];
let previous: (string | undefined)[];
let original: typeof fetch;
const requests: RequestInit[] = [];
beforeEach(() => {
  previous = variables.map(key => process.env[key]); original = globalThis.fetch; requests.length = 0;
  process.env.RESEND_API_KEY = "re_deletionTestOnly0000";
  process.env.SAJDA_EMAIL_FROM = "Sajda <account@mail.hypbit.com>";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails"); requests.push(init!);
    return Response.json({ id: "fixture-deletion-email" });
  };
});
afterEach(() => {
  globalThis.fetch = original;
  variables.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
});
const message = { to: "owner@example.test", code: "04213798", requestId: "820b9baa-4444-4dca-99e2-a63854384a18" };
test("deletion codes use five localized multipart messages, account-only recipient and no URL credential", async () => {
  for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
    await sendAccountDeletionEmail({ ...message, language });
    const request = requests.at(-1)!;
    const body = JSON.parse(String(request.body));
    assert.deepEqual(body.to, [message.to]); assert.equal(body.reply_to, "dev@hypbit.com");
    assert.equal(body.cc, undefined); assert.equal(body.bcc, undefined);
    assert.match(body.html, new RegExp(`<html lang="${language === "zh" ? "zh-Hans" : language}">`, "u"));
    assert.ok(body.text.includes(message.code)); assert.ok(body.html.includes(message.code));
    assert.doesNotMatch(body.html, /href=|https?:\/\//u);
    assert.doesNotMatch(JSON.stringify(request.headers), /04213798|owner@example|820b9baa/u);
  }
  assert.equal(new Set(requests.map(request => JSON.parse(String(request.body)).subject)).size, 5);
});
test("deletion delivery retries are immutable and no fake provider success is accepted", async () => {
  await sendAccountDeletionEmail(message); await sendAccountDeletionEmail(message);
  assert.deepEqual(requests[0].headers, requests[1].headers);
  await sendAccountDeletionEmail({ ...message, language: "sv" });
  assert.notDeepEqual(requests[1].headers, requests[2].headers);
  globalThis.fetch = async () => Response.json({ ok: true });
  await assert.rejects(() => sendAccountDeletionEmail(message), { code: "email_delivery_failed" });
  globalThis.fetch = async () => { throw new Error("private recipient code secret"); };
  await assert.rejects(() => sendAccountDeletionEmail(message), error => error instanceof Error && !/private|recipient|code|secret/u.test(error.message));
});
test("deletion email validation rejects malformed input before provider access", async () => {
  for (const bad of [{ ...message, code: "1234567" }, { ...message, to: "owner@example.test\r\nBcc:a@b.test" }, { ...message, requestId: "../../private" }]) {
    await assert.rejects(() => sendAccountDeletionEmail(bad), { code: "invalid_email_request" });
  }
  assert.equal(requests.length, 0);
});

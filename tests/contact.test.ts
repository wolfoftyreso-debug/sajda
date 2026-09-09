import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContactHandler, parseContactBody } from "../api/contact.js";
import type { ContactReservation } from "../api/_shared/contact-guard.js";

const body = () => ({ submissionId: randomUUID(), name: "Ada Test", email: "ada@example.test", subject: "A contact question",
  message: "Could you explain how saved domain comparisons work?", website: "", locale: "en" });
const environment = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "sajda-fixture.vercel.app" };
const headers = { host: "sajda-fixture.vercel.app", origin: "https://sajda-fixture.vercel.app", "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" };
function harness() {
  const sent: unknown[] = [], reserved: unknown[] = [], finished: boolean[] = [], logs: unknown[] = [];
  const deps = {
    environment: () => environment, emailReady: () => true,
    reserve: async (...args: unknown[]): Promise<ContactReservation> => { reserved.push(args); return { kind: "send", finish: async accepted => { finished.push(accepted); return true; } }; },
    send: async (message: unknown) => { sent.push(message); }, log: (record: unknown) => { logs.push(record); },
  };
  const request = { method: "POST", headers: { ...headers }, body: body(), socket: { remoteAddress: "127.0.0.1" } };
  const response = { statusCode: 0, headers: {} as Record<string, string | number>, body: {} as Record<string, unknown>,
    setHeader(name: string, value: string | number) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value as Record<string, unknown>; },
  };
  return { deps, request, response, sent, reserved, finished, logs, run: () => createContactHandler(deps)(request, response) };
}

test("contact only confirms provider acceptance after durable state is persisted", async () => {
  const h = harness(); await h.run();
  assert.equal(h.response.statusCode, 200);
  assert.equal(h.response.body.status, "accepted");
  assert.deepEqual(h.finished, [true]);
  const outgoing = h.sent[0] as Record<string, unknown>;
  assert.equal(outgoing.email, h.request.body.email);
  assert.equal(outgoing.id, h.request.body.submissionId);
  assert.equal(outgoing.to, undefined);
  const parameters = h.reserved[0] as [{ id: string; canonicalBody: string }];
  assert.equal(parameters[0].id, outgoing.id);
  assert.deepEqual(JSON.parse(parameters[0].canonicalBody), { name: outgoing.name, email: outgoing.email,
    subject: outgoing.subject, message: outgoing.message, locale: "en" });
  assert.equal(h.response.headers["Cache-Control"], "private, no-store");
  assert.equal(h.response.headers["Access-Control-Allow-Origin"], undefined);
  assert.doesNotMatch(JSON.stringify(h.response.body), /example.test|Ada|comparisons/);
  assert.deepEqual(h.logs, [{ event: "contact_accepted", requestId: h.response.body.requestId, submissionId: h.request.body.submissionId }]);
  assert.doesNotMatch(JSON.stringify(h.logs), /example.test|Ada|comparisons/);
});

test("contact rejects cross-origin/missing-origin/spoofed host and non-POST before DB/email", async () => {
  for (const change of [
    { origin: "https://evil.test" }, { origin: "null" }, { origin: "" }, { host: "evil.test" },
    { "sec-fetch-site": "cross-site" }, { host: [headers.host] }, { origin: [headers.origin] },
  ]) {
    const h = harness(); Object.assign(h.request.headers, change); await h.run();
    assert.equal(h.response.statusCode, 403); assert.equal(h.reserved.length + h.sent.length, 0);
  }
  for (const method of ["GET", "OPTIONS", "PUT", "DELETE"]) {
    const h = harness(); h.request.method = method; await h.run();
    assert.equal(h.response.statusCode, 405); assert.equal(h.sent.length, 0);
  }
});

test("contact requires JSON and caps pre-parsed/raw/streamed body bytes", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/json; charset=latin1"]) {
    const h = harness(); h.request.headers["content-type"] = type; await h.run(); assert.equal(h.response.statusCode, 415);
  }
  for (const value of [{ ...body(), message: "a".repeat(25_000) }, JSON.stringify({ ...body(), message: "💙".repeat(7_000) })]) {
    const h = harness(); Object.assign(h.request, { body: value }); await h.run(); assert.equal(h.response.statusCode, 413); assert.equal(h.reserved.length, 0);
  }
  const h = harness();
  const request = { method: "POST", headers, async *[Symbol.asyncIterator]() { yield Buffer.from("a".repeat(24_000)); yield Buffer.from("b".repeat(1_000)); } };
  await createContactHandler(h.deps)(request, h.response);
  assert.equal(h.response.statusCode, 413); assert.equal(h.sent.length, 0);
});

test("contact validates required schema, honeypot, UUIDv4, mailbox and control characters", () => {
  for (const changes of [
    { submissionId: "bad" }, { submissionId: "00000000-0000-1000-8000-000000000000" }, { name: "a" }, { name: "a".repeat(81) },
    { name: "A\r\nBcc: x@example.test" }, { email: "a..b@example.test" }, { email: "a@example.test\nBcc:x@example.test" },
    { subject: "Hi" }, { subject: "Hello\nInjected" }, { subject: "a".repeat(121) }, { message: "Too short" },
    { message: "a".repeat(5_001) }, { message: "Long enough but contains \u0000 a null" }, { website: "https://spam.test" },
    { website: null }, { locale: "de" }, { to: "attacker@example.test" }, { resetToken: "no" },
  ]) assert.throws(() => parseContactBody({ ...body(), ...changes }));
  for (const value of [null, [], "{}", 0, { ...body(), email: undefined }]) assert.throws(() => parseContactBody(value));
});

test("contact canonicalizes Unicode text/whitespace/newlines but preserves meaningful message content", () => {
  const value = body();
  const parsed = parseContactBody({ ...value, name: "  Åsa 李  ", message: "  En fråga om domäner.\r\nTack så mycket! 💙  " });
  assert.equal(parsed.name, "Åsa 李");
  assert.equal(parsed.message, "En fråga om domäner.\nTack så mycket! 💙");
});

test("unconfigured contact returns honest 503 without consuming allowance", async () => {
  const h = harness(); h.deps.emailReady = () => false; await h.run();
  assert.equal(h.response.statusCode, 503); assert.equal(h.response.body.ok, false); assert.equal(h.sent.length + h.reserved.length, 0);
});

test("accepted retry returns success without another provider call", async () => {
  const h = harness(); h.deps.reserve = async () => ({ kind: "accepted" }); await h.run();
  assert.equal(h.response.statusCode, 200); assert.equal(h.sent.length, 0);
});

test("durable denial maps to safe status and retry guidance without sending", async () => {
  for (const [result, code, status] of [
    [{ kind: "conflict" }, "submission_conflict", 409], [{ kind: "expired" }, "submission_expired", 409],
    [{ kind: "in_progress", retryAfterSeconds: 60 }, "submission_in_progress", 409],
    [{ kind: "rate_limited", retryAfterSeconds: 86400 }, "rate_limited", 429], [{ kind: "unavailable" }, "contact_unavailable", 503],
  ] as [ContactReservation, string, number][]) {
    const h = harness(); h.deps.reserve = async () => result; await h.run();
    assert.equal(h.response.statusCode, status); assert.equal(h.response.body.code, code); assert.equal(h.sent.length, 0);
    if ("retryAfterSeconds" in result) assert.equal(h.response.headers["Retry-After"], result.retryAfterSeconds);
  }
});

test("provider failure finishes pending state, never leaks details or falsely succeeds", async () => {
  const h = harness(); h.deps.send = async () => { throw new Error("private-token ada@example.test user-message"); }; await h.run();
  assert.equal(h.response.statusCode, 503); assert.equal(h.response.body.code, "delivery_unavailable"); assert.deepEqual(h.finished, [false]);
  assert.doesNotMatch(JSON.stringify([h.logs, h.response.body]), /private-token|ada@example.test|user-message/);
});

test("database failure after provider acceptance returns uncertain retry, not false confirmation", async () => {
  for (const throws of [false, true]) {
    const h = harness(); h.deps.reserve = async () => ({ kind: "send", finish: async () => { if (throws) throw new Error("private-database-url"); return false; } });
    await h.run(); assert.equal(h.sent.length, 1); assert.equal(h.response.statusCode, 503); assert.equal(h.response.body.code, "delivery_unavailable");
    assert.doesNotMatch(JSON.stringify([h.logs, h.response.body]), /private-database-url/);
  }
});

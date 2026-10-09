import assert from "node:assert/strict";
import { test } from "node:test";
import { checkEmailReadiness } from "../scripts/check-email-readiness.mjs";

const id = "640bdcdd-32aa-4286-a4cc-9c56fdc66546";
const otherId = "2744d5ee-e66e-4cb5-a461-e03bc19b0ea8";
const environment = { RESEND_API_KEY: "re_operatorFixtureOnly", SAJDA_EMAIL_FROM: "Sajda <noreply@mail.sajda.com>" };
const list = (data = [{ id, name: "mail.sajda.com" }], has_more = false) => ({ object: "list", data, has_more });
const detail = patch => ({ id, name: "mail.sajda.com", status: "verified", capabilities: { sending: "enabled" },
  open_tracking: false, click_tracking: false, ...patch });
async function run(responses, options = {}) {
  const requests = []; const waits = [];
  const result = await checkEmailReadiness({ environment, fetchImpl: async (url, init) => {
    requests.push({ url, init }); const body = responses.shift();
    if (body instanceof Error) throw body;
    return body instanceof Response ? body : Response.json(body);
  }, wait: async duration => { waits.push(duration); }, ...options });
  return { result, requests, waits };
}

test("verified domain and disabled tracking are configuration proof, never delivery proof", async () => {
  const { result, requests, waits } = await run([list(), detail()]);
  assert.equal(result.readiness, "provider_configuration_verified");
  assert.equal(result.delivery, "not_tested"); assert.equal(result.emailsSent, 0);
  assert.equal(result.providerReads, 2); assert.deepEqual(result.issues, []);
  assert.deepEqual(waits, [600]);
  for (const { url, init } of requests) {
    assert.ok(url.startsWith("https://api.resend.com/domains"));
    assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal); assert.equal(init.body, undefined);
  }
  assert.doesNotMatch(JSON.stringify(result), /operatorFixtureOnly|noreply|Authorization/u);
});

test("missing, protected-export or malformed keys fail before any provider read", async () => {
  for (const RESEND_API_KEY of [undefined, "[SENSITIVE]", "", "re_short", "re_fixture\r\nBcc:x@y.test"]) {
    const { result, requests } = await run([], { environment: { ...environment, RESEND_API_KEY } });
    assert.deepEqual(result.issues, ["email_key_unavailable"]); assert.equal(requests.length, 0);
  }
});

test("unapproved or malformed sender configuration fails before the provider", async () => {
  for (const SAJDA_EMAIL_FROM of ["Sajda <noreply@hypbit.com>", "Sajda <noreply@mail.sajda.com>\nBcc:x@y.test",
    "a..b@mail.sajda.com", "one@mail.sajda.com,two@mail.sajda.com", "noreply@-mail.sajda.com", ""]) {
    const { result, requests } = await run([], { environment: { ...environment, SAJDA_EMAIL_FROM } });
    assert.equal(result.readiness, "blocked"); assert.equal(requests.length, 0);
  }
  const { result, requests } = await run([], { expectedDomain: "private-token\r\n" });
  assert.deepEqual(result.issues, ["expected_sender_domain_invalid"]); assert.equal(requests.length, 0);
  assert.equal(result.expectedDomain, "mail.sajda.com");
});

test("an absent approved sender is explicit and unrelated domain names never leave output", async () => {
  const { result } = await run([list([{ id: otherId, name: "unrelated.example.com" }])]);
  assert.deepEqual(result.issues, ["sender_domain_not_registered"]);
  assert.doesNotMatch(JSON.stringify(result), /unrelated/u);
});

test("pagination inspects later pages and never declares a partial list absent", async () => {
  const { result, requests } = await run([list([{ id: otherId, name: "other.example.com" }], true), list(), detail()]);
  assert.equal(result.readiness, "provider_configuration_verified");
  assert.ok(requests[1].url.endsWith(`&after=${otherId}`));
  const pages = Array.from({ length: 5 }, (_, index) => list([{ id: `00000000-0000-4000-8000-00000000000${index}`, name: "other.example.com" }], true));
  assert.deepEqual((await run(pages)).result.issues, ["provider_domain_list_incomplete"]);
});

test("pagination loops and duplicate sender matches fail closed", async () => {
  assert.deepEqual((await run([list([], true)])).result.issues, ["provider_pagination_invalid"]);
  assert.deepEqual((await run([list([], false), detail()])).result.issues, ["sender_domain_not_registered"]);
  assert.deepEqual((await run([list([{ id: otherId, name: "other.example.com" }], true),
    list([{ id: otherId, name: "other.example.com" }], true)])).result.issues, ["provider_pagination_invalid"]);
  assert.deepEqual((await run([list([{ id, name: "mail.sajda.com" }, { id: otherId, name: "mail.sajda.com" }])])).result.issues, ["sender_domain_ambiguous"]);
});

test("pending, failed and disabled sending do not become verified configuration", async () => {
  for (const status of ["not_started", "pending", "failed", "temporary_failure"]) {
    assert.deepEqual((await run([list(), detail({ status })])).result.issues, ["sender_domain_not_verified"]);
  }
  for (const capabilities of [undefined, { sending: "disabled" }]) {
    assert.deepEqual((await run([list(), detail({ capabilities })])).result.issues, ["sender_domain_sending_not_enabled"]);
  }
});

test("enabled or unknown account tracking blocks readiness", async () => {
  for (const patch of [{ open_tracking: true }, { click_tracking: true }, { open_tracking: undefined }, { click_tracking: undefined }]) {
    assert.deepEqual((await run([list(), detail(patch)])).result.issues, ["account_email_tracking_not_disabled"]);
  }
});

test("provider permissions, rate limits and exceptions are sanitized", async () => {
  for (const [status, issue] of [[401, "provider_read_permission_denied"], [403, "provider_read_permission_denied"],
    [429, "provider_read_rate_limited"], [500, "provider_read_failed"]]) {
    const { result } = await run([Response.json({ message: "private token recovery recipient" }, { status })]);
    assert.deepEqual(result.issues, [issue]); assert.doesNotMatch(JSON.stringify(result), /private|recipient|recovery/u);
  }
  const { result } = await run([new Error("https://secret:credential@example.com/account?token=private")]);
  assert.deepEqual(result.issues, ["provider_read_failed"]);
  assert.doesNotMatch(JSON.stringify(result), /credential|private|token/u);
});

test("malformed, oversized and mismatched provider payloads never pass", async () => {
  for (const body of [null, {}, { data: [] }, list([{ id: "../../secret", name: "mail.sajda.com" }]),
    list([{ id, name: "bad name" }]), list(Array.from({ length: 101 }, () => ({ id, name: "mail.sajda.com" })))]) {
    assert.deepEqual((await run([body])).result.issues, ["provider_response_invalid"]);
  }
  for (const patch of [{ id: otherId }, { name: "wrong.example.com" }, { name: {} }, { status: "surprise" }]) {
    assert.deepEqual((await run([list(), detail(patch)])).result.issues, ["provider_response_invalid"]);
  }
  assert.deepEqual((await run([new Response("x".repeat(131_073))])).result.issues, ["provider_read_failed"]);
  assert.deepEqual((await run([new Response("not JSON")])).result.issues, ["provider_read_failed"]);
});

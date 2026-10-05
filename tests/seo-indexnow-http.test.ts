import assert from "node:assert/strict";
import test from "node:test";
import { createIndexNowHandler, validIndexNowSubmitSecret } from "../api/indexnow";

const secret = "indexnow-submit-only-credential-123456";

function recorder() {
  return {
    code: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string | number>,
    setHeader(name: string, value: string | number) { this.headers[name.toLowerCase()] = value; },
    status(code: number) { this.code = code; return this; },
    json(payload: unknown) { this.body = payload; },
  };
}

test("IndexNow HTTP submission is method-bound and requires one exact server credential", async () => {
  let submissions = 0;
  const handler = createIndexNowHandler({
    secret: () => secret,
    submit: async () => { submissions += 1; return { submitted: true, reason: "index", count: 24 }; },
  });
  for (const request of [
    { method: "GET", headers: {} },
    { method: "POST", headers: {} },
    { method: "POST", headers: { authorization: "Bearer wrong" } },
    { method: "POST", headers: { authorization: [`Bearer ${secret}`] } },
    { method: "POST", headers: { authorization: `Bearer ${secret}`, Authorization: `Bearer ${secret}` } },
  ]) {
    const response = recorder();
    await handler(request, response);
    assert.equal(response.code, request.method === "GET" ? 405 : 401);
  }
  assert.equal(submissions, 0);
  const response = recorder();
  await handler({ method: "POST", headers: { authorization: `Bearer ${secret}` } }, response);
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { submitted: true, reason: "index" });
  assert.equal(submissions, 1);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("IndexNow HTTP errors remain safe and no secret is accepted from malformed configuration", async () => {
  assert.equal(validIndexNowSubmitSecret({ authorization: `Bearer ${secret}` }, "short"), false);
  const rejected = createIndexNowHandler({
    secret: () => secret,
    submit: async () => ({ submitted: false, reason: "upstream_rejected" }),
  });
  const rejectedResponse = recorder();
  await rejected({ method: "POST", headers: { authorization: `Bearer ${secret}` } }, rejectedResponse);
  assert.equal(rejectedResponse.code, 409);
  assert.deepEqual(rejectedResponse.body, { submitted: false, reason: "upstream_rejected" });

  const failed = createIndexNowHandler({
    secret: () => secret,
    submit: async () => { throw new Error("private provider failure"); },
  });
  const failedResponse = recorder();
  await failed({ method: "POST", headers: { authorization: `Bearer ${secret}` } }, failedResponse);
  assert.equal(failedResponse.code, 503);
  assert.deepEqual(failedResponse.body, { submitted: false, reason: "unavailable" });
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseVercelHttpResponse } from "../scripts/runtime-http.mjs";

test("CLI runtime responses distinguish no cookie from a redacted session cookie", async () => {
  const withoutCookie = parseVercelHttpResponse("HTTP/2 200\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}");
  assert.equal(withoutCookie.headers.get("set-cookie"), null);
  assert.equal(withoutCookie.headers.has("set-cookie"), false);
  assert.deepEqual(await withoutCookie.json(), { ok: true });

  const withCookies = parseVercelHttpResponse([
    "HTTP/2 200", "Content-Type: application/json",
    "Set-Cookie: session=sensitive-session-fixture; HttpOnly; Secure",
    "sEt-CoOkIe: refresh=sensitive-refresh-fixture; HttpOnly; Secure",
    "x-vercel-protection-bypass: sensitive-bypass-fixture", "X-Other-Bypass: sensitive-other-fixture",
    "X-Request-Id: req-fixture", "", "{\"ok\":true}",
  ].join("\r\n"));
  assert.equal(withCookies.headers.has("set-cookie"), true);
  assert.notEqual(withCookies.headers.get("set-cookie"), null);
  assert.deepEqual(withCookies.headers.getSetCookie(), ["[redacted]", "[redacted]"]);
  assert.equal(withCookies.headers.get("x-vercel-protection-bypass"), null);
  assert.equal(withCookies.headers.get("x-other-bypass"), null);
  assert.equal(withCookies.headers.get("x-request-id"), "req-fixture");
  assert.doesNotMatch(JSON.stringify([...withCookies.headers]), /sensitive-|session=|refresh=/u);
  assert.deepEqual(await withCookies.json(), { ok: true });
});

test("CLI parsing checks the final response rather than intermediate cookie headers", () => {
  const response = parseVercelHttpResponse([
    "HTTP/1.1 100 Continue", "Set-Cookie: intermediate=sensitive-intermediate-fixture", "",
    "HTTP/2 204", "X-Request-Id: final-response", "", "",
  ].join("\r\n"));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-request-id"), "final-response");
  assert.doesNotMatch(JSON.stringify([...response.headers]), /sensitive-/u);
});

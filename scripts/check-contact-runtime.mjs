import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runtimeFetch } from "./runtime-http.mjs";

const origin = process.env.SAJDA_TEST_ORIGIN;
if (!origin || !/^https:\/\/sajda-[a-z0-9-]+-hypbit\.vercel\.app$|^http:\/\/127\.0\.0\.1:\d+$/u.test(origin)) {
  throw new Error("Select a Sajda preview or loopback QA origin explicitly.");
}
const fixture = { submissionId: randomUUID(), name: "Sajda QA", email: "dev@hypbit.com", subject: "Syntetiskt kontaktprov",
  message: "Detta är ett syntetiskt tekniskt test av Sajdas kontaktformulär. Inget svar behövs.", website: "", locale: "sv" };
const checks = [];
async function check(name, method, status, body, headers = {}, code) {
  const response = await runtimeFetch(`${origin}/api/contact`, { method,
    headers: { origin, "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status, name);
  const result = await response.json();
  assert.equal(result.ok, false, name);
  if (code) assert.equal(result.code, code, name);
  assert.match(response.headers.get("cache-control"), /no-store/u);
  assert.match(result.requestId, /^req_[A-Za-z0-9_-]+$/u);
  checks.push(name);
}
const page = await runtimeFetch(`${origin}/contact`);
assert.equal(page.status, 200, "contact route");
assert.match(page.headers.get("content-type"), /text\/html/u);
checks.push("contact HTML route");
await check("GET rejected", "GET", 405, undefined, {}, "method_not_allowed");
await check("foreign origin rejected", "POST", 403, fixture, { origin: "https://attacker.example" }, "forbidden_origin");
await check("non-JSON rejected", "POST", 415, fixture, { "content-type": "text/plain" }, "unsupported_media_type");
await check("recipient override rejected", "POST", 400, { ...fixture, to: "elsewhere@example.test" }, {}, "invalid_request");
await check("filled honeypot rejected", "POST", 400, { ...fixture, website: "https://spam.example" }, {}, "invalid_request");
await check("oversized message rejected", "POST", 413, { ...fixture, message: "x".repeat(30_000) }, {}, "request_too_large");
if (process.env.SAJDA_CONTACT_EXPECT_UNCONFIGURED === "1") {
  // Explicit opt-in: if configuration changed since inspection this could send
  // exactly one synthetic message to the operator. Never claim inbox delivery.
  await check("missing provider configuration fails honestly", "POST", 503, fixture, {}, "contact_unavailable");
}
console.log(JSON.stringify({ origin, checks, passed: checks.length, realInboxDeliveryVerified: false }, null, 2));

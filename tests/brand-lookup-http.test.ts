import assert from "node:assert/strict";
import test from "node:test";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { BRAND_LOOKUP_MAX_BODY_BYTES, readBrandLookupBody } from "../api/_shared/brand-lookup-http.js";

const input = { operation: "search", query: "IKEA", locale: "en" };
const headers = { "content-type": "application/json" };
test("lookup HTTP parser accepts raw, parsed, buffer, lazy and streamed JSON without changing its fields", async () => {
  const json = JSON.stringify(input);
  for (const body of [input, json, Buffer.from(json)]) assert.deepEqual(await readBrandLookupBody({ headers, body }), input);
  assert.deepEqual(await readBrandLookupBody({ headers, get body() { return input; } }), input);
  const stream = { headers, async *[Symbol.asyncIterator]() { yield json.slice(0, 8); yield json.slice(8); } };
  assert.deepEqual(await readBrandLookupBody(stream), input);
});

test("lookup HTTP parser bounds UTF-8 bodies to exactly 6 KiB and stops oversized streams", async () => {
  const json = JSON.stringify(input);
  const boundary = json + " ".repeat(BRAND_LOOKUP_MAX_BODY_BYTES - Buffer.byteLength(json));
  assert.deepEqual(await readBrandLookupBody({ headers, body: boundary }), input);
  for (const body of [boundary + " ", Buffer.from(boundary + " "), { ...input, query: "界".repeat(2100) }]) {
    await assert.rejects(readBrandLookupBody({ headers, body }), error => error instanceof AccountAccessError && error.status === 413);
  }
  let read = 0;
  const stream = { headers, async *[Symbol.asyncIterator]() {
    read++; yield Buffer.alloc(BRAND_LOOKUP_MAX_BODY_BYTES + 1, " ");
    read++; yield "not read";
  } };
  await assert.rejects(readBrandLookupBody(stream), error => error instanceof AccountAccessError && error.status === 413);
  assert.equal(read, 1);
  await assert.rejects(readBrandLookupBody({ headers: { ...headers, "content-length": "6145" },
    get body(): unknown { assert.fail("Oversized Content-Length must fail before body access"); } }),
  error => error instanceof AccountAccessError && error.status === 413);
});

test("lookup HTTP parse and header failures are safe and contain no body diagnostics", async () => {
  const cases = [{ headers, body: "private invalid JSON" }, { headers, get body(): unknown { throw new Error("private getter diagnostics"); } },
    { headers: { ...headers, "Content-Type": "application/json" }, body: input },
    { headers: { ...headers, "content-length": "invalid" }, body: input }];
  for (const value of cases) await assert.rejects(readBrandLookupBody(value), error => {
    assert.ok(error instanceof AccountAccessError); assert.equal(error.status, 400);
    assert.doesNotMatch(error.message, /private|diagnostic/u); return true;
  });
  await assert.rejects(readBrandLookupBody({ headers: { "content-type": "text/plain" }, body: input }),
    error => error instanceof AccountAccessError && error.status === 415);
});

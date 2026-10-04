import assert from "node:assert/strict";
import test from "node:test";
import { hasRequestQueryParameters, readRequestQuery } from "../api/_shared/request-query.js";

test("canonical request URLs are parsed without invoking Vercel's legacy query getter", () => {
  let reads = 0;
  const request = {
    url: "/api/account/saved-domains?cursor=42&tag=one&tag=two",
    get query(): Record<string, unknown> {
      reads++;
      throw new Error("The legacy query getter must not be evaluated.");
    },
  };
  assert.deepEqual(readRequestQuery(request), { cursor: "42", tag: ["one", "two"] });
  assert.equal(hasRequestQueryParameters(request), true);
  assert.equal(reads, 0);
});

test("plain local query data remains supported while accessors remain inert", () => {
  assert.deepEqual(readRequestQuery({ query: { cursor: "42" } }), { cursor: "42" });
  assert.equal(hasRequestQueryParameters({ query: {} }), false);
  let reads = 0;
  const accessor = Object.defineProperty({}, "query", { get() { reads++; return { unsafe: true }; } });
  assert.deepEqual(readRequestQuery(accessor), {});
  assert.equal(reads, 0);
});

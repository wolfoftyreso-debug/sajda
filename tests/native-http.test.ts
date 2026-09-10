import assert from "node:assert/strict";
import test from "node:test";
import { nativeJson } from "../api/_shared/native-http.js";
import { AccountAccessError } from "../api/_shared/account-error.js";

test("native JSON accepts Vercel's parsed body and classifies its malformed-JSON getter as 400", async () => {
  const headers = { "content-type": "application/json" };
  assert.deepEqual(await nativeJson({ headers, body: { action: "logout" } }), { action: "logout" });
  await assert.rejects(nativeJson({ headers, get body() { throw new SyntaxError("Unexpected end of JSON input"); } }),
    error => error instanceof AccountAccessError && error.status === 400 && error.code === "invalid_request");
});

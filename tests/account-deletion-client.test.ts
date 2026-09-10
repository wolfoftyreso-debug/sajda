import assert from "node:assert/strict";
import test from "node:test";
import { isDeletionCode, newDeletionRequestId, parseDeletionChallenge, parseDeletionReceipt } from "../src/lib/accountDeletion";
import { accountDeletionCopy } from "../src/i18n/accountDeletionCopy";

const id = "ed9926d4-4c18-4ac4-b776-c74ba4bfc7b6", now = Date.now();
const base = { accountId: "owner-a", deletionRequestId: id, requestId: "req_diagnostic_only" };
test("deletion receipts bind account and challenge separately from correlation", () => {
  const challenge = { ...base, status: "confirmation_required", expiresAt: new Date(now + 900_000).toISOString() };
  assert.equal(parseDeletionChallenge(challenge, "owner-a", id, now).deletionRequestId, id);
  const receipt = { ...base, status: "deleted", billing: "canceled" };
  assert.equal(parseDeletionReceipt(receipt, "owner-a", id).status, "deleted");
  for (const value of [null, {}, { ...receipt, accountId: "owner-b" }, { ...receipt, status: "pending" },
    { ...receipt, deletionRequestId: newDeletionRequestId() }, { ...receipt, billing: "unknown" }]) {
    assert.throws(() => parseDeletionReceipt(value, "owner-a", id));
  }
  for (const value of [{ ...challenge, expiresAt: new Date(now - 1).toISOString() },
    { ...challenge, expiresAt: new Date(now + 60 * 60_000).toISOString() }, { ...challenge, accountId: "owner-b" }]) {
    assert.throws(() => parseDeletionChallenge(value, "owner-a", id, now));
  }
});
test("only eight ASCII digits constitute a deletion code and UUIDs use crypto", () => {
  assert.equal(isDeletionCode("01234567"), true);
  for (const value of ["123", "123456789", "１２３４５６７８", "1234 678", "1234567a", "12345678\n"]) assert.equal(isDeletionCode(value), false);
  const ids = Array.from({ length: 50 }, () => newDeletionRequestId());
  assert.equal(new Set(ids).size, 50);
  assert.ok(ids.every(value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
});
test("all five deletion languages include every safety and recovery message", () => {
  const keys = Object.keys(accountDeletionCopy.en).sort();
  for (const copy of Object.values(accountDeletionCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    assert.ok(Object.values(copy).every(value => value.length > 0 && !/undefined|TODO|localhost/.test(value)));
    assert.match(copy.apple, /Apple/);
  }
});

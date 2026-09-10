import assert from "node:assert/strict";
import test from "node:test";
import { PLUS_PLAN, formatPlusMonthlyPrice } from "../shared/plus-plan";

test("the approved Plus plan is one immutable USD 49 monthly contract", () => {
  assert.deepEqual(PLUS_PLAN, {
    id: "sajda-plus", name: "Sajda Trading", currency: "usd",
    unitAmount: 4900, interval: "month", intervalCount: 1,
  });
  assert.ok(Object.isFrozen(PLUS_PLAN));
  assert.equal(Reflect.set(PLUS_PLAN, "unitAmount", 1), false);
  assert.equal(PLUS_PLAN.unitAmount, 4900);
});

test("localized Plus price labels express the same USD amount and period", () => {
  assert.equal(formatPlusMonthlyPrice("sv"), "49 USD / månad");
  assert.equal(formatPlusMonthlyPrice("en"), "USD 49 / month");
  assert.equal(formatPlusMonthlyPrice("unsupported"), "USD 49 / month");
});

import assert from "node:assert/strict";
import test from "node:test";
import { requestDeadline, throwIfCancelled } from "../src/lib/abort";
import { collectAccountPages } from "../src/lib/accountRequestScope";

test("cancellation works on signals without throwIfAborted and preserves explicit reasons", () => {
  assert.doesNotThrow(() => throwIfCancelled());
  assert.doesNotThrow(() => throwIfCancelled(null));
  const controller = new AbortController();
  Object.defineProperty(controller.signal, "throwIfAborted", { value: undefined });
  assert.doesNotThrow(() => throwIfCancelled(controller.signal));
  const reason = new Error("account changed");
  controller.abort(reason);
  assert.throws(() => throwIfCancelled(controller.signal), error => error === reason);
  assert.throws(() => throwIfCancelled({ aborted: true } as AbortSignal), { name: "AbortError" });
  try { throwIfCancelled({ aborted: true, reason: null } as AbortSignal); assert.fail("must throw explicit null"); }
  catch (error) { assert.equal(error, null); }
});

test("deadline fires once without AbortSignal.timeout and owns a disposable timer", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
  try {
    const deadline = requestDeadline(7000);
    let calls = 0;
    deadline.signal.addEventListener("abort", () => { calls++; });
    t.mock.timers.tick(6999);
    assert.equal(deadline.signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(deadline.signal.aborted, true);
    assert.throws(() => throwIfCancelled(deadline.signal), { name: "TimeoutError" });
    deadline.dispose(); deadline.dispose(); deadline.cancel();
    t.mock.timers.tick(7000);
    assert.equal(calls, 1);

    const completed = requestDeadline(20000);
    completed.dispose(); completed.dispose();
    t.mock.timers.tick(20001);
    assert.equal(completed.signal.aborted, false, "success cleanup must not later cancel an unrelated completed operation");
    const cancelled = requestDeadline(20000);
    cancelled.cancel();
    assert.throws(() => throwIfCancelled(cancelled.signal), { name: "AbortError" });
    t.mock.timers.tick(20001);
    assert.equal(cancelled.signal.reason.name, "AbortError");
  } finally {
    if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout); else Reflect.deleteProperty(AbortSignal, "timeout");
  }
});

test("invalid deadlines cannot overflow into immediate or indefinite timers", () => {
  for (const input of [-1, 0.5, NaN, Infinity, 2_147_483_648]) assert.throws(() => requestDeadline(input), RangeError);
});

test("owner-scoped pagination rejects delayed data even on a signal without new methods", async () => {
  const controller = new AbortController();
  Object.defineProperty(controller.signal, "throwIfAborted", { value: undefined });
  let calls = 0;
  await assert.rejects(() => collectAccountPages(async () => {
    calls++; controller.abort(); return { items: ["private-old-account.com"], nextCursor: "100" };
  }, { accountId: "owner-a", signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(() => collectAccountPages(async () => {
    calls++; return { items: [], nextCursor: null };
  }, { accountId: "owner-a", signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});

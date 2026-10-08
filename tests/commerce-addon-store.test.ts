import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCommerceStore, type CommerceLease, type CommercePool } from "../api/_shared/commerce-store";
import type { AddonChange } from "../api/_shared/commerce-addon";
import { CommerceError } from "../api/_shared/commerce-config";

test("add-on persistence pins one transaction client and fences every owner write without granting access", async () => {
  const calls: { sql: string; args: unknown[]; client: number }[] = [];
  let serial = 0, fenced = true, allowSave = true;
  const start = Math.floor(Date.now() / 1000), end = start + 30 * 86400;
  const row = { id: randomUUID(), request_key: randomUUID(), subscription_id: "sub_owned", from_plan: "premium", target_plan: "trading",
    from_price_id: "price_premium", target_price_id: "price_trading", period_start: new Date(start * 1000), effective_at: new Date(end * 1000),
    created_at: new Date(), schedule_id: null as string | null, request_body: null as unknown, state: "creating" };
  const pool: CommercePool = { connect: async () => {
    const client = ++serial;
    return { query: async (sql, args = []) => {
      calls.push({ sql, args, client });
      if (sql.includes("commerce:fence")) return { rows: fenced ? [{ payment_hold: false }] : [] };
      if (sql.includes("commerce:addon-schema")) return { rows: [{ ready: true }] };
      if (sql.includes("SELECT count(*)")) return { rows: [{ n: 0 }] };
      if (sql.includes("commerce:addon-reserve")) return { rows: [row] };
      if (sql.includes("commerce:addon-save")) return { rows: allowSave ? [{ ...row, state: args[3], schedule_id: args[4], request_body: args[5] ? JSON.parse(String(args[5])) : null }] : [] };
      return { rows: [] };
    }, release: () => { calls.push({ sql: "RELEASE CLIENT", args: [], client }); } };
  } };
  const store = createCommerceStore({ namespace: "preview", mode: "test" }, pool);
  const lease = { ownerId: "owner", token: randomUUID(), fence: 4 } as CommerceLease;
  assert.equal(await store.addonAvailable(), true);
  const change = await store.reserveAddonChange(lease, row.request_key, { id: "sub_owned", plan: "premium", priceId: "price_premium", start, end, scheduleId: null, metadata: {} }, "trading", "price_trading");
  assert.equal(change.periodStart, start); assert.equal(change.effectiveAt, end);
  const reserved = calls.find(value => value.sql.includes("commerce:addon-reserve"))!;
  assert.deepEqual(reserved.args.slice(1, 4), ["preview", "owner", row.request_key]);
  const body: NonNullable<AddonChange["body"]> = { phases: [{ start_date: start, end_date: end, items: [{ price: "price_premium", quantity: 1 }] }] };
  const saved = await store.saveAddonChange(lease, change, { scheduleId: "sub_sched_owned", body });
  assert.equal(saved.scheduleId, "sub_sched_owned"); assert.deepEqual(saved.body, body);
  const save = calls.find(value => value.sql.includes("commerce:addon-save"))!;
  assert.deepEqual(save.args.slice(0, 3), ["preview", "owner", change.id]);
  assert.match(save.sql, /AND state=\$7/u); assert.match(save.sql, /request_body=\$6::jsonb/u);
  assert.match(save.sql, /schedule_id=\$5/u); assert.match(save.sql, /COALESCE\(cancel_request_key,\$8::uuid\)/u);
  for (const group of Array.from(new Set(calls.map(value => value.client))).map(client => calls.filter(value => value.client === client))) {
    assert.equal(group[0].sql, "BEGIN"); assert.equal(group.at(-2)!.sql, "COMMIT"); assert.equal(group.at(-1)!.sql, "RELEASE CLIENT");
  }
  const before = calls.length; fenced = false;
  await assert.rejects(() => store.saveAddonChange(lease, saved, { state: "scheduled" }), (error: unknown) => error instanceof CommerceError && error.code === "billing_busy");
  assert.equal(calls.slice(before).some(value => value.sql.includes("commerce:addon-save")), false);
  assert.equal(calls.at(-2)!.sql, "ROLLBACK");
  fenced = true; allowSave = false;
  await assert.rejects(() => store.saveAddonChange(lease, saved, { state: "scheduled" }), (error: unknown) => error instanceof CommerceError && error.code === "addon_change_review_required");
  assert.equal(calls.at(-2)!.sql, "ROLLBACK");
  assert.equal(calls.some(value => /commerce:grant|commerce:revoke/u.test(value.sql)), false);
});

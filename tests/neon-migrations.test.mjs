import assert from "node:assert/strict";
import test from "node:test";
import { pendingMigrations, readMigrations } from "../scripts/migrate-neon.mjs";

test("migration plan is deterministic, checksummed and limited to Neon files", async () => {
  const migrations = await readMigrations();
  assert.ok(migrations.length >= 2);
  assert.ok(migrations.every(row => /^[a-f0-9]{64}$/u.test(row.checksum)));
  assert.equal(new Set(migrations.map(row => row.id)).size, migrations.length);
  assert.deepEqual(pendingMigrations(migrations, []), migrations);
  assert.deepEqual(pendingMigrations(migrations, migrations.map(({ id, checksum }) => ({ id, checksum }))), []);
});

test("migration runner rejects edited, unknown, legacy and out-of-order history", () => {
  const migrations = [{ id: "0000_first.sql", checksum: "a" }, { id: "0001_next.sql", checksum: "b" }];
  assert.throws(() => pendingMigrations(migrations, [{ id: "0000_first.sql", checksum: "edited" }]), /checksum mismatch/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "0000_first.sql", checksum: null }]), /checksum mismatch/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "9000_foreign.sql", checksum: "a" }]), /unknown migration/u);
  assert.throws(() => pendingMigrations(migrations, [{ id: "0001_next.sql", checksum: "b" }]), /Out-of-order/u);
});

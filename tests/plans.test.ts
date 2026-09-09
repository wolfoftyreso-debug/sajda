import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PLANS, PLAN_ORDER, formatPlanMonthlyPrice } from "../shared/plans";
import { PLUS_PLAN, formatPlusMonthlyPrice } from "../shared/plus-plan";

test("four distinct approved tiers have fixed monthly USD prices", () => {
  assert.deepEqual(PLAN_ORDER, ["free", "basic", "premium", "trading"]);
  assert.deepEqual(PLAN_ORDER.map(id => PLANS[id].unitAmount), [0, 900, 2900, 188000]);
  for (const id of PLAN_ORDER) {
    assert.equal(PLANS[id].id, id);
    assert.equal(PLANS[id].currency, "usd");
    assert.equal(PLANS[id].interval, "month");
    assert.equal(PLANS[id].intervalCount, 1);
    assert.ok(Object.isFrozen(PLANS[id]));
    assert.equal(Reflect.set(PLANS[id], "unitAmount", 1), false);
  }
  assert.ok(Object.isFrozen(PLANS));
  assert.ok(Object.isFrozen(PLAN_ORDER));
});

test("displayed prices and legacy Trading commerce use one source of truth", () => {
  assert.equal(formatPlanMonthlyPrice("basic", "sv"), "9 USD / månad");
  assert.equal(formatPlanMonthlyPrice("premium", "en"), "USD 29 / month");
  assert.equal(formatPlanMonthlyPrice("free", "sv"), "0 USD / månad");
  assert.equal(formatPlanMonthlyPrice("trading", "sv"), "1 880 USD / månad");
  assert.equal(formatPlanMonthlyPrice("trading", "en"), formatPlusMonthlyPrice("en"));
  assert.equal(PLUS_PLAN.unitAmount, PLANS.trading.unitAmount);
  assert.equal(PLUS_PLAN.name, "Sajda Trading");
  assert.equal(PLUS_PLAN.id, "sajda-plus", "existing internal billing identity must not be renamed");
  assert.ok(PLANS.basic.unitAmount !== Number(PLUS_PLAN.unitAmount));
  assert.ok(PLANS.premium.unitAmount !== Number(PLUS_PLAN.unitAmount));
});

test("pricing route is reachable, linked and noindex until commercial activation", async () => {
  const root = new URL("../", import.meta.url);
  const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  assert.equal(config.rewrites.find((row: {source: string}) => row.source === "/pricing")?.destination, "/");
  assert.ok(config.headers.find((row: {source: string}) => row.source === "/pricing")?.headers.some((header: {key: string; value: string}) => header.key === "X-Robots-Tag" && /noindex/.test(header.value)));
  assert.match(await readFile(new URL("src/App.tsx", root), "utf8"), /path="\/pricing" element=\{<Pricing \/>\}/);
  assert.match(await readFile(new URL("src/components/SajdaFooter.tsx", root), "utf8"), /to="\/pricing"/);
  assert.match(await readFile(new URL("src/pages/Index.tsx", root), "utf8"), /href="\/pricing"/);
});

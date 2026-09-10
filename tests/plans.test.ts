import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PLANS, PLAN_ORDER, formatPlanMonthlyPrice } from "../shared/plans";
import { PLUS_PLAN, formatPlusMonthlyPrice } from "../shared/plus-plan";

test("four distinct approved tiers have fixed monthly USD prices", () => {
  assert.deepEqual(PLAN_ORDER, ["free", "basic", "premium", "trading"]);
  assert.deepEqual(PLAN_ORDER.map(id => PLANS[id].unitAmount), [0, 900, 1900, 4900]);
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
  assert.equal(formatPlanMonthlyPrice("premium", "en"), "USD 19 / month");
  assert.equal(formatPlanMonthlyPrice("free", "sv"), "0 USD / månad");
  assert.equal(formatPlanMonthlyPrice("trading", "sv"), "49 USD / månad");
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

test("sandbox setup reads the same catalog and versions only its immutable Price", async () => {
  const setup = await readFile(new URL("../scripts/setup-stripe-sandbox.mjs", import.meta.url), "utf8");
  assert.match(setup, /import \{ PLUS_PLAN \} from "\.\.\/shared\/plus-plan\.ts"/);
  assert.match(setup, /unit_amount: PLUS_PLAN\.unitAmount/);
  assert.match(setup, /const catalogKey = `sajda_trading_\$\{PLUS_PLAN\.currency\}_\$\{PLUS_PLAN\.unitAmount\}_cents_monthly_test_v2`/);
  assert.match(setup, /idempotencyKey: `sajda-sandbox-price-\$\{expectedAccount\}-\$\{catalogKey\}`/);
  assert.match(setup, /if \(!price && apply\)/);
  assert.match(setup, /if \(!product && apply\)/);
  assert.match(setup, /if \(!portal && apply\)/);
  assert.doesNotMatch(setup, /188000|188_000|1880_monthly|\.subscriptions\.(?:create|update)|\.prices\.update|\.checkout\./);
});

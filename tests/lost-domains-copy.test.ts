import assert from "node:assert/strict";
import test from "node:test";
import { getLostDomainsCopy } from "../src/i18n/lostDomainsCopy";
import { getPlusBillingCopy } from "../src/i18n/plusBillingCopy";
import { PLUS_PLAN, formatPlusMonthlyPrice } from "../shared/plus-plan";

test("the expert plan is consistently named Trading without changing its internal access key", () => {
  for (const language of ["sv", "en"]) {
    const research = getLostDomainsCopy(language), billing = getPlusBillingCopy(language);
    for (const label of [research.eyebrow, research.contact, research.locked, research.lockedBody,
      research.errors.plus_required, billing.title, billing.checkout]) {
      assert.match(label, /Trading/);
      assert.doesNotMatch(label, /\bPlus\b/);
    }
    assert.ok(Object.hasOwn(research.errors, "plus_required"));
  }
});

test("Plus shows the approved fixed monthly US dollar price independently of checkout readiness", () => {
  const sv = getLostDomainsCopy("sv");
  const en = getLostDomainsCopy("en");
  assert.equal(sv.price, "1 880 USD / månad");
  assert.equal(en.price, "USD 1,880 / month");
  assert.equal(PLUS_PLAN.unitAmount, 188000);
  assert.equal(sv.price, formatPlusMonthlyPrice("sv"));
  assert.equal(en.price, formatPlusMonthlyPrice("en"));
  assert.equal(sv.priceLabel, "Månadspris");
  assert.equal(en.priceLabel, "Monthly price");
  assert.match(sv.priceNote, /amerikanska dollar/);
  assert.match(en.priceNote, /US dollars/);
  assert.match(sv.priceNote, /skatt och slutligt totalbelopp visas innan du bekräftar betalningen/);
  assert.match(en.priceNote, /tax and the final total are shown before you confirm payment/);
  assert.match(sv.lockedBody, /Teståtkomst startar ingen prenumeration/);
  assert.match(en.lockedBody, /Test access does not start a subscription/);
  assert.equal(sv.category, "Professionell domängranskning");
  assert.equal(en.category, "Professional domain research");
  assert.equal(sv.features.length, 4); assert.equal(en.features.length, 4);
  assert.doesNotMatch(JSON.stringify([sv, en]), /prelimin|indicativ|purchase offer|köperbjudande|under utveckling|in development/iu);
  assert.doesNotMatch(sv.price, /kr|SEK/);
  assert.doesNotMatch(en.price, /kr|SEK/);
  assert.equal(getLostDomainsCopy("de").price, en.price);
});

test("billing refresh is described as checking status, not changing the subscription", () => {
  const sv = getPlusBillingCopy("sv"), en = getPlusBillingCopy("en");
  assert.equal(sv.refresh, "Kontrollera betalstatus");
  assert.equal(en.refresh, "Check billing status");
  for (const code of ["unavailable", "invalid_response", "account_changed", "subscription_changed", "checkout_expired"] as const) {
    assert.match(sv.errors[code], /Kontrollera (?:betalstatus|den)/);
    assert.match(sv.errors[code], /betalstatus|betaltjänsten|betalning/);
    assert.match(en.errors[code], /Check billing status/);
  }
  assert.doesNotMatch(JSON.stringify(sv), /[Uu]ppdatera prenumeration/);
  assert.doesNotMatch(JSON.stringify(en), /[Rr]efresh (?:your )?subscription/);
});

test("Trading capacity describes bounded temporal rounds without promising findings",()=>{
  const sv=getLostDomainsCopy("sv"),en=getLostDomainsCopy("en");
  assert.match(sv.limits,/upp till 24 godkända källsidor och 600 namn/u);
  assert.match(sv.limits,/Upp till 30 prioriterade namn/u);
  assert.match(sv.limits,/3 tidsseparerade kontrollomgångar/u);
  assert.match(sv.limits,/72 timmar/u);
  assert.match(sv.limits,/Högst 2 nya körningar per dygn och konto/u);
  assert.match(sv.limits,/Faktisk täckning beror på källor och svar/u);
  assert.match(en.limits,/up to 24 approved source pages and 600 names/u);
  assert.match(en.limits,/Up to 30 priority names/u);
  assert.match(en.limits,/3 review rounds at separate times/u);
  assert.match(en.limits,/72 hours/u);
  assert.match(en.limits,/Each account can start at most 2 new runs per day/u);
  assert.match(en.limits,/Coverage depends on the sources and their responses/u);
  assert.match(en.limits,/No number of findings is guaranteed/u);
});

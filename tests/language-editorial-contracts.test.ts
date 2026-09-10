import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { formatPlanMonthlyPrice, PLANS } from "../shared/plans";
import { accountEmailCopy, emailLanguage } from "../shared/account-email-copy";
import { accountWebHeaders } from "../api/_shared/account-origin";
import { createAccountAuth, createAccountPool } from "../api/_shared/account-server";

const languages = ["en", "sv", "es", "fr", "zh"] as const;

test("monthly plan labels use all five locales without changing USD prices", () => {
  assert.deepEqual(Object.values(PLANS).map(plan => plan.unitAmount), [0, 900, 1900, 4900]);
  const suffixes = { en: "month", sv: "månad", es: "mes", fr: "mois", zh: "月" };
  for (const language of languages) {
    for (const plan of Object.values(PLANS)) {
      const result = formatPlanMonthlyPrice(plan.id, language);
      assert.ok(result.includes("USD"));
      assert.ok(result.endsWith(suffixes[language]));
      assert.equal(result.replace(/\D/g, ""), String(plan.unitAmount / 100));
    }
  }
  assert.equal(formatPlanMonthlyPrice("trading", "unknown"), "USD 49 / month");
});

test("transactional email dictionaries share the English contract and use a bounded locale", () => {
  for (const language of languages) {
    const copy = accountEmailCopy[language];
    assert.deepEqual(Object.keys(copy), Object.keys(accountEmailCopy.en));
    for (const kind of ["verify", "reset"] as const) {
      assert.deepEqual(Object.keys(copy[kind]), Object.keys(accountEmailCopy.en[kind]));
      for (const value of Object.values(copy[kind])) assert.ok(value.trim().length > 0);
    }
    assert.equal(emailLanguage(language), language);
  }
  for (const value of [null, undefined, "de", "SV", [], {}, "__proto__"]) assert.equal(emailLanguage(value), "en");
});

test("all three account email requests carry the current UI language, not a stored automatic default", () => {
  const source = readFileSync(new URL("../src/contexts/AuthContext.tsx", import.meta.url), "utf8");
  assert.match(source, /const \{ language \} = useLanguage\(\)/);
  assert.equal((source.match(/"x-sajda-language": language/g) ?? []).length, 3);
  const server = readFileSync(new URL("../api/_shared/account-server.ts", import.meta.url), "utf8");
  assert.equal((server.match(/language: emailLanguage\(request\?\.headers.get\("x-sajda-language"\)\)/g) ?? []).length, 2);
});

test("auth request header allowlist forwards only supported email locales", () => {
  for (const language of languages) assert.equal(accountWebHeaders({ "x-sajda-language": language }).get("x-sajda-language"), language);
  for (const language of [undefined, ["es", "fr"], "es-MX", "de", "x".repeat(2000), "sv\r\nBcc: x@example.com"]) {
    const headers = accountWebHeaders({ "x-sajda-language": language, authorization: "untrusted", "x-sajda-admin": "true" });
    assert.equal(headers.get("x-sajda-language"), "en");
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("x-sajda-admin"), false);
  }
});

test("installed auth hooks pass the bounded request language with an isolated mock database", async context => {
  const pool = createAccountPool("postgresql://fixture:fixture@127.0.0.1:1/fixture");
  context.mock.method(pool, "connect", async () => ({ query: async () => ({ rows: [], rowCount: 0, fields: [] }), release() {} }));
  const sent: { kind: string; language?: string; to: string; url: string }[] = [];
  try {
    const auth = createAccountAuth({ origin: "https://sajda.example", secret: randomBytes(32).toString("hex"), pool, sendEmail: async message => { sent.push(message); } });
    await auth.$context;
    const user = { id: "fixture", email: "fixture@example.com", name: "Fixture", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
    const data = { user, url: "https://sajda.example/auth?token=fixture-only", token: "fixture-only" };
    for (const language of [...languages, "unsupported"]) {
      const request = new Request("https://sajda.example/api/auth/send-verification-email", { headers: accountWebHeaders({ "x-sajda-language": language }) });
      await auth.options.emailVerification!.sendVerificationEmail!(data, request);
      await auth.options.emailAndPassword!.sendResetPassword!(data, request);
      assert.equal(sent.at(-1)!.language, emailLanguage(language));
      assert.equal(sent.at(-2)!.language, emailLanguage(language));
      assert.equal(sent.at(-1)!.to, user.email);
      assert.equal(sent.at(-1)!.url, data.url);
    }
    assert.equal(sent.length, 12);
    assert.equal(pool.totalCount, 0);
  } finally { await pool.end(); }
});

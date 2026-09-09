// Opt-in live test. Uses the actual deployed handler, with public synthetic
// themes only. No credentials, account mutations, or registrations are created.
// Run: node --import tsx scripts/probe-search-quality.mjs
import assert from "node:assert/strict";
import handler from "../api/domain-search.ts";

const probes = [
  { domains: ["example.com", "example.org", "sajdaqualityprobe9z7x6q.com"], providers: ["loopia"] },
  ...["hav", "bygglov", "coffee", "frisörsalong"].map((theme) => ({ theme, tlds: ["com", "app"], count: 8, locale: "sv", providers: ["cloudflare"] })),
];
for (const [index, body] of probes.entries()) {
  let status;
  let payload;
  const response = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; }, end() {} };
  const start = Date.now();
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `live-quality-${index}` }, body }, response);
  assert.equal(status, 200, JSON.stringify(payload));
  assert.ok(payload.results.every((item) => item.estimatedValue === 0));
  if (index === 0) assert.equal(payload.results.find((item) => item.domain === "example.com")?.status, "taken");
  console.log(JSON.stringify({ probe: body.theme ?? "exact registry control", elapsedMs: Date.now() - start, checked: payload.checked,
    results: payload.results.map((item) => ({ domain: item.domain, status: item.status, authoritative: item.authoritative, namingScore: item.namingScore,
      priceVerified: item.registrarOffer.priceVerified, registrationPriceInclVat: item.registrarOffer.registrationPriceInclVat, error: item.error })) }));
}

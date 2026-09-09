import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { permitLostRegistry, deferLostRegistry, permitLostArchive, deferLostArchive } from "../api/_shared/lost-domains-providers";

test("registry backoff is shared by hostname, parameterized and never reset by a cold local cache", async () => {
  const previous = neonConfig.fetchFunction, url = process.env.DATABASE_URL;
  const requests: { query: string; params: string[] }[] = [];
  process.env.DATABASE_URL = "postgresql://fixture:fixture@ep-fixture.neon.tech/fixture";
  let permit = true;
  neonConfig.fetchFunction = (async (_input: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)); requests.push(payload);
    return new Response(JSON.stringify({ fields: [{ name: "provider", dataTypeID: 25 }], rows: permit ? [["https://rdap.verisign.com"]] : [], rowCount: permit ? 1 : 0 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof neonConfig.fetchFunction;
  try {
    assert.equal(await permitLostRegistry("https://rdap.verisign.com/com/v1/"), true);
    permit = false;
    assert.equal(await permitLostRegistry("https://rdap.verisign.com/net/v1/"), false);
    assert.deepEqual(requests[0].params, requests[1].params);
    assert.match(requests[0].query, /WHERE sajda\.lost_domain_provider_backoff\.blocked_until <= statement_timestamp\(\)/);
    await deferLostRegistry("https://rdap.verisign.com/com/v1/", 1800000000000);
    assert.equal(requests[2].params[1], new Date(1800000000000).toISOString());
    assert.match(requests[2].query, /GREATEST\(sajda\.lost_domain_provider_backoff\.blocked_until, EXCLUDED\.blocked_until\)/);
    const calls = requests.length;
    for (const endpoint of ["http://rdap.verisign.com/com/v1/", "https://127.0.0.1", "https://rdap.verisign.com.evil.com", "https://user:password@rdap.verisign.com/"]) {
      await assert.rejects(permitLostRegistry(endpoint));
    }
    await assert.rejects(deferLostRegistry("https://rdap.verisign.com/com/v1/", NaN));
    assert.equal(requests.length, calls);
  } finally {
    neonConfig.fetchFunction = previous;
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url;
  }
});

test("archive cooldown uses a fixed provider key, durable permit and a monotonic 24-hour backoff", async () => {
  const previous = neonConfig.fetchFunction, url = process.env.DATABASE_URL;
  const requests: { query: string; params: string[] }[] = [];
  process.env.DATABASE_URL = "postgresql://fixture:fixture@ep-fixture.neon.tech/fixture";
  let permit = true;
  const caller = new AbortController();
  neonConfig.fetchFunction = (async (_input: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body))); assert.ok(init?.signal);
    assert.equal(init.signal.aborted, false);
    return new Response(JSON.stringify({ fields: [{ name: "provider", dataTypeID: 25 }],
      rows: permit ? [["https://index.commoncrawl.org"]] : [], rowCount: permit ? 1 : 0 }),
    { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof neonConfig.fetchFunction;
  try {
    assert.equal(await permitLostArchive(caller.signal), true); permit = false;
    assert.equal(await permitLostArchive(caller.signal), false);
    assert.deepEqual(requests[0].params, ["https://index.commoncrawl.org"]);
    assert.deepEqual(requests[0].params, requests[1].params);
    assert.match(requests[0].query, /WHERE sajda\.lost_domain_provider_backoff\.blocked_until <= statement_timestamp\(\)/u);
    const retryAt = Date.now() + 86_400_000;
    await deferLostArchive(retryAt, caller.signal);
    assert.deepEqual(requests[2].params, ["https://index.commoncrawl.org", new Date(retryAt).toISOString()]);
    assert.match(requests[2].query, /statement_timestamp\(\) \+ interval '24 hours'/u);
    assert.match(requests[2].query, /GREATEST\(sajda\.lost_domain_provider_backoff\.blocked_until, EXCLUDED\.blocked_until\)/u);
    for (const invalid of [NaN, Infinity, -1, 8.64e15 + 1]) await assert.rejects(deferLostArchive(invalid));
    await assert.rejects(permitLostRegistry("https://index.commoncrawl.org/"));
    assert.equal(requests.length, 3);
  } finally {
    neonConfig.fetchFunction = previous;
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url;
  }
});

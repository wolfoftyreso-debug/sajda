import assert from "node:assert/strict";
import test from "node:test";
import { parseLostDomainsAction, lostDomainsEnabled } from "../api/_shared/lost-domains-http";

const requestKey = "10000000-0000-4000-8000-000000000001";
const request = (body: unknown) => ({ body, headers: { "content-type": "application/json; charset=utf-8" } });

test("Lost Domains accepts only explicit bounded account actions", () => {
  assert.deepEqual(parseLostDomainsAction(request({ action: "start", requestKey })), { action: "start", requestKey });
  for (const action of ["advance", "cancel"]) assert.deepEqual(parseLostDomainsAction(request({ action, runId: requestKey })), { action, runId: requestKey });
  const refresh={action:"refresh_quote",runId:requestKey,domain:"cloudtools.com",requestKey};
  assert.deepEqual(parseLostDomainsAction(request(refresh)),refresh);
});

test("quote refresh accepts a canonical owned-candidate identifier, never an external URL or provider payload",()=>{
  const base={action:"refresh_quote",runId:requestKey,domain:"cloudtools.com",requestKey};
  for(const change of [{domain:"https://cloudtools.com"},{domain:"CloudTools.com"},{domain:"www.cloudtools.com"},
    {domain:"cloudtools.blogspot.com"},{domain:"cloudtools.com/../create"},{requestKey:"bad"},{runId:"bad"},{ownerId:"other"},
    {price:1},{provider:"different"},{evidence:{availability:"available"}}]) {
    assert.throws(()=>parseLostDomainsAction(request({...base,...change})),{code:"invalid_request"});
  }
});

test("Lost Domains rejects URLs, client evidence, fake plans, malformed ids and unknown fields", () => {
  for (const body of [null, [], "{", { action: "start" }, { action: "start", requestKey: "not-an-id" },
    { action: "start", requestKey, ownerId: "other" }, { action: "start", url: "https://127.0.0.1" },
    { action: "advance", runId: requestKey, qualified: true }, { action: "grant", plan: "plus" }]) {
    assert.throws(() => parseLostDomainsAction(request(body)), { code: "invalid_request" });
  }
  assert.throws(() => parseLostDomainsAction(request("x".repeat(1025))), { code: "request_too_large" });
  assert.throws(() => parseLostDomainsAction({ body: {}, headers: { "content-type": "text/plain" } }), { code: "unsupported_media_type" });
});

test("Lost Domains kill switch is exact and off by default", () => {
  const previous = process.env.SAJDA_LOST_DOMAINS_ENABLED;
  try {
    for (const value of [undefined, "false", "1", "TRUE", " true "]) {
      if (value === undefined) delete process.env.SAJDA_LOST_DOMAINS_ENABLED;
      else process.env.SAJDA_LOST_DOMAINS_ENABLED = value;
      assert.equal(lostDomainsEnabled(), false);
    }
    process.env.SAJDA_LOST_DOMAINS_ENABLED = "true";
    assert.equal(lostDomainsEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.SAJDA_LOST_DOMAINS_ENABLED;
    else process.env.SAJDA_LOST_DOMAINS_ENABLED = previous;
  }
});

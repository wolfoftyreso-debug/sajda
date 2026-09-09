import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { TRADING_CAPACITY } from "../shared/trading-capacity.js";
import { parseLostDomainsAction } from "../api/_shared/lost-domains-http.js";

test("Trading capacity has room for every selected source and bounded retry work", () => {
  assert.equal(Object.isFrozen(TRADING_CAPACITY), true);
  assert.equal(TRADING_CAPACITY.sourceLimit, 24);
  assert.equal(TRADING_CAPACITY.candidateLimit, 600);
  assert.equal(TRADING_CAPACITY.candidatesPerSource, 25);
  assert.equal(TRADING_CAPACITY.sourceLimit * TRADING_CAPACITY.candidatesPerSource, TRADING_CAPACITY.candidateLimit);
  assert.ok(TRADING_CAPACITY.attemptsPerRun > TRADING_CAPACITY.sourceLimit + TRADING_CAPACITY.candidateLimit);
  assert.equal(TRADING_CAPACITY.attemptsPerRun, 900);
  assert.equal(TRADING_CAPACITY.runLifetimeSeconds, 259200);
  assert.equal(TRADING_CAPACITY.verificationMaxRounds, 3);
  assert.deepEqual(TRADING_CAPACITY.verificationGapSeconds, [1200,7200,43200]);
  assert.equal(Object.isFrozen(TRADING_CAPACITY.verificationGapSeconds), true);
  assert.ok(TRADING_CAPACITY.verificationGapSeconds.reduce((sum,gap)=>sum+gap,0)<TRADING_CAPACITY.runLifetimeSeconds);
  assert.ok(TRADING_CAPACITY.sourceLimit+TRADING_CAPACITY.candidateLimit+TRADING_CAPACITY.reportLimit*TRADING_CAPACITY.verificationMaxRounds<TRADING_CAPACITY.attemptsPerRun);
  assert.equal(TRADING_CAPACITY.reportLimit, 30);
});

test("client flags cannot expand capacity or choose a different server run profile", () => {
  const base = { action: "start", requestKey: "10000000-0000-4000-8000-000000000001" };
  for (const override of [{ sourceLimit: 1000 }, { candidateLimit: 100000 }, { attemptsPerRun: 100000 },
    { candidatesPerSource: 1000 }, { runLifetimeSeconds: 8640000 }, {verificationMaxRounds:100}, {verificationGapSeconds:[0]},
    { profile: "unlimited" }, { capacity: TRADING_CAPACITY }]) {
    assert.throws(() => parseLostDomainsAction({ body: { ...base, ...override }, headers: { "content-type": "application/json" } }), { code: "invalid_request" });
  }
});

test("temporal migration preserves old run behavior and immutable assessments while bounding every new round", async () => {
  const sql=await readFile(new URL("../db/migrations/0011_trading_temporal_confirmation.sql",import.meta.url),"utf8");
  assert.match(sql,/run_lifetime_seconds BETWEEN 3600 AND 259200/u);
  assert.match(sql,/verification_max_rounds smallint NOT NULL DEFAULT 1 CHECK \(verification_max_rounds IN \(1,3\)\)/u);
  assert.match(sql,/verification_gap_seconds integer\[\] NOT NULL DEFAULT ARRAY\[0\]/u);
  assert.match(sql,/UPDATE sajda.lost_domain_runs SET verification_round=1 WHERE verification_queued/u);
  assert.match(sql,/UPDATE sajda.lost_domain_work_items SET verification_round=1 WHERE verification/u);
  assert.match(sql,/verification_round<=verification_max_rounds/u);
  assert.match(sql,/verification_max_rounds=3 AND verification_gap_seconds=ARRAY\[1200,7200,43200\]/u);
  assert.match(sql,/verification=\(verification_round>0\)/u);
  assert.match(sql,/ON sajda.lost_domain_attempts\(namespace,run_id,owner_id\)/u);
  assert.doesNotMatch(sql,/UPDATE\s+sajda\.lost_domain_assessments|DELETE\s+FROM|DROP\s+TABLE|DROP\s+TRIGGER|TRUNCATE|GRANT\s+/iu);
  assert.doesNotMatch(sql,/UPDATE\s+sajda\.lost_domain_runs SET[^;]*run_lifetime_seconds/iu);
  assert.doesNotMatch(sql,/\b(?:lost_domain_sources|lost_domain_access|lost_domain_effective_access|cron\.schedule)\b/iu);
});

test("capacity migration preserves old run limits and does not activate sources, accounts or scheduling", async () => {
  const sql = await readFile(new URL("../db/migrations/0010_trading_research_capacity.sql", import.meta.url), "utf8");
  assert.match(sql, /source_limit BETWEEN 1 AND 24/u);
  assert.match(sql, /candidate_limit BETWEEN 1 AND 600/u);
  assert.match(sql, /attempt_limit BETWEEN 1 AND 900/u);
  assert.match(sql, /candidates_per_source integer NOT NULL DEFAULT 20 CHECK \(candidates_per_source BETWEEN 1 AND 60\)/u);
  assert.match(sql, /run_lifetime_seconds integer NOT NULL DEFAULT 21600 CHECK \(run_lifetime_seconds BETWEEN 3600 AND 86400\)/u);
  assert.match(sql, /verification_queued boolean NOT NULL DEFAULT true/u);
  assert.match(sql, /verification boolean NOT NULL DEFAULT false/u);
  assert.match(sql, /DROP CONSTRAINT lost_domain_assessments_run_id_domain_key/u);
  assert.match(sql, /ON sajda.lost_domain_assessments\(owner_id,run_id,domain,observed_at DESC\)/u);
  assert.doesNotMatch(sql, /DROP CONSTRAINT lost_domain_assessments_work_id_key|DROP TRIGGER/iu);
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+sajda\.|DELETE\s+FROM|DROP\s+TABLE|TRUNCATE|GRANT\s+)\b/iu);
  assert.doesNotMatch(sql, /ALTER\s+COLUMN\s+(?:source_limit|candidate_limit|attempt_limit)\s+SET\s+DEFAULT/iu);
  assert.doesNotMatch(sql, /\b(?:lost_domain_sources|lost_domain_access|lost_domain_effective_access|cron\.schedule)\b/iu);
});

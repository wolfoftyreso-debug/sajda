import assert from "node:assert/strict";
import test from "node:test";
import { boundedTradingReport } from "../api/_shared/lost-domains-service.js";
import type { Assessment } from "../api/_shared/lost-domains-engine.js";

test("report transport preserves ranked order and explicitly reports a UTF-8 byte-limited subset",()=>{
  const rows=Array.from({length:600},(_,index)=>({domain:`name${index}.com`,anchor:"å".repeat(12000)} as Assessment));
  const result=boundedTradingReport(rows);
  assert.ok(Buffer.byteLength(JSON.stringify(result.candidates),"utf8")<=2_800_000);
  assert.ok(result.candidates.length>0 && result.candidates.length<600);
  assert.equal(result.candidatesOmitted,600-result.candidates.length);
  assert.deepEqual(result.candidates,rows.slice(0,result.candidates.length));
  assert.equal(rows.length,600);
});

test("normal 600-name report is complete and an empty report stays empty",()=>{
  const rows=Array.from({length:600},(_,index)=>({domain:`name${index}.com`} as Assessment));
  assert.deepEqual(boundedTradingReport(rows),{candidates:rows,candidatesOmitted:0});
  assert.deepEqual(boundedTradingReport([]),{candidates:[],candidatesOmitted:0});
});

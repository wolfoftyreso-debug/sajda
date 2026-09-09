import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createLostDomainsStore,type LostStorePool,type LostAssessment,type LostSource} from "../api/_shared/lost-domains-store.js";

const at="2026-09-09T18:00:00.000Z",owner="research-owner",runId=randomUUID();
const source:LostSource={id:randomUUID(),name:"Reviewed fixture",url:"https://catalog.org/projects",host:"catalog.org",
  robotsUrl:"https://catalog.org/robots.txt",policyReviewedAt:at,policyExpiresAt:"2026-09-30T00:00:00.000Z"};
function item(domain:string):LostAssessment {
  return {domain,sourceUrl:source.url,targetUrl:`https://${domain}/`,anchor:"Independent fixture",sensitive:false,
    registryStatus:"registry_not_found",registrability:"unverified",confirmedRegistrable:false,
    risk:{level:"review",reasons:[]},reviewStatus:"review_candidate",potentialScore:40,confidenceScore:50,
    evidence:[{kind:"registry",source:`https://rdap.verisign.com/com/v1/domain/${domain}`,method:"rdap",
      outcome:"registry_not_found",observedAt:at,expiresAt:"2026-09-09T18:15:00.000Z",details:{httpStatus:404}}]};
}
function fixture(count=1,changed=false,newer=false) {
  const calls:{sql:string;params:unknown[]}[]=[],items=Array.from({length:count},(_,i)=>item(`candidate${i}.com`));
  const pool:LostStorePool={connect:async()=>({release(){},query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes("/* lost:access */"))return{rows:[{allowed:true,expires_at:source.policyExpiresAt,daily_refresh:false}]};
    if(sql.includes("/* lost:sources */"))return{rows:[{id:source.id,name:source.name,url:changed?"https://catalog.org/new":source.url,
      host:source.host,robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}]};
    if(sql.includes("/* lost:runs */")) {
      const report={id:runId,status:"succeeded",created_at:at,updated_at:at,finished_at:at,
        total_work:count+1,completed_work:count+1,failed_work:0,assessment_count:count,source_count:1,candidate_count:count,completed_count:count,failed_count:0};
      return{rows:newer && params[3]!==true?[{...report,id:"10000000-0000-4000-8000-000000000008",status:"cancelled",
        created_at:"2026-09-09T18:02:00.000Z",updated_at:"2026-09-09T18:03:00.000Z",finished_at:"2026-09-09T18:03:00.000Z"},report]:[report]};
    }
    if(sql.includes("/* lost:report */"))return{rows:items.map(assessment=>({assessment,source_id:source.id,source_snapshot:source}))};
    if(sql.includes("/* lost:superseded-observations */"))return{rows:newer?[{domain:items[0].domain},{domain:items[0].domain},{domain:"foreign.com"}]:[]};
    if(sql.includes("/* lost:research-observations */"))return{rows:[
      ...Array.from({length:6},()=>({domain:items[0].domain,observed_at:at,registry_status:"registry_not_found",
        source_url:source.url,target_url:items[0].targetUrl,evidence:items[0].evidence})),
      {domain:"foreign.com",observed_at:at,registry_status:"registry_not_found",evidence:items[0].evidence},
    ]};
    return{rows:[]};
  }})};
  return{store:createLostDomainsStore({pool,environment:()=>({VERCEL:"1",VERCEL_ENV:"preview"})}),calls,items};
}

test("deep storage history is bounded and scoped to namespace, owner, exact domain and report cutoff",async()=>{
  const f=fixture(80),dashboard=await f.store.getDashboard(owner),query=f.calls.find(row=>row.sql.includes("/* lost:research-observations */"))!;
  assert.deepEqual(query.params.slice(0,2),["preview",owner]);
  assert.equal((query.params[2] as string[]).length,60);
  assert.equal(query.params[3],at);
  assert.match(query.sql,/r.namespace=\$1 AND a.owner_id=\$2 AND a.domain=domains.domain/u);
  assert.match(query.sql,/interval '72 hours'/u);
  assert.match(query.sql,/a.observed_at<=\$4::timestamptz/u);
  assert.match(query.sql,/LIMIT 4/u);
  assert.equal(dashboard.researchObservations![f.items[0].domain].length,4);
  assert.equal(dashboard.researchObservations!["foreign.com"],undefined);
  assert.deepEqual(dashboard.researchObservations![f.items[0].domain][0].evidence,f.items[0].evidence);
  assert.equal(dashboard.researchObservations![f.items[0].domain][0].observedAt,at);
  assert.equal(f.items[0].observationHistory,undefined);
});

test("same source hostname is insufficient when approved source identity or URL changes",async()=>{
  const current=fixture(),changed=fixture(1,true);
  assert.equal((await current.store.getDashboard(owner)).sourceApprovals![current.items[0].domain],true);
  assert.equal((await changed.store.getDashboard(owner)).sourceApprovals![changed.items[0].domain],false);
  const report=current.calls.find(row=>row.sql.includes("/* lost:report */"))!;
  assert.match(report.sql,/w.verification_round DESC/);
});

test("a newer observation from a cancelled run suppresses readiness without replacing the prior report",async()=>{
  const f=fixture(80,false,true),dashboard=await f.store.getDashboard(owner);
  assert.equal(dashboard.runs[0].status,"cancelled");assert.equal(dashboard.latestReport!.run.id,runId);
  assert.deepEqual(dashboard.latestReport!.assessments.map(row=>row.evidence),f.items.map(row=>row.evidence));
  assert.deepEqual(dashboard.supersededDomains,[f.items[0].domain]);
  const query=f.calls.find(row=>row.sql.includes("/* lost:superseded-observations */"))!;
  assert.deepEqual(query.params.slice(0,2),["preview",owner]);assert.equal(query.params[3],at);
  assert.equal((query.params[2] as string[]).length,60);
  assert.match(query.sql,/r.id=a.run_id AND r.owner_id=a.owner_id/u);
  assert.match(query.sql,/r.namespace=\$1 AND a.owner_id=\$2 AND a.domain=ANY\(\$3::text\[\]\)/u);
  assert.match(query.sql,/a.observed_at>\$4::timestamptz AND a.observed_at<=statement_timestamp\(\)/u);
  assert.match(query.sql,/SELECT DISTINCT a.domain/u);assert.match(query.sql,/LIMIT 60/u);
  assert.doesNotMatch(query.sql,/r.status|registryStatus/u,"Any newer observation from active/failed/cancelled runs suppresses historical readiness");
  const history=f.calls.find(row=>row.sql.includes("/* lost:research-observations */"))!;
  assert.equal(history.params[3],at,"Historical report evidence is not rewritten into a newer report");
});

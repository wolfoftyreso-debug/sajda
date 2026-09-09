import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createLostDomainsStore, type LostAssessment, type LostSource, type LostStorePool, type lostDomainsStore } from "../api/_shared/lost-domains-store";
import { createLostDomainsService } from "../api/_shared/lost-domains-service";
import { createLostDomainsHandler } from "../api/account/lost-domains";
import { parsePorkbunDomainCheck } from "../api/_shared/lost-domains-registrar";
import type { TradingRegistrarEvidence } from "../shared/trading-registrar";

const owner="quote-owner",runId=randomUUID(),assessmentId=randomUUID(),now=Date.now();
const source:LostSource={id:randomUUID(),name:"Reviewed source",url:"https://source.example.com/resources",host:"source.example.com",
  robotsUrl:"https://source.example.com/robots.txt",policyReviewedAt:new Date(now-86400000).toISOString(),policyExpiresAt:new Date(now+86400000).toISOString()};
const candidate={domain:"cloudtools.com",sourceUrl:source.url,targetUrl:"https://cloudtools.com/",anchor:"Tools",sensitive:false};
const assessment:LostAssessment={...candidate,registryStatus:"registry_not_found",registrability:"unverified",confirmedRegistrable:false,
  reviewStatus:"review_candidate",risk:{level:"review",reasons:[]},potentialScore:70,confidenceScore:50,
  evidence:[{kind:"registry",source:"https://rdap.verisign.com/com/v1/",method:"rdap",outcome:"registry_not_found",
    observedAt:new Date(now-86400000).toISOString(),expiresAt:new Date(now-86400000+900000).toISOString()}]};
function exact(at=Date.now()):TradingRegistrarEvidence {
  return parsePorkbunDomainCheck(candidate.domain,{status:"SUCCESS",response:{avail:"yes",type:"registration",price:"9.73",firstYearPromo:"no",minDuration:1}},at)!;
}
function harness() {
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const state={allowed:true,source:true,target:true,contradiction:false,daily:0,pending:false,cooling:false,
    sensitive:false,excluded:false,completedAtExpiry:false,commitFailure:false,
    request:null as Record<string,unknown>|null,observations:[] as TradingRegistrarEvidence[]};
  const pool:LostStorePool={connect:async()=>({release(){},query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes("lost:access")) return {rows:[{allowed:state.allowed&&params[0]===owner,expires_at:new Date(now+86400000),daily_refresh:false}]};
    if(sql.includes("lost:sources")) return {rows:state.source?[{id:source.id,name:source.name,url:source.url,host:source.host,robots_url:source.robotsUrl,
      policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}]:[]};
    if(sql.includes("lost:quote-candidate")) return {rows:state.target&&params[1]===owner&&params[2]===runId&&params[3]===candidate.domain
      ?[{assessment_id:assessmentId,observed_at:new Date(now-86400000),source_id:source.id,source_snapshot:source,
        candidate:{...candidate,sensitive:state.sensitive},assessment:{...assessment,sensitive:state.sensitive,
          ...(state.excluded||state.sensitive?{reviewStatus:"excluded",risk:{level:"excluded",reasons:[]}}:{})}}]:[]};
    if(sql.includes("lost:quote-contradictions")) return {rows:state.contradiction?[{present:1}]:[]};
    if(sql.includes("lost:quote-idempotency")) return {rows:state.request?.request_key===params[2]?[state.request]:[]};
    if(sql.includes("lost:quote-budget")) return {rows:[{daily_count:state.daily,pending:state.pending,cooling:state.cooling}]};
    if(sql.includes("lost:quote-start")) {
      state.request={id:params[0],namespace:params[1],owner_id:params[2],run_id:params[3],assessment_id:params[4],domain:params[5],request_key:params[6],
        lease_token:params[7],status:"pending",live:true,requested_at:new Date(),server_now:new Date(),lease_until:new Date(Date.now()+20000)};
      return {rows:[state.request]};
    }
    if(sql.includes("lost:quote-owned")) return {rows:state.request&&state.request.id===params[2]&&state.request.owner_id===params[1]
      ?[{...state.request,server_now:new Date()}]:[]};
    if(sql.includes("lost:quote-finish")) {
      state.request!.status=state.completedAtExpiry?"failed":params[3];
      state.request!.failure_code=state.completedAtExpiry?"quote_request_expired":params[4];
      return {rows:[state.request!]};
    }
    if(sql.includes("lost:quote-observation")) state.observations.push(JSON.parse(String(params[4])));
    if(sql==="COMMIT" && state.commitFailure) throw new Error("private database error");
    return {rows:[]};
  }})};
  const store=createLostDomainsStore({pool,environment:()=>({VERCEL:"1",VERCEL_ENV:"preview"})});
  return {store,state,calls};
}

test("owned quote refresh reserves durable quota before provider work without restarting research",async()=>{
  const f=harness(),key=randomUUID(),request=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,key);
  assert.equal(request.reused,false);assert.ok(request.lease);assert.equal(request.lease.domain,candidate.domain);
  assert.equal(request.lease.assessmentId,assessmentId);
  assert.ok(f.calls.some(call=>call.sql.includes("pg_advisory_xact_lock")));
  const budget=f.calls.find(call=>call.sql.includes("lost:quote-budget"))!;
  assert.deepEqual(budget.params,["preview",owner,candidate.domain]);
  assert.match(budget.sql,/interval '24 hours'/);assert.match(budget.sql,/interval '60 seconds'/);
  const target=f.calls.find(call=>call.sql.includes("lost:quote-candidate"))!;
  assert.deepEqual(target.params,["preview",owner,runId,candidate.domain,null]);
  assert.match(target.sql,/r\.status IN \('succeeded','partial'\)/);
  assert.equal(f.calls.some(call=>call.sql.includes("lost:new-run")),false);
  const repeated=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,key);
  assert.deepEqual(repeated,{reused:true,lease:null});
  assert.equal(f.calls.filter(call=>call.sql.includes("lost:quote-start")).length,1);
});

test("foreign targets, source changes, sensitive candidates and newer contradictions never reserve provider work",async()=>{
  for(const flag of ["allowed","source","target","sensitive","excluded","contradiction"] as const) {
    const f=harness();f.state[flag]=["sensitive","excluded","contradiction"].includes(flag);
    await assert.rejects(()=>f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID()),error=>
      error instanceof Error && ["plus_required","quote_candidate_unavailable"].includes(error.message));
    assert.equal(f.calls.some(call=>call.sql.includes("lost:quote-start")),false,flag);
  }
  const f=harness();
  await assert.rejects(()=>f.store.beginQuoteRefresh(owner,randomUUID(),candidate.domain,randomUUID()),{code:"quote_candidate_unavailable"});
  await assert.rejects(()=>f.store.beginQuoteRefresh(owner,runId,"https://cloudtools.com",randomUUID()),{code:"invalid_candidate"});
  const guard=f.calls.find(call=>call.sql.includes("lost:quote-candidate"))!;
  assert.match(guard.sql,/r\.namespace=\$1 AND a\.owner_id=\$2/);
});

test("owner quota, concurrency and per-domain cooldown cannot be reset with new UUIDs",async()=>{
  for(const [field,value,code] of [["daily",60,"quote_daily_limit"],["pending",true,"quote_in_progress"],["cooling",true,"quote_cooldown"]] as const) {
    const f=harness();Object.assign(f.state,{[field]:value});
    await assert.rejects(()=>f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID()),{code});
    assert.equal(f.calls.some(call=>call.sql.includes("lost:quote-start")),false);
  }
  const f=harness(),key=randomUUID();await f.store.beginQuoteRefresh(owner,runId,candidate.domain,key);
  await assert.rejects(()=>f.store.beginQuoteRefresh(owner,randomUUID(),candidate.domain,key),{code:"quote_request_conflict"});
  f.state.request!.status="failed";
  assert.deepEqual(await f.store.beginQuoteRefresh(owner,runId,candidate.domain,key),{reused:true,lease:null});
});

test("quote observations append independently and replayed completion cannot rewrite original technical evidence",async()=>{
  const f=harness(),before=JSON.stringify(assessment),started=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID()),quote=exact();
  assert.deepEqual(await f.store.finishQuoteRefresh(started.lease!,quote),{applied:true});
  assert.equal(f.state.request!.status,"succeeded");assert.deepEqual(f.state.observations,[quote]);
  assert.deepEqual(await f.store.finishQuoteRefresh(started.lease!,quote),{applied:false});
  assert.equal(f.state.observations.length,1);assert.equal(JSON.stringify(assessment),before);
  assert.equal(f.calls.some(call=>/UPDATE sajda\.lost_domain_assessments/u.test(call.sql)),false);
  const written=f.calls.find(call=>call.sql.includes("lost:quote-observation"))!;
  assert.deepEqual(written.params.slice(0,4),[started.lease!.id,"preview",owner,candidate.domain]);
});

test("revocation, safety change or expiry during provider request discards its returned price",async()=>{
  for(const reason of ["revoke","source","contradiction","expired","commit_expired"] as const) {
    const f=harness(),started=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID());
    if(reason==="revoke")f.state.allowed=false;if(reason==="source")f.state.source=false;
    if(reason==="contradiction")f.state.contradiction=true;if(reason==="expired")f.state.request!.live=false;
    if(reason==="commit_expired")f.state.completedAtExpiry=true;
    assert.deepEqual(await f.store.finishQuoteRefresh(started.lease!,exact()),{applied:true});
    assert.equal(f.state.request!.status,"failed",reason);assert.deepEqual(f.state.observations,[],reason);
  }
});

test("forged completion identity, changed domains and preexisting/future quotes cannot enter storage",async()=>{
  const f=harness(),started=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID()),lease=started.lease!;
  assert.deepEqual(await f.store.finishQuoteRefresh({...lease,ownerId:"someone-else"},exact()),{applied:false});
  await assert.rejects(()=>f.store.finishQuoteRefresh({...lease,token:randomUUID()},exact()),{code:"quote_request_conflict"});
  await assert.rejects(()=>f.store.finishQuoteRefresh(lease,{...exact(),domain:"other.com"}),{code:"invalid_evidence"});
  for(const at of [Date.now()-60000,Date.now()+60000]) await assert.rejects(()=>f.store.finishQuoteRefresh(lease,exact(at)),{code:"invalid_evidence"});
  assert.deepEqual(f.state.observations,[]);
});

test("optional provider failure records a failed attempt rather than a successful empty quote",async()=>{
  const f=harness(),started=await f.store.beginQuoteRefresh(owner,runId,candidate.domain,randomUUID());
  await f.store.finishQuoteRefresh(started.lease!,null,"provider_unavailable");
  assert.equal(f.state.request!.status,"failed");assert.equal(f.state.request!.failure_code,"provider_unavailable");
  assert.deepEqual(f.state.observations,[]);
});

test("service exact refresh invokes no discovery/RDAP and never repeats after uncertain completion",async()=>{
  const f=harness(),key=randomUUID();let providerCalls=0;
  const service=createLostDomainsService({store:f.store,registrarEnabled:()=>true,registrar:async(domain,options)=>{
    providerCalls++;assert.equal(domain,candidate.domain);assert.ok(options?.signal);return exact();
  },engine:{discoverSource:async()=>{throw new Error("must not discover");},inspectCandidate:async()=>{throw new Error("must not inspect");}}});
  assert.equal(await service.refreshQuote(owner,runId,candidate.domain,key),true);
  assert.equal(await service.refreshQuote(owner,runId,candidate.domain,key),false);
  assert.equal(providerCalls,1);
  const failed=harness(),otherKey=randomUUID();let attempts=0;
  const uncertain=createLostDomainsService({store:failed.store,registrarEnabled:()=>true,registrar:async()=>{
    attempts++;failed.state.commitFailure=true;return exact();
  }});
  await assert.rejects(()=>uncertain.refreshQuote(owner,runId,candidate.domain,otherKey),{code:"lost_domains_unavailable"});
  failed.state.commitFailure=false;
  assert.equal(await uncertain.refreshQuote(owner,runId,candidate.domain,otherKey),false);
  assert.equal(attempts,1);
});

test("disabled exact provider does not consume quota; thrown provider error cannot expose secrets",async()=>{
  const disabled=harness();
  await assert.rejects(()=>createLostDomainsService({store:disabled.store,registrarEnabled:()=>false}).refreshQuote(owner,runId,candidate.domain,randomUUID()),{code:"quote_unavailable"});
  assert.equal(disabled.calls.length,0);
  const f=harness();await createLostDomainsService({store:f.store,registrarEnabled:()=>true,registrar:async()=>{throw new Error("private-provider-secret");}})
    .refreshQuote(owner,runId,candidate.domain,randomUUID());
  assert.equal(f.state.request!.failure_code,"provider_unavailable");assert.doesNotMatch(JSON.stringify(f.state.request),/private-provider-secret/);
});

test("read overlays latest owned exact price but preserves all original technical timestamps",async()=>{
  const quote=exact(),requestedAt=new Date().toISOString(),original=JSON.stringify(assessment);
  const store={getDashboard:async()=>({access:{allowed:true},sources:[],runs:[],activeRun:null,sourceApprovals:{[candidate.domain]:true},
    latestReport:{run:{id:runId,status:"succeeded",createdAt:assessment.evidence[0].observedAt,updatedAt:assessment.evidence[0].observedAt},assessments:[assessment]},
    quoteUpdates:{[candidate.domain]:{status:"failed",requestedAt,failureCode:"rate_limited",evidence:quote},"foreign.com":{status:"succeeded",requestedAt,evidence:quote}}})} as unknown as typeof lostDomainsStore;
  const snapshot=await createLostDomainsService({store,registrarEnabled:()=>true,registrar:async()=>quote}).read(owner);
  assert.deepEqual(Object.keys(snapshot.quoteUpdates!),[candidate.domain]);
  assert.equal(snapshot.quoteUpdates![candidate.domain].status,"failed");
  assert.deepEqual(snapshot.candidates[0].registrar,quote);
  assert.equal(snapshot.candidates[0].evidence[0].observedAt,assessment.evidence[0].observedAt);
  assert.notEqual(snapshot.candidates[0].dossier?.status,"ready_for_price_review");
  assert.equal(snapshot.candidates[0].acquisition?.priceSignal,"none");
  assert.equal(JSON.stringify(assessment),original);
});

test("HTTP action uses verified owner and exact parser contract, including main kill switch",async()=>{
  const f=harness();let invoked=false;
  const service=createLostDomainsService({store:f.store});
  service.refreshQuote=async(id,run,domain,key)=>{assert.equal(id,owner);assert.equal(run,runId);assert.equal(domain,candidate.domain);assert.equal(typeof key,"string");invoked=true;return true;};
  service.read=async()=>({access:true,sourcesAvailable:0,activeRun:null,latestRun:null,latestAttempt:null,candidates:[],quoteRefreshEnabled:true});
  const request={method:"POST",headers:{"content-type":"application/json"},body:{action:"refresh_quote",runId,domain:candidate.domain,requestKey:randomUUID()}};
  const response=()=>({code:0,body:undefined as unknown,setHeader(){},status(code:number){this.code=code;return this;},json(value:unknown){this.body=value;}});
  const handler=createLostDomainsHandler({service,enabled:()=>true,limit:async()=>{},authorize:async(_headers,options)=>{
    assert.equal(options?.verifiedEmail,true);assert.equal(options?.method,"POST");return {id:owner,emailVerified:true};
  }});
  const passed=response();await handler(request,passed);assert.equal(passed.code,200);assert.equal(invoked,true);
  invoked=false;const stopped=response();await createLostDomainsHandler({service,enabled:()=>false,limit:async()=>{},authorize:async()=>({id:owner,emailVerified:true})})(request,stopped);
  assert.equal(stopped.code,503);assert.equal(invoked,false);
});

test("quote migration is additive, tenant-bound and keeps observations immutable",async()=>{
  const sql=await readFile(new URL("../db/migrations/0012_lost_domains_quote_refresh.sql",import.meta.url),"utf8");
  assert.match(sql,/UNIQUE\(namespace,owner_id,request_key\)/);assert.match(sql,/FOREIGN KEY\(namespace,owner_id,run_id\)/);
  assert.match(sql,/FOREIGN KEY\(owner_id,run_id,assessment_id\)/);assert.match(sql,/CREATE UNIQUE INDEX lost_domain_quote_one_pending_owner_idx/);
  assert.match(sql,/BEFORE UPDATE ON sajda\.lost_domain_quote_observations/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL/);assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|UPDATE sajda\.lost_domain_assessments/);
});

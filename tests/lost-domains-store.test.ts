import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createLostDomainsStore,LostDomainsStoreError,LOST_DOMAIN_LIMITS,validateLostCandidate,validateLostAssessment,
  type LostSource,type LostCandidate,type LostAssessment,type LostStorePool} from '../api/_shared/lost-domains-store.js';

const source:LostSource={id:randomUUID(),name:'Reviewed fixture',url:'https://example.org/links',host:'example.org',
  robotsUrl:'https://example.org/robots.txt',policyReviewedAt:'2026-09-09T00:00:00Z',policyExpiresAt:'2026-09-10T00:00:00Z'};
const candidate:LostCandidate={domain:'example.net',sourceUrl:source.url,targetUrl:'https://docs.example.net/help',anchor:'Example',sensitive:false};
const assessment:LostAssessment={...candidate,registryStatus:'registry_not_found',registrability:'unverified',confirmedRegistrable:false,
  reviewStatus:'review_candidate',risk:{level:'review',reasons:['Registry not found is not registrability.']},potentialScore:70,confidenceScore:50,
  evidence:[{kind:'registry',observedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:15:00Z',source:'https://rdap.verisign.com/net/v1/',method:'rdap',outcome:'registry_not_found'}]};
const isError=(code:string,status?:number)=>(error:unknown)=>error instanceof LostDomainsStoreError && error.code===code && (!status || error.status===status);

function mockedStore(resolve:(sql:string,params:unknown[])=>Record<string,unknown>[] = ()=>[], environment:NodeJS.ProcessEnv={}) {
  const calls:{sql:string;params:unknown[]}[]=[];let releases=0;
  const pool:LostStorePool={connect:async()=>({query:async(sql,params=[])=>{
    calls.push({sql,params});return {rows:resolve(sql,params)};
  },release:()=>{releases++;}})};
  return {store:createLostDomainsStore({pool,environment:()=>environment}),calls,get releases(){return releases;}};
}

test('Lost Domains limits are fixed server budgets, not inferred from a paid client flag',()=>{
  assert.equal(Object.isFrozen(LOST_DOMAIN_LIMITS),true);
  assert.equal(LOST_DOMAIN_LIMITS.sourceLimit,24);assert.equal(LOST_DOMAIN_LIMITS.candidateLimit,600);
  assert.equal(LOST_DOMAIN_LIMITS.candidatesPerSource,25);
  assert.equal(LOST_DOMAIN_LIMITS.dailyOwnerRuns,2);assert.equal(LOST_DOMAIN_LIMITS.dailyGlobalRuns,10);
  assert.equal(LOST_DOMAIN_LIMITS.attemptsPerItem,3);assert.equal(LOST_DOMAIN_LIMITS.attemptsPerRun,900);
  assert.equal(LOST_DOMAIN_LIMITS.dailyOwnerAttempts,1800);assert.equal(LOST_DOMAIN_LIMITS.dailyGlobalAttempts,6000);
  assert.equal(LOST_DOMAIN_LIMITS.leaseSeconds,45);assert.equal(LOST_DOMAIN_LIMITS.runLifetimeSeconds,259200);
});
test('candidate validation preserves redirected source and subdomain provenance, rejects foreign ownership of a source',()=>{
  assert.deepEqual(validateLostCandidate(candidate,source),candidate);
  const redirected={...candidate,sourceUrl:'https://example.org/links/new'};
  assert.deepEqual(validateLostCandidate(redirected,source),redirected);
  for(const value of [{...candidate,domain:"x');DROP TABLE users;--"},{...candidate,sourceUrl:'https://attacker.com/links'},
    {...candidate,targetUrl:'https://example.net.attacker.com/'},{...candidate,targetUrl:'https://user:password@example.net/'},
    {...candidate,targetUrl:'https://127.0.0.1/'},{...candidate,targetUrl:'javascript:alert(1)'},
    {...candidate,anchor:'x'.repeat(501)},{...candidate,sensitive:'false'}]) assert.throws(()=>validateLostCandidate(value,source));
});
test('dated assessments cannot turn missing registry records into confirmed registrability',()=>{
  assert.deepEqual(validateLostAssessment(assessment,candidate),assessment);
  for(const value of [{...assessment,domain:'attacker.com'},{...assessment,targetUrl:'https://attacker.com/'},
    {...assessment,registrability:'available'},{...assessment,confirmedRegistrable:true},{...assessment,potentialScore:101},
    {...assessment,confidenceScore:NaN},{...assessment,potentialScore:1.5},{...assessment,evidence:[]},
    {...assessment,evidence:[{...assessment.evidence[0],expiresAt:assessment.evidence[0].observedAt}]}]) {
    assert.throws(()=>validateLostAssessment(value,candidate));
  }
  const sensitive={...candidate,sensitive:true};
  assert.throws(()=>validateLostAssessment({...assessment,...sensitive},sensitive));
  assert.equal(validateLostAssessment({...assessment,...sensitive,reviewStatus:'excluded',risk:{level:'excluded',reasons:['sensitive_link']},evidence:[]},sensitive).evidence.length,0);
});
test('empty access is false and all private dashboard data is withheld without an explicit grant',async()=>{
  const mocked=mockedStore();
  assert.deepEqual(await mocked.store.readAccess('owner-a'),{allowed:false,expiresAt:null,dailyRefresh:false});
  const dashboard=await mocked.store.getDashboard('owner-a');
  assert.deepEqual(dashboard,{access:{allowed:false,expiresAt:null,dailyRefresh:false},sources:[],runs:[],activeRun:null,latestReport:null});
  assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:runs */')),false);
  assert.ok(mocked.calls.filter(call=>call.sql.includes('/* lost:access */')).every(call=>call.params[0]==='owner-a'));
  assert.ok(mocked.calls.some(call=>call.sql==='BEGIN READ ONLY'));
});
test('unpaid or unverified access cannot create a run, even with an arbitrary request key',async()=>{
  for(const row of [undefined,{allowed:false,expires_at:new Date(),daily_refresh:true},{allowed:'true',expires_at:new Date(),daily_refresh:true}]) {
    const mocked=mockedStore(sql=>sql.includes('/* lost:access */')&&row?[row]:[]);
    await assert.rejects(()=>mocked.store.startRun('owner-a',randomUUID()),isError('plus_required',403));
    assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:new-run */')),false);
    assert.ok(mocked.calls.some(call=>call.sql==='ROLLBACK'));assert.equal(mocked.releases,1);
  }
});
test('missing approved sources prevents a granted account from creating empty pseudo-work',async()=>{
  const mocked=mockedStore(sql=>sql.includes('/* lost:access */')?[{allowed:true,expires_at:new Date(),daily_refresh:false}]:[]);
  await assert.rejects(()=>mocked.store.startRun('owner-a',randomUUID()),isError('sources_unavailable',503));
  assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:new-run */')),false);
});
test('unsafe stored source configurations are not exposed as usable sources',async()=>{
  const good={id:source.id,name:source.name,url:source.url,host:source.host,robots_url:source.robotsUrl,
    policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt};
  const mocked=mockedStore(sql=>sql.includes('/* lost:sources */')?[good,{...good,url:'https://127.0.0.1/'},
    {...good,host:'attacker.com'},{...good,robots_url:'https://attacker.com/robots.txt'},
    {...good,url:'https://example.org/page?url=attacker.com'}]:[]);
  assert.deepEqual(await mocked.store.listSources(),[{...source,policyReviewedAt:new Date(source.policyReviewedAt).toISOString(),policyExpiresAt:new Date(source.policyExpiresAt).toISOString()}]);
  const statement=mocked.calls.find(call=>call.sql.includes('/* lost:sources */'))!.sql;
  assert.match(statement,/policy_expires_at > statement_timestamp\(\)/u);
  assert.match(statement,/robots_policy = 'allowed'/u);
});
test('manual claims require both verified owner scope and explicit run ID; malformed keys never reach storage',async()=>{
  const mocked=mockedStore();
  await assert.rejects(()=>mocked.store.claimWork('owner-a'),isError('run_required',400));
  await assert.rejects(()=>mocked.store.claimWork('owner-a',"' OR TRUE--"),isError('invalid_id',400));
  await assert.rejects(()=>mocked.store.startRun('owner-a',"' OR TRUE--"),isError('invalid_request_key',400));
  assert.equal(mocked.calls.length,0);
  const runId=randomUUID();await mocked.store.claimWork('owner-a',runId);
  const claim=mocked.calls.find(call=>call.sql.includes('/* lost:claim-next */'))!;
  assert.deepEqual(claim.params,['development','owner-a',runId]);
  assert.match(claim.sql,/FOR UPDATE OF w SKIP LOCKED/u);
  assert.match(claim.sql,/source_work.status IN \('queued','leased','retry_wait'\)/u);
});
test('an existing live worker lease prevents concurrent provider work across owners',async()=>{
  const mocked=mockedStore(sql=>sql.includes('/* lost:global-lease */')?[{present:1}]:[]);
  assert.equal(await mocked.store.claimWork(),null);
  assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:claim-next */')),false);
  assert.ok(mocked.calls.some(call=>call.sql.includes('pg_advisory_xact_lock')));
});
test('storage errors are sanitized and the transaction rolls back before connection release',async()=>{
  const mocked=mockedStore(sql=>{if(sql.includes('/* lost:access */'))throw new Error('postgresql://private:secret@database.invalid');return [];});
  await assert.rejects(()=>mocked.store.readAccess('owner-a'),isError('lost_domains_unavailable',503));
  assert.equal(mocked.calls.at(-1)?.sql,'ROLLBACK');assert.equal(mocked.releases,1);
});

test('provider retry time is validated and bounded by the durable run deadline',async()=>{
  const mocked=mockedStore();
  const lease={ownerId:'owner-a',runId:randomUUID(),workId:randomUUID(),token:randomUUID(),fence:1,
    kind:'source' as const,source,candidate:null,expiresAt:new Date(Date.now()+45000).toISOString()};
  for(const invalid of ['nonsense','2026-01-01T00:00:00Z',new Date(Date.now()+86400000+60000).toISOString()]) {
    await assert.rejects(()=>mocked.store.failWork(lease,'rate_limited',true,invalid),isError('invalid_retry_time',400));
  }
  assert.equal(mocked.calls.length,0);
  const retryAt=new Date(Date.now()+3600000).toISOString();
  await mocked.store.failWork(lease,'rate_limited',true,retryAt);
  const statement=mocked.calls.find(call=>call.sql.includes('/* lost:fail */'))!;
  assert.equal(statement.params[8],retryAt);
  assert.match(statement.sql,/LEAST\(r.created_at\+make_interval\(secs=>r.run_lifetime_seconds\),GREATEST/u);
  const recovery=mocked.calls.find(call=>call.sql.includes('/* lost:run-deadline */'))!;
  assert.match(recovery.sql,/r.created_at<clock_timestamp\(\)-make_interval\(secs=>r.run_lifetime_seconds\)/u);
});

test('unknown registry results cannot be settled as a successful discovery report',async()=>{
  const mocked=mockedStore();await mocked.store.claimWork();
  const statement=mocked.calls.find(call=>call.sql.includes('/* lost:settle */'))!.sql;
  assert.match(statement,/registryStatus'='unknown' AND a.assessment->>'reviewStatus'<>'excluded'/u);
  assert.match(statement,/registryStatus'<>'unknown' OR a.assessment->>'reviewStatus'='excluded'/u);
  assert.match(statement,/THEN 'partial' ELSE 'failed' END/u);
  assert.match(statement,/registry_inconclusive/u);
});

test('a repeated source fills its bounded candidate budget with new domains and preserves sensitive warnings',async()=>{
  const lease={ownerId:'owner-a',runId:randomUUID(),workId:randomUUID(),token:randomUUID(),fence:1,
    kind:'source' as const,source,candidate:null,expiresAt:new Date(Date.now()+45000).toISOString()};
  const rows=(prefix:string)=>Array.from({length:20},(_,index):LostCandidate=>({
    domain:`${prefix}${index}.net`,sourceUrl:source.url,targetUrl:`https://${prefix}${index}.net/`,anchor:`Project ${index}`,sensitive:false,
  }));
  const alreadyQueued=rows('queued'),unseen=rows('unseen');
  // Simulate twenty candidates found by an earlier publisher in this run.
  const queued=new Map(alreadyQueued.map(row=>[row.domain,{...row,sourceUrl:'https://earlier.org/list'}]));
  const repeated=alreadyQueued.map((row,index)=>({...row,sensitive:index===0}));
  let inserted:LostCandidate[]=[];
  const mocked=mockedStore((sql,params)=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
    if(sql.includes('/* lost:finish-read */'))return [{kind:'source',status:'leased',fence:lease.fence,source_id:source.id,source_snapshot:source}];
    if(sql.includes('/* lost:sources */'))return [{id:source.id,name:source.name,url:source.url,host:source.host,
      robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}];
    if(sql.includes('/* lost:fence-check */'))return [{present:1}];
    if(sql.includes('/* lost:merge-sensitive */')) {
      assert.deepEqual(params.slice(0,2),[lease.ownerId,lease.runId]);
      for(const row of JSON.parse(String(params[2])) as LostCandidate[]) {
        if(row.sensitive && queued.has(row.domain))queued.get(row.domain)!.sensitive=true;
      }
    }
    if(sql.includes('/* lost:queued-domains */')) {
      assert.equal(queued.get(repeated[0].domain)?.sensitive,true,'Sensitive merging must happen before filtering repeat candidates');
      assert.deepEqual(params,[lease.ownerId,lease.runId]);
      return [...queued.keys()].map(identity_key=>({identity_key}));
    }
    if(sql.includes('/* lost:candidate-work */')) {
      inserted=(JSON.parse(String(params[4])) as {candidate:LostCandidate}[]).map(row=>row.candidate);
      for(const row of inserted)if(!queued.has(row.domain))queued.set(row.domain,row);
    }
    return [];
  });
  assert.equal((await mocked.store.finishWork(lease,{kind:'source',candidates:[...repeated,...unseen],evidence:{}})).applied,true);
  assert.deepEqual(inserted.map(row=>row.domain),unseen.map(row=>row.domain));
  assert.equal(inserted.length,20,'An existing run without the new column in a fixture retains its legacy per-source budget');
  assert.equal(queued.size,40);
  assert.equal(queued.get(repeated[0].domain)?.sensitive,true);
  assert.equal(queued.get(repeated[0].domain)?.sourceUrl,'https://earlier.org/list','The original provenance survives the sensitive merge');
  const merge=mocked.calls.find(call=>call.sql.includes('/* lost:merge-sensitive */'))!;
  assert.equal((JSON.parse(String(merge.params[2])) as LostCandidate[]).length,40,'Merge sees repeats that will not be inserted again');
  assert.match(merge.sql,/input\.sensitive AND w\.status IN \('queued','retry_wait'\)/u);
  const previous=mocked.calls.find(call=>call.sql.includes('/* lost:previous-checks */'))!;
  assert.deepEqual(previous.params,['development',lease.ownerId,[...repeated,...unseen].map(row=>row.domain)]);
  assert.match(previous.sql,/r\.id=a\.run_id AND r\.owner_id=a\.owner_id/u);
  assert.match(previous.sql,/r\.namespace=\$1 AND a\.owner_id=\$2 AND a\.domain=ANY\(\$3::text\[\]\)/u);
  assert.equal(mocked.calls.at(-1)?.sql,'COMMIT');
});

test('new runs persist the complete server profile and select at most 24 reviewed sources in their own namespace',async()=>{
  for(const namespace of ['preview','production']) {
    const ownerId=`owner-${namespace}`,requestKey=randomUUID(),catalog=Array.from({length:30},(_,index)=>({
      id:randomUUID(),name:`Reviewed publisher ${index}`,url:`https://publisher${index}.org/links`,host:`publisher${index}.org`,
      robots_url:`https://publisher${index}.org/robots.txt`,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt,
    }));
    let insertedRun:Record<string,unknown>|undefined;
    const mocked=mockedStore((sql,params)=>{
      if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
      if(sql.includes('/* lost:sources */'))return catalog;
      if(sql.includes('/* lost:run-budget */'))return [{global_count:0,owner_count:0,cooling:false}];
      if(sql.includes('/* lost:campaign */'))return [{id:randomUUID()}];
      if(sql.includes('/* lost:new-run */')) {
        assert.deepEqual(params.slice(5),['trading-research-v3',24,600,900,25,259200,3,[1200,7200,43200]]);
        assert.match(sql,/run_lifetime_seconds,verification_queued/u);assert.match(sql,/\$11,false,0,\$12,\$13::int\[\]\)/u);
        assert.deepEqual(params.slice(1,3),[namespace,ownerId]);assert.equal(params[4],requestKey);
        insertedRun={...reportRun(String(params[0]),new Date().toISOString(),0),status:'queued',finished_at:null,
          source_limit:params[6],candidate_limit:params[7],source_count:24,total_work:24,completed_work:0};
      }
      if(sql.includes('/* lost:runs */'))return insertedRun?[insertedRun]:[];
      return [];
    },{VERCEL:'1',VERCEL_ENV:namespace});
    const result=await mocked.store.startRun(ownerId,requestKey);
    assert.equal(result.reused,false);assert.deepEqual(result.run.capacity,{sourceLimit:24,candidateLimit:600});
    const sourceWork=mocked.calls.filter(call=>call.sql.includes('/* lost:source-work */'));
    assert.equal(sourceWork.length,24);assert.equal(new Set(sourceWork.map(call=>call.params[3])).size,24);
    assert.ok(sourceWork.every(call=>call.params[1]===ownerId && call.params[2]===result.run.id && catalog.some(row=>row.id===call.params[3])));
    assert.deepEqual(mocked.calls.find(call=>call.sql.includes('/* lost:source-history */'))!.params,[namespace,ownerId]);
    assert.deepEqual(mocked.calls.find(call=>call.sql.includes('/* lost:run-budget */'))!.params,[namespace,ownerId]);
    assert.deepEqual(mocked.calls.find(call=>call.sql.includes('/* lost:lock */'))!.params,[`sajda.lost.v1:${namespace}`]);
    assert.equal(mocked.calls.at(-1)?.sql,'COMMIT');
  }
});

test('idempotent run retries preserve the historical persisted capacity without creating more work',async()=>{
  const previous={...reportRun(randomUUID(),'2026-09-09T12:00:00.000Z',0),status:'queued',finished_at:null,source_limit:3,candidate_limit:60};
  const requestKey=randomUUID(),mocked=mockedStore((sql,params)=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
    if(sql.includes('/* lost:idempotency */')) {assert.deepEqual(params,['preview','owner-a',requestKey]);return [{id:previous.id}];}
    if(sql.includes('/* lost:runs */'))return [previous];
    return [];
  },{VERCEL:'1',VERCEL_ENV:'preview'});
  const result=await mocked.store.startRun('owner-a',requestKey);
  assert.equal(result.reused,true);assert.equal(result.run.id,previous.id);
  assert.deepEqual(result.run.capacity,{sourceLimit:3,candidateLimit:60});
  assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:new-run */')||call.sql.includes('/* lost:source-work */')),false);
});

test('work claims enforce each stored attempt budget independently of the expanded default',async()=>{
  for(const profile of [{limit:undefined,used:79,allowed:true},{limit:undefined,used:80,allowed:false},
    {limit:80,used:80,allowed:false},{limit:900,used:899,allowed:true},{limit:900,used:900,allowed:false}]) {
    const runId=randomUUID(),workId=randomUUID(),mocked=mockedStore(sql=>{
      if(sql.includes('/* lost:claim-next */'))return [{work_id:workId,run_id:runId,owner_id:'owner-a',source_id:source.id,
        source_snapshot:source,kind:'source',candidate:null,attempt_limit:profile.limit}];
      if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
      if(sql.includes('/* lost:sources */'))return [{id:source.id,name:source.name,url:source.url,host:source.host,
        robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}];
      if(sql.includes('/* lost:attempt-budget */'))return [{global_count:profile.used,owner_count:profile.used,run_count:profile.used}];
      if(sql.includes('/* lost:lease */'))return [{fence:1,lease_until:new Date(Date.now()+45000)}];
      return [];
    },{VERCEL:'1',VERCEL_ENV:'preview'});
    const lease=await mocked.store.claimWork('owner-a',runId);
    assert.equal(Boolean(lease),profile.allowed,JSON.stringify(profile));
    const claim=mocked.calls.find(call=>call.sql.includes('/* lost:claim-next */'))!;
    assert.match(claim.sql,/r.attempt_limit/u);assert.deepEqual(claim.params,['preview','owner-a',runId]);
    assert.deepEqual(mocked.calls.find(call=>call.sql.includes('/* lost:attempt-budget */'))!.params,['preview','owner-a',runId]);
    assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:lease */')),profile.allowed);
    const exhausted=mocked.calls.find(call=>call.sql.includes("failure_code='attempt_budget'"));
    assert.equal(Boolean(exhausted),!profile.allowed);
    if(exhausted)assert.deepEqual(exhausted.params,['owner-a',runId]);
  }
});

test('source completion selects the persisted per-source quota and passes the persisted overall cap to insertion',async()=>{
  for(const profile of [{perSource:undefined,total:undefined,expected:20,cap:60},{perSource:20,total:60,expected:20,cap:60},
    {perSource:25,total:600,expected:25,cap:600}]) {
    const lease={ownerId:'owner-a',runId:randomUUID(),workId:randomUUID(),token:randomUUID(),fence:1,
      kind:'source' as const,source,candidate:null,expiresAt:new Date(Date.now()+45000).toISOString()};
    const rows=Array.from({length:60},(_,index):LostCandidate=>({domain:`discovery${index}.net`,sourceUrl:source.url,
      targetUrl:`https://discovery${index}.net/`,anchor:`Project ${index}`,sensitive:false}));
    const mocked=mockedStore(sql=>{
      if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
      if(sql.includes('/* lost:finish-read */'))return [{kind:'source',status:'leased',fence:lease.fence,source_id:source.id,
        source_snapshot:source,candidate_limit:profile.total,candidates_per_source:profile.perSource}];
      if(sql.includes('/* lost:sources */'))return [{id:source.id,name:source.name,url:source.url,host:source.host,
        robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}];
      if(sql.includes('/* lost:fence-check */'))return [{present:1}];
      return [];
    });
    assert.equal((await mocked.store.finishWork(lease,{kind:'source',candidates:rows,evidence:{}})).applied,true);
    const insert=mocked.calls.find(call=>call.sql.includes('/* lost:candidate-work */'))!;
    assert.equal(JSON.parse(String(insert.params[4])).length,profile.expected,JSON.stringify(profile));
    assert.equal(insert.params[5],profile.cap);assert.deepEqual(insert.params.slice(0,2),[lease.ownerId,lease.runId]);
    assert.match(insert.sql,/LIMIT GREATEST\(0,\$6::int-/u);
    assert.match(mocked.calls.find(call=>call.sql.includes('/* lost:finish-read */'))!.sql,/r.candidate_limit,r.candidates_per_source/u);
  }
});

test('rolling daily budgets defer a multi-day run without a provider attempt or lost temporal gap',async()=>{
  for(const exhausted of ['global','owner','both'] as const) {
    const runId=randomUUID(),workId=randomUUID(),globalRetry=new Date(Date.now()+3600000).toISOString(),ownerRetry=new Date(Date.now()+7200000).toISOString();
    const mocked=mockedStore(sql=>{
      if(sql.includes('/* lost:claim-next */'))return [{work_id:workId,run_id:runId,owner_id:'owner-a',source_id:source.id,
        source_snapshot:source,kind:'candidate',candidate,attempt_limit:900,verification:true,verification_round:2}];
      if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
      if(sql.includes('/* lost:sources */'))return [{id:source.id,name:source.name,url:source.url,host:source.host,
        robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}];
      if(sql.includes('/* lost:attempt-budget */'))return [{global_count:exhausted==='owner'?100:6000,
        owner_count:exhausted==='global'?100:1800,run_count:100,global_retry_at:globalRetry,owner_retry_at:ownerRetry}];
      return [];
    },{VERCEL:'1',VERCEL_ENV:'preview'});
    assert.equal(await mocked.store.claimWork('owner-a',runId),null);
    const waiting=mocked.calls.find(call=>call.sql.includes('/* lost:daily-budget-wait */'))!;
    assert.deepEqual(waiting.params,['preview','owner-a',runId,exhausted==='global'?globalRetry:ownerRetry]);
    assert.match(waiting.sql,/status='retry_wait',failure_code='daily_budget'/u);
    assert.match(waiting.sql,/GREATEST\(w.next_attempt_at,clock_timestamp\(\)\+interval '1 minute',\$4::timestamptz\)/u);
    assert.match(waiting.sql,/LEAST\(r.created_at\+make_interval\(secs=>r.run_lifetime_seconds\)/u);
    assert.match(waiting.sql,/r.namespace=\$1 AND w.owner_id=\$2 AND w.run_id=\$3::uuid/u);
    assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:lease */')||call.sql.includes('INSERT INTO sajda.lost_domain_attempts')),false);
    assert.equal(mocked.calls.some(call=>call.sql.includes("failure_code='attempt_budget'")),false);
    assert.equal(mocked.calls.at(-1)?.sql,'COMMIT');
  }
});

test('a sensitive link dropped by the first source quota still excludes a later source candidate',async()=>{
  const later={...source,id:randomUUID(),name:'Later reviewed fixture',url:'https://second.org/links',host:'second.org',robotsUrl:'https://second.org/robots.txt'};
  const makeLease=(item:LostSource)=>({ownerId:'owner-a',runId,workId:randomUUID(),token:randomUUID(),fence:1,
    kind:'source' as const,source:item,candidate:null,expiresAt:new Date(Date.now()+45000).toISOString()});
  const runId=randomUUID(),firstLease=makeLease(source),laterLease=makeLease(later);
  const hidden={...candidate,domain:'cloudbilling.com',targetUrl:'https://cloudbilling.com/login',sensitive:true};
  const earlier=Array.from({length:25},(_,index):LostCandidate=>({domain:`first${index}.net`,sourceUrl:source.url,
    targetUrl:`https://first${index}.net/`,anchor:`Project ${index}`,sensitive:false}));
  const snapshots=new Map<string,{links:{domain:string;sensitive:boolean}[]}>(),queued=new Map<string,LostCandidate>();
  const mocked=mockedStore((sql,params)=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
    if(sql.includes('/* lost:finish-read */')) {
      const lease=params[0]===firstLease.workId?firstLease:laterLease;
      return [{kind:'source',status:'leased',fence:lease.fence,source_id:lease.source.id,source_snapshot:lease.source,candidate_limit:600,candidates_per_source:25}];
    }
    if(sql.includes('/* lost:sources */'))return [source,later].map(item=>({id:item.id,name:item.name,url:item.url,host:item.host,
      robots_url:item.robotsUrl,policy_reviewed_at:item.policyReviewedAt,policy_expires_at:item.policyExpiresAt}));
    if(sql.includes('/* lost:fence-check */'))return [{present:1}];
    if(sql.includes('/* lost:prior-sensitive */')) {
      assert.deepEqual(params,['owner-a',runId]);
      assert.match(sql,/w.owner_id=\$1 AND w.run_id=\$2::uuid AND w.kind='source' AND w.status='succeeded'/u);
      return [...snapshots.values()].flatMap(value=>value.links.filter(row=>row.sensitive).map(row=>({domain:row.domain})));
    }
    if(sql.includes('/* lost:queued-domains */'))return [...queued.keys()].map(identity_key=>({identity_key}));
    if(sql.includes('/* lost:candidate-work */'))for(const row of JSON.parse(String(params[4])) as {candidate:LostCandidate}[])queued.set(row.candidate.domain,row.candidate);
    if(sql.includes('/* lost:complete */'))snapshots.set(String(params[0]),JSON.parse(String(params[5])));
    return [];
  });
  const discovered=[...earlier,hidden];
  assert.equal((await mocked.store.finishWork(firstLease,{kind:'source',candidates:discovered,
    evidence:{links:discovered.map(({domain,sensitive})=>({domain,sensitive}))}})).applied,true);
  assert.equal(queued.size,25);assert.equal(queued.has(hidden.domain),false,'The sensitive warning must survive without a queued candidate');
  const safeLooking={...hidden,sourceUrl:later.url,targetUrl:'https://cloudbilling.com/',sensitive:false};
  assert.equal((await mocked.store.finishWork(laterLease,{kind:'source',candidates:[safeLooking],
    evidence:{links:[{domain:safeLooking.domain,sensitive:false}]}})).applied,true);
  assert.equal(queued.get(hidden.domain)?.sensitive,true);
  assert.equal(queued.get(hidden.domain)?.sourceUrl,later.url);
  assert.equal(safeLooking.sensitive,false,'Combining publisher evidence must not mutate caller-owned candidates');
});

test('final verification is bounded, account-scoped, opt-in per run and queued before settlement',async()=>{
  const mocked=mockedStore(()=>[],{VERCEL:'1',VERCEL_ENV:'preview'});
  await mocked.store.claimWork();
  const verify=mocked.calls.find(call=>call.sql.includes('/* lost:verification-pass */'))!;
  assert.deepEqual(verify.params,['preview']);
  assert.match(verify.sql,/r.namespace=\$1 AND r.status IN \('queued','running'\) AND r.verification_round<r.verification_max_rounds/u);
  assert.match(verify.sql,/run_lifetime_seconds\)>clock_timestamp\(\)/u);
  assert.match(verify.sql,/w.status IN \('queued','leased','retry_wait'\)/u);
  assert.match(verify.sql,/e.owner_id=r.owner_id AND e.namespace=r.namespace/u);
  assert.match(verify.sql,/e.expires_at>clock_timestamp\(\) AND u\."emailVerified"=true/u);
  assert.match(verify.sql,/w.run_id=r.id AND w.owner_id=r.owner_id AND NOT w.verification/u);
  assert.match(verify.sql,/registryStatus'='registry_not_found'/u);
  assert.match(verify.sql,/reviewStatus'='review_candidate'/u);
  assert.match(verify.sql,/a.assessment->>'sensitive'='false'/u);
  assert.match(verify.sql,/s.enabled AND s.robots_policy='allowed' AND s.policy_expires_at>clock_timestamp\(\)/u);
  assert.match(verify.sql,/LIMIT 30/u);
  assert.match(verify.sql,/'verify:'\|\|r.verification_round::text\|\|':'\|\|choice.work_id::text/u);
  assert.doesNotMatch(verify.sql,/'verify:'\|\|choice.domain/u);
  assert.match(verify.sql,/ON CONFLICT\(run_id,kind,identity_key\) DO NOTHING/u);
  assert.ok(mocked.calls.indexOf(verify)<mocked.calls.findIndex(call=>call.sql.includes('/* lost:settle */')));
});

test('each temporal round waits after the previous completed observation and never resurrects failed or registered work',async()=>{
  const mocked=mockedStore();await mocked.store.claimWork();
  const verify=mocked.calls.find(call=>call.sql.includes('/* lost:verification-pass */'))!.sql;
  assert.match(verify,/verification_round=verification_round\+1/u);
  assert.match(verify,/r.verification_gap_seconds\[r.verification_round\] AS gap_seconds/u);
  assert.match(verify,/GREATEST\(clock_timestamp\(\),choice.observed_at\+make_interval\(secs=>r.gap_seconds\)\)/u);
  assert.match(verify,/ORDER BY latest.verification_round DESC,latest.created_at DESC,latest.id DESC LIMIT 1/u);
  assert.match(verify,/previous.status='succeeded' AND previous.verification_round=r.verification_round-1/u);
  assert.match(verify,/a.work_id=previous.id AND a.owner_id=w.owner_id AND a.run_id=w.run_id/u);
  assert.match(verify,/a.observed_at\+make_interval\(secs=>r.gap_seconds\)<r.deadline/u);
  assert.match(verify,/attempt.run_id=r.id AND attempt.owner_id=r.owner_id\)<r.attempt_limit/u);
  assert.match(verify,/s.robots_url=w.source_snapshot->>'robotsUrl'/u);
  const claim=mocked.calls.find(call=>call.sql.includes('/* lost:claim-next */'))!.sql;
  assert.match(claim,/w.next_attempt_at<=clock_timestamp\(\)/u,'Waiting is persisted, not a provider request or a sleeping invocation');
});

test('72-hour run attempt ceilings include attempts older than the rolling daily provider budgets',async()=>{
  const runId=randomUUID(),mocked=mockedStore(sql=>{
    if(sql.includes('/* lost:claim-next */'))return [{work_id:randomUUID(),run_id:runId,owner_id:'owner-a',source_id:source.id,
      source_snapshot:source,kind:'candidate',candidate,attempt_limit:900,verification:true,verification_round:3}];
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
    if(sql.includes('/* lost:sources */'))return [{id:source.id,name:source.name,url:source.url,host:source.host,
      robots_url:source.robotsUrl,policy_reviewed_at:source.policyReviewedAt,policy_expires_at:source.policyExpiresAt}];
    if(sql.includes('/* lost:attempt-budget */'))return [{global_count:0,owner_count:0,run_count:900}];
    return [];
  });
  assert.equal(await mocked.store.claimWork('owner-a',runId),null);
  const budget=mocked.calls.find(call=>call.sql.includes('/* lost:attempt-budget */'))!.sql;
  assert.match(budget,/count\(\*\) FILTER\(WHERE run_id=\$3::uuid AND owner_id=\$2\)::int AS run_count/u);
  assert.match(budget,/OR \(run_id=\$3::uuid AND owner_id=\$2\)/u);
  assert.equal(mocked.calls.some(call=>call.sql.includes('/* lost:lease */')),false);
  assert.ok(mocked.calls.some(call=>call.sql.includes("failure_code='attempt_budget'")));
});

test('final verification progress does not inflate the displayed discovery capacity',async()=>{
  const stored={...reportRun(randomUUID(),'2026-09-09T12:00:00.000Z',630),source_limit:24,candidate_limit:600,
    source_count:24,candidate_count:600,completed_count:600,verification_count:90,completed_verification_count:88,
    verification_round:3,verification_max_rounds:3,next_check_at:'2026-09-09T20:00:00.000Z'};
  const mocked=mockedStore(sql=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:new Date(Date.now()+86400000),daily_refresh:false}];
    if(sql.includes('/* lost:runs */'))return [stored];
    return [];
  });
  const run=(await mocked.store.getDashboard('owner-a')).runs[0];
  assert.equal(run.candidateCount,600);assert.equal(run.completedCount,600);
  assert.equal(run.verificationCount,90);assert.equal(run.completedVerificationCount,88);
  assert.equal(run.verificationRound,3);assert.equal(run.verificationMaxRounds,3);assert.equal(run.nextCheckAt,stored.next_check_at);
  assert.deepEqual(run.capacity,{sourceLimit:24,candidateLimit:600});
  const query=mocked.calls.find(call=>call.sql.includes('/* lost:runs */'))!;
  assert.match(query.sql,/w.kind='candidate' AND NOT w.verification\) AS candidate_count/u);
  assert.match(query.sql,/w.kind='candidate' AND NOT w.verification AND w.status IN \('succeeded','failed','cancelled'\)\) AS completed_count/u);
  assert.match(query.sql,/w.verification\) AS verification_count/u);
  assert.match(query.sql,/min\(w.next_attempt_at\)/u);
});

function reportRun(id:string,createdAt:string,assessmentCount:number) {
  return {id,status:'succeeded',created_at:createdAt,updated_at:createdAt,finished_at:createdAt,failure_code:null,
    total_work:3+assessmentCount,completed_work:3+assessmentCount,failed_work:0,assessment_count:assessmentCount,
    source_count:3,candidate_count:assessmentCount,completed_count:assessmentCount,failed_count:0};
}

test('dashboard observation history remains scoped to the account, namespace, displayed domains and report time',async()=>{
  const report=reportRun(randomUUID(),'2026-09-09T12:00:00.000Z',1),priorRun=randomUUID();
  const mocked=mockedStore((sql,params)=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:'2026-09-10T00:00:00Z',daily_refresh:false}];
    if(sql.includes('/* lost:runs */'))return [report];
    if(sql.includes('/* lost:report */')) {
      assert.deepEqual(params,['owner-a',report.id]);return [{assessment}];
    }
    if(sql.includes('/* lost:observation-history */')) {
      assert.deepEqual(params,['development','owner-a',[candidate.domain],report.finished_at]);
      return [
        {domain:candidate.domain,run_id:report.id,observed_at:'2026-09-09T11:59:00.000Z',registry_status:'registry_not_found',source_url:source.url},
        {domain:candidate.domain,run_id:priorRun,observed_at:'2026-09-08T12:00:00.000Z',registry_status:'registered',source_url:'https://second.org/links'},
      ];
    }
    return [];
  });
  const dashboard=await mocked.store.getDashboard('owner-a');
  const displayed=dashboard.latestReport!.assessments[0];
  assert.deepEqual(displayed.observationHistory,{
    firstObservedAt:'2026-09-08T12:00:00.000Z',lastObservedAt:'2026-09-09T11:59:00.000Z',observations:2,independentSources:2,
    previousRegistryStatus:'registered',previousObservedAt:'2026-09-08T12:00:00.000Z',registryChanged:true,windowDays:180,
  });
  assert.deepEqual(displayed.evidence,assessment.evidence,'Adding account history must not freshen the evidence dates');
  assert.equal(displayed.confirmedRegistrable,false);
  assert.equal(assessment.observationHistory,undefined,'Stored assessment objects must not be mutated');
  const history=mocked.calls.find(call=>call.sql.includes('/* lost:observation-history */'))!;
  assert.match(history.sql,/r\.id=a\.run_id AND r\.owner_id=a\.owner_id/u);
  assert.match(history.sql,/r\.namespace=\$1 AND a\.owner_id=\$2 AND a\.domain=ANY\(\$3::text\[\]\)/u);
  assert.match(history.sql,/a\.observed_at>=statement_timestamp\(\)-interval '180 days'/u);
  assert.match(history.sql,/a\.observed_at<=\$4::timestamptz/u);
  assert.match(history.sql,/LIMIT 24000/u);
  const reportQuery=mocked.calls.find(call=>call.sql.includes('/* lost:report */'))!;
  assert.match(reportQuery.sql,/SELECT DISTINCT ON \(a.domain\) a.assessment/u);
  assert.match(reportQuery.sql,/w.id=a.work_id AND w.owner_id=a.owner_id AND w.run_id=a.run_id/u);
  assert.match(reportQuery.sql,/WHERE a.owner_id=\$1 AND a.run_id=\$2::uuid ORDER BY a.domain,w.verification_round DESC,a.observed_at DESC,a.id DESC LIMIT 600/u);
  assert.ok(mocked.calls.some(call=>call.sql==='BEGIN READ ONLY'));
});

test('a newer successful empty run cannot erase the previous nonempty report',async()=>{
  const empty=reportRun(randomUUID(),'2026-09-09T12:00:00.000Z',0);
  const populated=reportRun(randomUUID(),'2026-09-08T12:00:00.000Z',1);
  const mocked=mockedStore((sql,params)=>{
    if(sql.includes('/* lost:access */'))return [{allowed:true,expires_at:'2026-09-10T00:00:00Z',daily_refresh:false}];
    if(sql.includes('/* lost:runs */')) {
      assert.deepEqual(params.slice(0,3),['development','owner-a',null]);
      if(params[3]===true) {
        assert.match(sql,/NOT \$4::boolean OR \(r\.status IN \('succeeded','partial'\) AND EXISTS\(SELECT 1 FROM sajda\.lost_domain_assessments a WHERE a\.run_id=r\.id AND a\.owner_id=r\.owner_id\)/u);
        return [populated];
      }
      return [empty,populated];
    }
    if(sql.includes('/* lost:report */'))return params[1]===populated.id?[{assessment}]:[];
    return [];
  });
  const dashboard=await mocked.store.getDashboard('owner-a');
  assert.deepEqual(dashboard.runs.map(run=>run.id),[empty.id,populated.id],'The empty run still appears in run history');
  assert.equal(dashboard.latestReport?.run.id,populated.id);
  assert.equal(dashboard.latestReport?.assessments[0].domain,candidate.domain);
  assert.equal(dashboard.activeRun,null);
  assert.deepEqual(mocked.calls.filter(call=>call.sql.includes('/* lost:report */')).map(call=>call.params),[['owner-a',populated.id]]);
});

test('migration remains additive, creates no sources/grants, and closes SQL NULL loopholes',async()=>{
  const sql=await readFile(new URL('../db/migrations/0006_lost_domains.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/\bINSERT\s+INTO\b/iu);assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE/iu);
  assert.match(sql,/daily_refresh boolean NOT NULL DEFAULT false/u);
  assert.match(sql,/policy_expires_at IS NOT NULL/u);
  assert.match(sql,/\(assessment->'confirmedRegistrable'\) IS NOT DISTINCT FROM 'false'::jsonb/u);
  assert.match(sql,/qualified boolean NOT NULL DEFAULT false CHECK \(qualified = false\)/u);
  assert.match(sql,/CREATE UNIQUE INDEX lost_domain_runs_one_active_owner_idx/u);
  assert.match(sql,/UNIQUE\(namespace, owner_id, request_key\)/u);
  assert.match(sql,/FOREIGN KEY\(owner_id, run_id, work_id\)/u);
  assert.match(sql,/CREATE TRIGGER lost_domain_assessments_immutable BEFORE UPDATE/u);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu)??[]).length,7);
});

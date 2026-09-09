/**
 * Opt-in real PostgreSQL test. The store's transactions become savepoints
 * inside a single outer transaction which ALWAYS rolls back. No crawling,
 * account email, subscriptions or persistent access grants are performed.
 * Requires migrations through 0012. Without --run, no database is opened.
 * node --env-file=.env.neon-development.local --import tsx scripts/check-lost-domains-store.mjs --run
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';

async function main(){
  if(!process.argv.includes('--run')){console.log(JSON.stringify({status:'SKIPPED',reason:'Explicit --run against a reviewed development database is required.'}));return;}
  const raw=process.env.DATABASE_URL_UNPOOLED;
  assert.ok(raw);const target=new URL(raw);
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&target.hostname.endsWith('.neon.tech')&&!target.hostname.includes('-pooler.'));
  assert.notEqual(process.env.VERCEL_ENV,'production');target.searchParams.set('sslmode','verify-full');
  const pool=new Pool({connectionString:target.toString(),max:1,connectionTimeoutMillis:8000,query_timeout:10000});
  const ids=Array.from({length:9},()=>`qa-lost-rollback-${randomUUID()}`),sourceIds=Array.from({length:3},()=>randomUUID());
  let client,open=false,label='connect',lastSqlFailure;
  const passed=[];
  const verify=async(name,fn)=>{label=name;await fn();passed.push(name);};
  const expectCode=code=>error=>error?.code===code;
  try{
    client=await pool.connect();
    const before=await client.query(`SELECT
      (SELECT count(*)::int FROM sajda.lost_domain_sources WHERE enabled) AS enabled_sources,
      (SELECT count(*)::int FROM sajda.lost_domain_runs WHERE namespace='development' AND status IN ('queued','running')) AS active_runs`);
    assert.deepEqual(before.rows[0],{enabled_sources:0,active_runs:0},'Rollback harness requires an inactive development Lost Domains catalog.');
    await client.query('BEGIN');open=true;
    await client.query("SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
    const adapter={connect:async()=>({query:async(sql,params=[])=>{
      try{
        if(sql==='BEGIN'||sql==='BEGIN READ ONLY')return await client.query('SAVEPOINT lost_store_transaction');
        if(sql==='COMMIT')return await client.query('RELEASE SAVEPOINT lost_store_transaction');
        if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT lost_store_transaction');return await client.query('RELEASE SAVEPOINT lost_store_transaction');}
        return await client.query(sql,params);
      }catch(error){lastSqlFailure={sqlState:/^[A-Z0-9]{5}$/u.test(error.code??'')?error.code:'unknown',queryTag:/\/\* (lost:[a-z-]+) \*\//u.exec(sql)?.[1]??'statement'};throw error;}
    },release(){}})};
    const {createLostDomainsStore,LOST_DOMAIN_LIMITS}=await import('../api/_shared/lost-domains-store.ts');
    const {createLostDomainsEngine}=await import('../api/_shared/lost-domains-engine.ts');
    const {createSafeFetcher}=await import('../api/_shared/lost-domains-fetch.ts');
    const {isLostDomainOpportunity}=await import('../shared/lost-domain-opportunity.ts');
    const {isTradingMarketFit}=await import('../shared/trading-market-fit.ts');
    const store=createLostDomainsStore({pool:adapter,environment:()=>({})});
    await client.query(`INSERT INTO public.sajda_auth_user(id,name,email,"emailVerified")
      SELECT id,'Rollback fixture',id||'@example.invalid',true FROM unnest($1::text[]) id`,[ids]);
    await client.query(`INSERT INTO sajda.lost_domain_access(owner_id,grant_source,source_reference,expires_at,daily_refresh)
      SELECT id,'operator','rollback-only fixture',clock_timestamp()+interval '1 day',false FROM unnest($1::text[]) id`,[ids.filter((_id,index)=>index!==2)]);
    await verify('unpaid account denied',async()=>{
      assert.equal((await store.readAccess(ids[2])).allowed,false);
      await assert.rejects(()=>store.startRun(ids[2],randomUUID()),expectCode('plus_required'));
    });
    await verify('approved source absence fails closed',async()=>{
      await assert.rejects(()=>store.startRun(ids[0],randomUUID()),expectCode('sources_unavailable'));
    });
    for(let index=0;index<3;index++)await client.query(`INSERT INTO sajda.lost_domain_sources
      (id,name,url,host,robots_url,enabled,robots_policy,policy_reviewed_at,policy_expires_at,review_reference)
      VALUES($1::uuid,'Rollback fixture',$2,'example.org','https://example.org/robots.txt',true,'allowed',
        clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day','rollback-only policy')`,[sourceIds[index],`https://example.org/qa-${sourceIds[index]}`]);
    await verify('enabled source cannot omit policy expiry',async()=>{
      await client.query('SAVEPOINT invalid_fixture');
      await assert.rejects(()=>client.query('UPDATE sajda.lost_domain_sources SET policy_expires_at=NULL WHERE id=$1::uuid',[sourceIds[0]]),expectCode('23514'));
      await client.query('ROLLBACK TO SAVEPOINT invalid_fixture');await client.query('RELEASE SAVEPOINT invalid_fixture');
    });
    // These additional runs use a nested rollback so the original ten-run
    // global-budget scenario below keeps its real limit and original coverage.
    await client.query('SAVEPOINT verification_fixture');
    const verificationRun=await store.startRun(ids[8],randomUUID());
    const fixtureDomain='cloudbilling.com';
    const noAddress=()=>{throw Object.assign(new Error('Synthetic DNS absence'),{code:'ENOTFOUND'});};
    const verificationEngine=registered=>createLostDomainsEngine({dns:async()=>noAddress(),fetch:createSafeFetcher({
      lookup:async host=>host===fixtureDomain||host.endsWith(`.${fixtureDomain}`)?noAddress():[{address:'93.184.216.34',family:4}],
      transport:async({url})=>{
        if(url.pathname==='/robots.txt')return {url:url.href,status:200,headers:{'content-type':'text/plain'},body:''};
        if(url.hostname==='example.org')return {url:url.href,status:200,headers:{'content-type':'text/html'},
          body:`<a href="https://${fixtureDomain}/resource">Cloud billing tools</a>`};
        assert.equal(url.hostname,'rdap.verisign.com','All provider transports are in-process fixtures');
        assert.equal(url.pathname,`/com/v1/domain/${fixtureDomain}`);
        return {url:url.href,status:registered?200:404,headers:{'content-type':'application/rdap+json'},
          body:JSON.stringify(registered?{objectClassName:'domain',ldhName:fixtureDomain.toUpperCase(),status:['active']}:{errorCode:404})};
      },
    })});
    const discoveryEngine=verificationEngine(false);
    for(let index=0;index<sourceIds.length;index++){
      const lease=await store.claimWork(ids[8],verificationRun.run.id);assert.ok(lease);assert.equal(lease.kind,'source');
      const found=await discoveryEngine.discoverSource({url:lease.source.url,allowedHost:lease.source.host,maxLinks:60});
      assert.equal(found.candidates.length,1);
      await store.finishWork(lease,{kind:'source',candidates:found.candidates,evidence:{sourceUrl:lease.source.url,observedAt:found.observedAt,
        links:found.candidates.map(({domain,sensitive})=>({domain,sensitive}))}});
    }
    const initialLease=await store.claimWork(ids[8],verificationRun.run.id);assert.ok(initialLease);assert.equal(initialLease.verification,false);
    const initialAssessment=await discoveryEngine.inspectCandidate(initialLease.candidate);
    assert.equal(initialAssessment.registryStatus,'registry_not_found');assert.equal(initialAssessment.reviewStatus,'review_candidate');
    assert.equal(initialAssessment.opportunity.tier,'priority_review');assert.ok(isLostDomainOpportunity(initialAssessment.opportunity));
    assert.ok(isTradingMarketFit(initialAssessment.marketFit));assert.ok(initialAssessment.marketFit.score>=60);
    const initialResult={kind:'candidate',assessment:initialAssessment};
    await store.finishWork(initialLease,initialResult);
    await verify('final verification is queued exactly once after all first-pass work settles',async()=>{
      assert.equal((await store.finishWork(initialLease,initialResult)).applied,true,'Duplicate first-pass completion remains idempotent');
      const rows=await client.query(`SELECT verification_queued,
        (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.verification) AS verification_count,
        (SELECT count(*)::int FROM sajda.lost_domain_work_items w WHERE w.run_id=r.id AND w.kind='candidate' AND NOT w.verification) AS discovery_count
        FROM sajda.lost_domain_runs r WHERE r.owner_id=$1 AND r.id=$2::uuid`,[ids[8],verificationRun.run.id]);
      assert.deepEqual(rows.rows[0],{verification_queued:true,verification_count:1,discovery_count:1});
      const dashboard=await store.getDashboard(ids[8]);assert.equal(dashboard.activeRun.id,verificationRun.run.id);
      assert.equal(dashboard.activeRun.candidateCount,1);assert.equal(dashboard.activeRun.verificationCount,1);
    });
    await verify('first confirmation is durably deferred twenty minutes and cannot be claimed immediately',async()=>{
      assert.equal(await store.claimWork(ids[8],verificationRun.run.id),null);
      const scheduled=await client.query(`SELECT r.verification_round,r.verification_max_rounds,
        w.next_attempt_at=a.observed_at+interval '20 minutes' AS spaced
        FROM sajda.lost_domain_runs r JOIN sajda.lost_domain_work_items w ON w.run_id=r.id AND w.owner_id=r.owner_id AND w.verification_round=1
        JOIN sajda.lost_domain_assessments a ON a.run_id=r.id AND a.owner_id=r.owner_id AND a.work_id=$3::uuid
        WHERE r.owner_id=$1 AND r.id=$2::uuid`,[ids[8],verificationRun.run.id,initialLease.workId]);
      assert.deepEqual(scheduled.rows[0],{verification_round:1,verification_max_rounds:3,spaced:true});
      const dashboard=await store.getDashboard(ids[8]);
      assert.equal(dashboard.activeRun.verificationRound,1);assert.equal(dashboard.activeRun.verificationMaxRounds,3);
      assert.ok(Date.parse(dashboard.activeRun.nextCheckAt)>Date.now());
    });
    // Fast-forward only queue due times inside this rollback fixture. Observation
    // payloads and timestamps remain immutable; this validates SQL scheduling,
    // not passage of real time or any real-world investment conclusion.
    await client.query('SAVEPOINT repeated_confirmation_fixture');
    await verify('three bounded confirmation rounds retain all immutable observations and stop after round three',async()=>{
      for(const [index,gap] of [1200,7200,43200].entries()) {
        const round=index+1;
        const pending=await client.query(`SELECT w.id,w.next_attempt_at,a.observed_at,
            w.next_attempt_at=a.observed_at+make_interval(secs=>$3::int) AS spaced
          FROM sajda.lost_domain_work_items w JOIN sajda.lost_domain_assessments a ON a.run_id=w.run_id AND a.owner_id=w.owner_id
          JOIN sajda.lost_domain_work_items preceding ON preceding.id=a.work_id AND preceding.verification_round=$2::int-1
          WHERE w.run_id=$1::uuid AND w.verification_round=$2::int`,[verificationRun.run.id,round,gap]);
        assert.equal(pending.rows.length,1);assert.equal(pending.rows[0].spaced,true);
        assert.equal(await store.claimWork(ids[8],verificationRun.run.id),null);
        await client.query("UPDATE sajda.lost_domain_work_items SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",[pending.rows[0].id]);
        const leased=await store.claimWork(ids[8],verificationRun.run.id);assert.ok(leased);assert.equal(leased.verificationRound,round);
        const observed=await discoveryEngine.inspectCandidate(leased.candidate);
        const completed={kind:'candidate',assessment:observed};
        assert.equal((await store.finishWork(leased,completed)).applied,true);
        assert.equal((await store.finishWork(leased,completed)).applied,true,'Duplicate completion cannot create another round');
      }
      assert.equal(await store.claimWork(ids[8],verificationRun.run.id),null);
      const dashboard=await store.getDashboard(ids[8]);assert.equal(dashboard.activeRun,null);
      assert.equal(dashboard.latestReport.run.verificationRound,3);assert.equal(dashboard.latestReport.run.verificationCount,3);
      const immutable=await client.query('SELECT count(*)::int AS observations FROM sajda.lost_domain_assessments WHERE owner_id=$1 AND run_id=$2::uuid',[ids[8],verificationRun.run.id]);
      assert.equal(immutable.rows[0].observations,4);
    });
    await client.query('ROLLBACK TO SAVEPOINT repeated_confirmation_fixture');await client.query('RELEASE SAVEPOINT repeated_confirmation_fixture');
    await client.query("UPDATE sajda.lost_domain_work_items SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE run_id=$1::uuid AND verification_round=1",[verificationRun.run.id]);
    const finalLease=await store.claimWork(ids[8],verificationRun.run.id);assert.ok(finalLease);assert.equal(finalLease.verification,true);
    assert.equal(finalLease.candidate.domain,fixtureDomain);
    const finalAssessment=await verificationEngine(true).inspectCandidate(finalLease.candidate);
    assert.equal(finalAssessment.registryStatus,'registered');assert.equal(finalAssessment.reviewStatus,'registered');
    const finalResult={kind:'candidate',assessment:finalAssessment};
    await store.finishWork(finalLease,finalResult);
    await verify('latest registered verification replaces the earlier negative in reports without rewriting it',async()=>{
      assert.equal((await store.finishWork(finalLease,finalResult)).applied,true);
      assert.equal(await store.claimWork(ids[8],verificationRun.run.id),null,'No additional verification pass can be created');
      const dashboard=await store.getDashboard(ids[8]);assert.equal(dashboard.activeRun,null);
      assert.equal(dashboard.latestReport.run.status,'succeeded');assert.equal(dashboard.latestReport.assessments.length,1);
      assert.equal(dashboard.latestReport.assessments[0].registryStatus,'registered');assert.equal(dashboard.latestReport.assessments[0].confirmedRegistrable,false);
      assert.equal(dashboard.latestReport.run.candidateCount,1);assert.equal(dashboard.latestReport.run.verificationCount,1);
      assert.equal(dashboard.latestReport.run.completedVerificationCount,1);
      const observations=await client.query(`SELECT w.verification,a.assessment->>'registryStatus' AS registry_status
        FROM sajda.lost_domain_assessments a JOIN sajda.lost_domain_work_items w ON w.id=a.work_id AND w.owner_id=a.owner_id
        WHERE a.owner_id=$1 AND a.run_id=$2::uuid ORDER BY w.verification`,[ids[8],verificationRun.run.id]);
      assert.deepEqual(observations.rows,[{verification:false,registry_status:'registry_not_found'},{verification:true,registry_status:'registered'}]);
    });
    await client.query('ROLLBACK TO SAVEPOINT verification_fixture');await client.query('RELEASE SAVEPOINT verification_fixture');

    await client.query('SAVEPOINT legacy_capacity_fixture');
    const legacyRun=await store.startRun(ids[8],randomUUID());
    await client.query(`UPDATE sajda.lost_domain_runs SET engine_version='lost-domains-v1',source_limit=3,candidate_limit=60,
      attempt_limit=80,candidates_per_source=20,run_lifetime_seconds=21600,verification_queued=true,
      verification_round=1,verification_max_rounds=1,verification_gap_seconds=ARRAY[0] WHERE owner_id=$1 AND id=$2::uuid`,[ids[8],legacyRun.run.id]);
    const legacyLease=await store.claimWork(ids[8],legacyRun.run.id);assert.ok(legacyLease);
    await client.query("UPDATE sajda.lost_domain_runs SET created_at=clock_timestamp()-interval '5 hours' WHERE owner_id=$1 AND id=$2::uuid",[ids[8],legacyRun.run.id]);
    await store.failWork(legacyLease,'rate_limited',true,new Date(Date.now()+2*3600000).toISOString());
    await verify('legacy runs retain their six-hour retry deadline and 80-attempt budget',async()=>{
      const deadline=await client.query(`SELECT w.next_attempt_at=r.created_at+make_interval(secs=>r.run_lifetime_seconds) AS clamped,
        r.source_limit,r.candidate_limit,r.attempt_limit,r.candidates_per_source,r.run_lifetime_seconds
        FROM sajda.lost_domain_runs r JOIN sajda.lost_domain_work_items w ON w.run_id=r.id AND w.owner_id=r.owner_id
        WHERE r.owner_id=$1 AND w.id=$2::uuid`,[ids[8],legacyLease.workId]);
      assert.deepEqual(deadline.rows[0],{clamped:true,source_limit:3,candidate_limit:60,attempt_limit:80,candidates_per_source:20,run_lifetime_seconds:21600});
      await client.query(`INSERT INTO sajda.lost_domain_attempts(work_id,fence,owner_id,run_id,namespace)
        SELECT w.id,n,w.owner_id,w.run_id,'development' FROM sajda.lost_domain_work_items w
        CROSS JOIN generate_series(1,80)n WHERE w.id=(SELECT id FROM sajda.lost_domain_work_items
          WHERE run_id=$1::uuid AND id<>$2::uuid ORDER BY id LIMIT 1)`,[legacyRun.run.id,legacyLease.workId]);
      assert.equal(await store.claimWork(ids[8],legacyRun.run.id),null);
    });
    await client.query('ROLLBACK TO SAVEPOINT legacy_capacity_fixture');await client.query('RELEASE SAVEPOINT legacy_capacity_fixture');

    await client.query('SAVEPOINT lifetime_budget_fixture');
    const multiDayRun=await store.startRun(ids[8],randomUUID());
    await client.query("UPDATE sajda.lost_domain_runs SET created_at=clock_timestamp()-interval '26 hours' WHERE owner_id=$1 AND id=$2::uuid",[ids[8],multiDayRun.run.id]);
    await client.query(`INSERT INTO sajda.lost_domain_attempts(work_id,fence,owner_id,run_id,namespace,started_at)
      SELECT w.id,n,w.owner_id,w.run_id,'development',clock_timestamp()-interval '25 hours'
      FROM sajda.lost_domain_work_items w CROSS JOIN generate_series(1,900)n
      WHERE w.id=(SELECT id FROM sajda.lost_domain_work_items WHERE run_id=$1::uuid ORDER BY id LIMIT 1)`,[multiDayRun.run.id]);
    await verify('a three-day run cannot reset its 900-attempt ceiling when daily usage rolls over',async()=>{
      assert.equal(await store.claimWork(ids[8],multiDayRun.run.id),null);
      const counts=await client.query(`SELECT count(*)::int AS lifetime,
        count(*) FILTER(WHERE started_at>clock_timestamp()-interval '24 hours')::int AS last_day
        FROM sajda.lost_domain_attempts WHERE run_id=$1::uuid`,[multiDayRun.run.id]);
      assert.deepEqual(counts.rows[0],{lifetime:900,last_day:0});
      const stopped=await client.query('SELECT status,failure_code FROM sajda.lost_domain_runs WHERE owner_id=$1 AND id=$2::uuid',[ids[8],multiDayRun.run.id]);
      assert.deepEqual(stopped.rows[0],{status:'failed',failure_code:'attempt_budget'});
    });
    await client.query('ROLLBACK TO SAVEPOINT lifetime_budget_fixture');await client.query('RELEASE SAVEPOINT lifetime_budget_fixture');

    const key=randomUUID();const first=await store.startRun(ids[0],key);const second=await store.startRun(ids[1],randomUUID());
    await verify('new run persists the v3 capacity and starts only the reviewed fixture sources',async()=>{
      assert.equal(first.run.status,'queued');assert.equal(first.run.sourceCount,sourceIds.length);assert.equal(first.run.candidateCount,0);
      assert.deepEqual(first.run.capacity,{sourceLimit:24,candidateLimit:600});
      const persisted=await client.query(`SELECT engine_version,source_limit,candidate_limit,attempt_limit,candidates_per_source,run_lifetime_seconds,verification_queued,
          verification_round,verification_max_rounds,verification_gap_seconds
        FROM sajda.lost_domain_runs WHERE owner_id=$1 AND id=$2::uuid`,[ids[0],first.run.id]);
      assert.deepEqual(persisted.rows[0],{engine_version:'trading-research-v3',source_limit:24,candidate_limit:600,attempt_limit:900,
        candidates_per_source:25,run_lifetime_seconds:259200,verification_queued:false,verification_round:0,verification_max_rounds:3,
        verification_gap_seconds:[1200,7200,43200]});
    });
    await verify('same request key returns the original run',async()=>{const repeat=await store.startRun(ids[0],key);assert.equal(repeat.run.id,first.run.id);assert.equal(repeat.reused,true);});
    await verify('a different request key cannot create overlapping owner work',async()=>{await assert.rejects(()=>store.startRun(ids[0],randomUUID()),expectCode('run_in_progress'));});
    const makeCandidate=(domain,source,sensitive=false)=>({domain,sourceUrl:source.url,targetUrl:`https://docs.${domain}/help`,anchor:'Synthetic fixture',sensitive});
    let commonDomain,sourceCompletion,sourceLease;
    for(let index=0;index<3;index++){
      const lease=await store.claimWork(ids[0],first.run.id);assert.ok(lease);assert.equal(lease.kind,'source');
      if(index===0){
        await verify('only one global worker may hold a lease',async()=>{assert.equal(await store.claimWork(ids[1],second.run.id),null);});
        await verify('forged owner cannot finish another account work',async()=>{assert.equal((await store.finishWork({...lease,ownerId:ids[1]},{kind:'source',candidates:[],evidence:{}})).applied,false);});
      }
      const candidates=Array.from({length:LOST_DOMAIN_LIMITS.candidatesPerSource},(_,i)=>makeCandidate(`fixture-${index}-${i}.com`,lease.source));
      if(index===0)commonDomain=candidates[0].domain;
      if(index===1)candidates.push(makeCandidate(commonDomain,lease.source,true));
      const result={kind:'source',candidates,evidence:{sourceUrl:lease.source.url,observedAt:new Date().toISOString(),links:candidates.map(({domain,sensitive})=>({domain,sensitive}))}};
      assert.equal((await store.finishWork(lease,result)).applied,true);
      if(index===0){sourceCompletion=result;sourceLease=lease;}
    }
    await verify('candidate budget is bounded and sensitive evidence merges across sources',async()=>{
      const count=await client.query("SELECT count(*)::int AS n FROM sajda.lost_domain_work_items WHERE run_id=$1::uuid AND kind='candidate' AND NOT verification",[first.run.id]);
      assert.equal(count.rows[0].n,sourceIds.length*LOST_DOMAIN_LIMITS.candidatesPerSource);
      const common=await client.query("SELECT candidate FROM sajda.lost_domain_work_items WHERE run_id=$1::uuid AND identity_key=$2 AND kind='candidate'",[first.run.id,commonDomain]);
      assert.equal(common.rows[0].candidate.sensitive,true);assert.equal(common.rows[0].candidate.sourceUrl,sourceLease.source.url);
    });
    await verify('duplicate completion produces no extra candidate rows',async()=>{assert.equal((await store.finishWork(sourceLease,sourceCompletion)).applied,true);});
    // Keep two fixture candidates; the rest emulate bounded provider failures.
    await client.query(`UPDATE sajda.lost_domain_work_items SET status='failed',failure_code='qa_provider_failed'
      WHERE owner_id=$1 AND run_id=$2::uuid AND kind='candidate' AND identity_key<>$3
        AND id<>(SELECT id FROM sajda.lost_domain_work_items WHERE owner_id=$1 AND run_id=$2::uuid AND kind='candidate' AND identity_key<>$3 ORDER BY id LIMIT 1)`,[ids[0],first.run.id,commonDomain]);
    await client.query("UPDATE sajda.lost_domain_work_items SET created_at=clock_timestamp()-interval '1 minute' WHERE run_id=$1::uuid AND kind='candidate' AND identity_key=$2",[first.run.id,commonDomain]);
    const createAssessment=candidate=>({...candidate,registryStatus:'registry_not_found',registrability:'unverified',confirmedRegistrable:false,
      reviewStatus:candidate.sensitive?'excluded':'review_candidate',risk:{level:candidate.sensitive?'excluded':'review',reasons:[candidate.sensitive?'sensitive_link':'requires_registrar_verification']},
      potentialScore:70,confidenceScore:50,evidence:candidate.sensitive?[]:[{kind:'registry',source:'https://rdap.verisign.com/com/v1/',method:'rdap',outcome:'registry_not_found',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+900000).toISOString()}]});
    const candidateLease=await store.claimWork(ids[0],first.run.id);assert.ok(candidateLease);assert.equal(candidateLease.kind,'candidate');
    assert.equal(candidateLease.candidate.sensitive,true);
    const result={kind:'candidate',assessment:createAssessment(candidateLease.candidate),qualified:true,score:100};
    await verify('assessment persists but no client flag creates confirmed registrability',async()=>{
      assert.equal((await store.finishWork(candidateLease,result)).applied,true);
      const rows=await client.query('SELECT qualified,assessment FROM sajda.lost_domain_assessments WHERE work_id=$1::uuid',[candidateLease.workId]);
      assert.equal(rows.rows[0].qualified,false);assert.equal(rows.rows[0].assessment.confirmedRegistrable,false);
      assert.equal(rows.rows[0].assessment.reviewStatus,'excluded');assert.deepEqual(rows.rows[0].assessment.evidence,[]);
      assert.equal((await store.finishWork(candidateLease,result)).applied,true);
    });
    await verify('stored assessment is immutable',async()=>{
      await client.query('SAVEPOINT immutable_fixture');
      await assert.rejects(()=>client.query('UPDATE sajda.lost_domain_assessments SET potential_score=99 WHERE work_id=$1::uuid',[candidateLease.workId]),expectCode('55000'));
      await client.query('ROLLBACK TO SAVEPOINT immutable_fixture');await client.query('RELEASE SAVEPOINT immutable_fixture');
    });
    let stale=await store.claimWork(ids[0],first.run.id);assert.ok(stale);
    await client.query("UPDATE sajda.lost_domain_work_items SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid",[stale.workId]);
    const recovered=await store.claimWork(ids[0],first.run.id);
    await verify('expired lease is recovered with a higher fence',async()=>{assert.equal(recovered.workId,stale.workId);assert.equal(recovered.fence,stale.fence+1);});
    await verify('stale worker cannot finish after recovery',async()=>{assert.equal((await store.finishWork(stale,{kind:'candidate',assessment:createAssessment(stale.candidate)})).applied,false);});
    const providerRetry=new Date(Date.now()+3600000).toISOString();
    await store.failWork(recovered,'rate_limited',true,providerRetry);
    await verify('one-hour provider backoff persists instead of burning retries every minute',async()=>{
      assert.equal(await store.claimWork(ids[0],first.run.id),null);
      const next=await client.query('SELECT next_attempt_at FROM sajda.lost_domain_work_items WHERE id=$1::uuid',[stale.workId]);
      assert.equal(new Date(next.rows[0].next_attempt_at).toISOString(),providerRetry);
    });
    await client.query('UPDATE sajda.lost_domain_work_items SET next_attempt_at=clock_timestamp() WHERE id=$1::uuid',[stale.workId]);
    stale=await store.claimWork(ids[0],first.run.id);await store.failWork(stale,'provider_timeout',true);
    await verify('third failed attempt is terminal while prior evidence remains',async()=>{
      const dash=await store.getDashboard(ids[0]);assert.equal(dash.activeRun,null);assert.equal(dash.latestReport.run.status,'partial');
      assert.equal(dash.latestReport.assessments.length,1);assert.equal(dash.latestReport.run.completedCount,sourceIds.length*LOST_DOMAIN_LIMITS.candidatesPerSource);assert.equal(dash.latestReport.run.qualifiedCount,0);
    });
    await verify('another owner cannot read or cancel a private run',async()=>{
      assert.equal((await store.getDashboard(ids[1])).latestReport,null);assert.equal(await store.cancelRun(ids[1],first.run.id),false);
    });
    await client.query('UPDATE sajda.lost_domain_access SET revoked_at=clock_timestamp() WHERE owner_id=$1',[ids[1]]);
    await verify('revoked access cannot claim or expose earlier work',async()=>{
      assert.equal(await store.claimWork(ids[1],second.run.id),null);assert.equal((await store.getDashboard(ids[1])).runs.length,0);
    });
    await verify('manual refresh cooldown is durable',async()=>{await assert.rejects(()=>store.startRun(ids[0],randomUUID()),expectCode('refresh_cooldown'));});
    await client.query("UPDATE sajda.lost_domain_runs SET created_at=clock_timestamp()-interval '6 minutes' WHERE id=$1::uuid",[first.run.id]);
    const budgetRun=await store.startRun(ids[0],randomUUID());
    const work=await client.query('SELECT id FROM sajda.lost_domain_work_items WHERE run_id=$1::uuid ORDER BY id LIMIT 1',[budgetRun.run.id]);
    await client.query(`INSERT INTO sajda.lost_domain_attempts(work_id,fence,owner_id,run_id,namespace)
      SELECT $1::uuid,n,$2,$3::uuid,'development' FROM sajda.lost_domain_runs r
      CROSS JOIN LATERAL generate_series(1,r.attempt_limit)n WHERE r.id=$3::uuid AND r.owner_id=$2`,[work.rows[0].id,ids[0],budgetRun.run.id]);
    await verify('total attempt budget prevents further provider work',async()=>{assert.equal(await store.claimWork(ids[0],budgetRun.run.id),null);});
    await verify('failed refresh preserves previous completed report',async()=>{
      const dash=await store.getDashboard(ids[0]);assert.equal(dash.latestReport.run.id,first.run.id);assert.equal(dash.runs[0].status,'failed');
    });
    await verify('owner daily run ceiling is enforced independently of retries',async()=>{await assert.rejects(()=>store.startRun(ids[0],randomUUID()),expectCode('daily_limit'));});
    await client.query('UPDATE sajda.lost_domain_access SET daily_refresh=true WHERE owner_id=$1',[ids[3]]);
    await verify('daily scheduling is opt-in, bounded and idempotent after cancellation',async()=>{
      assert.equal((await store.scheduleDailyRuns()).started,1);
      const active=(await store.getDashboard(ids[3])).activeRun;assert.ok(active);assert.equal(await store.cancelRun(ids[3],active.id),true);
      assert.equal((await store.scheduleDailyRuns()).started,0);
    });
    // Genuine empty successful reports remain distinct from failed refreshes.
    await client.query("UPDATE sajda.lost_domain_runs SET created_at=clock_timestamp()-interval '6 minutes' WHERE owner_id=$1",[ids[3]]);
    const emptyRun=await store.startRun(ids[3],randomUUID());
    for(let i=0;i<3;i++){const lease=await store.claimWork(ids[3],emptyRun.run.id);assert.ok(lease);await store.finishWork(lease,{kind:'source',candidates:[],evidence:{observedAt:new Date().toISOString()}});}
    await verify('successful zero-result run stays in history without inventing a populated report',async()=>{
      const dash=await store.getDashboard(ids[3]);assert.equal(dash.runs[0].id,emptyRun.run.id);assert.equal(dash.runs[0].status,'succeeded');assert.equal(dash.latestReport,null);
    });
    // Exercise the actual engine with injected network fixtures, then persist
    // its complete output in real PostgreSQL through a newly created store.
    const freshStore=createLostDomainsStore({pool:adapter,environment:()=>({})});
    async function fixtureRun(accountId,domains){
      const started=await freshStore.startRun(accountId,randomUUID());
      const html=domains.map(domain=>`<a href="https://${domain}/${domain==='fixturesensitive.com'?'login':'article'}">Public fixture</a>`).join('');
      const fetch=createSafeFetcher({lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async input=>{
          const parsed=input.url;let status=200,body='',contentType='text/plain';
          if(parsed.pathname!=='/robots.txt'){
            if(parsed.hostname==='example.org'){body=html;contentType='text/html';}
            else if(parsed.hostname==='rdap.verisign.com'){
              status=parsed.pathname.includes('fixtureunknown.com')?503:404;
              body=JSON.stringify({errorCode:status});contentType='application/rdap+json';
            } else {status=404;body='<html>Missing fixture</html>';contentType='text/html';}
          }
          return {url:parsed.href,status,headers:{'content-type':contentType},body};
        },
      });
      const engine=createLostDomainsEngine({fetch,
        dns:async()=>{throw Object.assign(new Error('Fixture has no DNS data'),{code:'ENOTFOUND'});},
      });
      for(let i=0;i<3;i++){
        const lease=await freshStore.claimWork(accountId,started.run.id);assert.equal(lease.kind,'source');
        const found=await engine.discoverSource({url:lease.source.url,allowedHost:lease.source.host});
        assert.equal((await freshStore.finishWork(lease,{kind:'source',candidates:found.candidates,evidence:{observedAt:found.observedAt,sourceUrl:lease.source.url}})).applied,true);
      }
      for(let i=0;i<domains.length;i++){
        const lease=await freshStore.claimWork(accountId,started.run.id);assert.equal(lease.kind,'candidate');
        const evidence=await engine.inspectCandidate(lease.candidate);
        assert.equal((await freshStore.finishWork(lease,{kind:'candidate',assessment:evidence})).applied,true);
      }
      return {started,dashboard:await freshStore.getDashboard(accountId)};
    }
    const known=await fixtureRun(ids[4],['fixtureknown.com']);
    await verify('real engine fixture output survives a fresh store instance without becoming confirmed',async()=>{
      assert.equal(known.dashboard.latestReport.run.status,'succeeded');
      assert.equal(known.dashboard.latestReport.assessments[0].registryStatus,'registry_not_found');
      assert.equal(known.dashboard.latestReport.assessments[0].confirmedRegistrable,false);
    });
    // Exact-price requests exercise real SQL, but only synthetic provider data.
    // The outer rollback prevents these fixtures from becoming live evidence.
    await client.query('SAVEPOINT quote_refresh_fixture');
    const quoteDomain='fixtureknown.com',quoteKey=randomUUID();
    const technicalBefore=await client.query('SELECT assessment,observed_at FROM sajda.lost_domain_assessments WHERE owner_id=$1 AND run_id=$2::uuid ORDER BY id',[ids[4],known.started.run.id]);
    const reservation=await freshStore.beginQuoteRefresh(ids[4],known.started.run.id,quoteDomain,quoteKey);
    assert.ok(reservation.lease);assert.equal(reservation.reused,false);
    await verify('quote refresh is owner-scoped and idempotent before the provider call',async()=>{
      assert.deepEqual(await freshStore.beginQuoteRefresh(ids[4],known.started.run.id,quoteDomain,quoteKey),{reused:true,lease:null});
      await assert.rejects(()=>freshStore.beginQuoteRefresh(ids[5],known.started.run.id,quoteDomain,randomUUID()),expectCode('quote_candidate_unavailable'));
      await assert.rejects(()=>freshStore.beginQuoteRefresh(ids[4],known.started.run.id,'anotherfixture.com',quoteKey),expectCode('quote_request_conflict'));
      await assert.rejects(()=>freshStore.beginQuoteRefresh(ids[4],known.started.run.id,quoteDomain,randomUUID()),expectCode('quote_in_progress'));
    });
    const {parsePorkbunDomainCheck}=await import('../api/_shared/lost-domains-registrar.ts');
    const quote=parsePorkbunDomainCheck(quoteDomain,{status:'SUCCESS',response:{avail:'yes',type:'registration',price:'9.73',
      regularPrice:'12.00',firstYearPromo:'yes',premium:'no',minDuration:1,additional:{renewal:{type:'renewal',price:'11.25'}}}},Date.now());
    assert.ok(quote);
    await verify('quote completion persists one immutable observation without changing technical evidence',async()=>{
      assert.equal((await freshStore.finishQuoteRefresh(reservation.lease,quote)).applied,true);
      assert.equal((await freshStore.finishQuoteRefresh(reservation.lease,quote)).applied,false);
      const dashboard=await freshStore.getDashboard(ids[4]);
      assert.equal(dashboard.quoteUpdates[quoteDomain].status,'succeeded');
      assert.deepEqual(dashboard.quoteUpdates[quoteDomain].evidence,quote);
      const technicalAfter=await client.query('SELECT assessment,observed_at FROM sajda.lost_domain_assessments WHERE owner_id=$1 AND run_id=$2::uuid ORDER BY id',[ids[4],known.started.run.id]);
      assert.deepEqual(technicalAfter.rows,technicalBefore.rows);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM sajda.lost_domain_quote_observations WHERE request_id=$1::uuid',[reservation.lease.id])).rows[0].count,1);
      await client.query('SAVEPOINT quote_immutable_fixture');
      await assert.rejects(()=>client.query("UPDATE sajda.lost_domain_quote_observations SET evidence=evidence||'{\"annualRegistrationMinor\":1}'::jsonb WHERE request_id=$1::uuid",[reservation.lease.id]),expectCode('55000'));
      await client.query('ROLLBACK TO SAVEPOINT quote_immutable_fixture');await client.query('RELEASE SAVEPOINT quote_immutable_fixture');
    });
    await client.query("UPDATE sajda.lost_domain_quote_requests SET requested_at=clock_timestamp()-interval '2 minutes' WHERE id=$1::uuid",[reservation.lease.id]);
    const unsuccessful=await freshStore.beginQuoteRefresh(ids[4],known.started.run.id,quoteDomain,randomUUID());
    assert.ok(unsuccessful.lease);
    await verify('failed price update preserves the previous dated quote',async()=>{
      assert.equal((await freshStore.finishQuoteRefresh(unsuccessful.lease,null,'provider_unavailable')).applied,true);
      const dashboard=await freshStore.getDashboard(ids[4]);
      assert.equal(dashboard.quoteUpdates[quoteDomain].status,'failed');
      assert.deepEqual(dashboard.quoteUpdates[quoteDomain].evidence,quote);
    });
    await client.query('ROLLBACK TO SAVEPOINT quote_refresh_fixture');await client.query('RELEASE SAVEPOINT quote_refresh_fixture');
    await client.query("UPDATE sajda.lost_domain_runs SET created_at=clock_timestamp()-interval '6 minutes' WHERE owner_id=$1",[ids[4]]);
    const unknown=await fixtureRun(ids[4],['fixtureunknown.com']);
    await verify('all-unknown registry refresh fails and preserves the previous useful report',async()=>{
      assert.equal(unknown.dashboard.runs[0].status,'failed');assert.equal(unknown.dashboard.runs[0].failureCode,'registry_inconclusive');
      assert.equal(unknown.dashboard.latestReport.run.id,known.started.run.id);
      const persisted=await client.query('SELECT assessment FROM sajda.lost_domain_assessments WHERE owner_id=$1 AND run_id=$2::uuid',[ids[4],unknown.started.run.id]);
      assert.equal(persisted.rows[0].assessment.registryStatus,'unknown');
    });
    const mixed=await fixtureRun(ids[5],['fixtureknown.com','fixtureunknown.com','fixturesensitive.com']);
    await verify('mixed registry results are partial while sensitive exclusions retain zero-fetch evidence',async()=>{
      assert.equal(mixed.dashboard.latestReport.run.status,'partial');assert.equal(mixed.dashboard.latestReport.assessments.length,3);
      const sensitive=mixed.dashboard.latestReport.assessments.find(item=>item.domain==='fixturesensitive.com');
      assert.equal(sensitive.reviewStatus,'excluded');assert.equal(sensitive.registryStatus,'unknown');assert.deepEqual(sensitive.evidence,[]);
    });
    const expiredRun=await store.startRun(ids[6],randomUUID());
    const expiredLease=await store.claimWork(ids[6],expiredRun.run.id);
    await client.query("UPDATE sajda.lost_domain_access SET valid_from=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1",[ids[6]]);
    await verify('access expiring during work prevents completion and private dashboard disclosure',async()=>{
      assert.equal((await store.finishWork(expiredLease,{kind:'source',candidates:[],evidence:{}})).applied,false);
      assert.equal((await freshStore.getDashboard(ids[6])).access.allowed,false);assert.deepEqual((await freshStore.getDashboard(ids[6])).runs,[]);
    });
    const policyRun=await store.startRun(ids[7],randomUUID());
    const policyLease=await store.claimWork(ids[7],policyRun.run.id);
    await client.query("UPDATE sajda.lost_domain_sources SET policy_reviewed_at=clock_timestamp()-interval '2 days',policy_expires_at=clock_timestamp()-interval '1 second' WHERE id=ANY($1::uuid[])",[sourceIds]);
    await verify('source policy expiring during work rejects completion and new source listing',async()=>{
      assert.equal((await store.finishWork(policyLease,{kind:'source',candidates:[],evidence:{}})).applied,false);
      assert.deepEqual(await freshStore.listSources(),[]);assert.equal(await store.cancelRun(ids[7],policyRun.run.id),true);
    });
    // Assert SQL FK scoping and NULL-proof immutable evidence independently.
    await verify('assessment cannot be linked to the wrong owner',async()=>{
      await client.query('SAVEPOINT foreign_fixture');
      await assert.rejects(()=>client.query(`INSERT INTO sajda.lost_domain_assessments
        (id,owner_id,run_id,work_id,domain,potential_score,confidence_score,assessment)
        VALUES($1::uuid,$2,$3::uuid,$4::uuid,'other.com',1,1,'{"domain":"other.com","registrability":"unverified","confirmedRegistrable":false}')`,
      [randomUUID(),ids[1],first.run.id,stale.workId]),expectCode('23503'));
      await client.query('ROLLBACK TO SAVEPOINT foreign_fixture');await client.query('RELEASE SAVEPOINT foreign_fixture');
    });
    await client.query('ROLLBACK');open=false;
    await verify('all synthetic users, grants, sources and job data are absent after rollback',async()=>{
      const result=await client.query(`SELECT
        (SELECT count(*)::int FROM public.sajda_auth_user WHERE id=ANY($1::text[])) AS users,
        (SELECT count(*)::int FROM sajda.lost_domain_access WHERE owner_id=ANY($1::text[])) AS grants,
        (SELECT count(*)::int FROM sajda.lost_domain_sources WHERE id=ANY($2::uuid[])) AS sources,
        (SELECT count(*)::int FROM sajda.lost_domain_runs WHERE owner_id=ANY($1::text[])) AS runs,
        (SELECT count(*)::int FROM sajda.lost_domain_assessments WHERE owner_id=ANY($1::text[])) AS assessments,
        (SELECT count(*)::int FROM sajda.lost_domain_quote_requests WHERE owner_id=ANY($1::text[])) AS quote_requests,
        (SELECT count(*)::int FROM sajda.lost_domain_quote_observations WHERE owner_id=ANY($1::text[])) AS quote_observations`,[ids,sourceIds]);
      assert.deepEqual(result.rows[0],{users:0,grants:0,sources:0,runs:0,assessments:0,quote_requests:0,quote_observations:0});
    });
    console.log(JSON.stringify({status:'PASS',checks:passed.length,verified:passed,persistentFixtures:0,externalProviderCalls:0,mode:'actual PostgreSQL, rollback-only fixtures and savepoint-bound store transactions'},null,2));
  }catch{console.error(JSON.stringify({status:'FAIL',check:label,completedChecks:passed.length,...(lastSqlFailure?{database:lastSqlFailure}:{})}));process.exitCode=1;}
  finally{if(client){if(open)await client.query('ROLLBACK').catch(()=>{process.exitCode=1;});client.release();}await pool.end();}
}
main().catch(()=>{console.error(JSON.stringify({status:'FAIL',check:'Configuration/setup validation; no secrets printed.'}));process.exitCode=1;});

import assert from "node:assert/strict";
import test from "node:test";
import { createLostDomainsService } from "../api/_shared/lost-domains-service.js";
import { createLostDomainsEngine, type Assessment } from "../api/_shared/lost-domains-engine.js";
import { createSafeFetcher } from "../api/_shared/lost-domains-fetch.js";
import { buildDomainArchiveQuery } from "../api/_shared/lost-domains-archive.js";
import { isTradingArchiveEvidence, type TradingArchiveEvidence } from "../shared/trading-archive.js";
import { parsePorkbunDomainCheck } from "../api/_shared/lost-domains-registrar.js";
import { LostDomainsStoreError, type LostWorkLease, type LostWorkResult, type LostDashboard,
  type LostRun, type lostDomainsStore } from "../api/_shared/lost-domains-store.js";

const owner = "fixture-owner";
const runId = "10000000-0000-4000-8000-000000000001";
const source = { id: "10000000-0000-4000-8000-000000000002", name: "Reviewed fixture", url: "https://source.example.com/resources",
  host: "source.example.com", robotsUrl: "https://source.example.com/robots.txt",
  policyReviewedAt: "2026-09-01T00:00:00Z", policyExpiresAt: "2026-09-30T00:00:00Z" };
const candidate = { domain: "alpha.dev", sourceUrl: source.url, targetUrl: "https://alpha.dev/resource", anchor: "Independent resource", sensitive: false };
function lease(kind: "source" | "candidate" = "candidate"): LostWorkLease {
  return { ownerId: owner, runId, workId: "10000000-0000-4000-8000-000000000003", token: "10000000-0000-4000-8000-000000000004",
    fence: 1, kind, source, candidate: kind === "candidate" ? candidate : null, expiresAt: new Date(Date.now() + 45_000).toISOString() };
}
function run(status: LostRun["status"] = "succeeded", id = runId): LostRun {
  const date = new Date(Date.now() - 60_000).toISOString();
  return { id, status, createdAt: date, updatedAt: date, finishedAt: ["queued", "running"].includes(status) ? null : date,
    totalWork: 2, completedWork: 2, failedWork: 0, assessmentCount: 1, sourceCount: 1, candidateCount: 1,
    completedCount: 1, failedCount: 0, qualifiedCount: 0, failureCode: null };
}
function assessment(domain = candidate.domain, observed = Date.now() - 1_000): Assessment {
  return { ...candidate, domain, targetUrl: `https://${domain}/resource`, registryStatus: "registry_not_found",
    registrability: "unverified", confirmedRegistrable: false, reviewStatus: "review_candidate",
    risk: { level: "review", reasons: ["registrar_not_checked"] }, potentialScore: 30, confidenceScore: 35,
    evidence: [
      { kind: "registry", source: `https://pubapi.registry.google/rdap/domain/${domain}`, method: "rdap", outcome: "registry_not_found", details: { httpStatus: 404 } },
      { kind: "dns", source: "system-dns-resolver", method: "address_lookup", outcome: "no_address" },
      { kind: "mail", source: "system-dns-resolver", method: "mx_lookup", outcome: "no_explicit_mx" },
      { kind: "target_http", source: `https://${domain}/`, method: "https_get", outcome: "unreachable", details: { error: "dns_unavailable", scope: "apex" } },
    ].map(row => ({ ...row, observedAt: new Date(observed).toISOString(), expiresAt: new Date(observed + 15 * 60_000).toISOString() })) as Assessment["evidence"] };
}
function harness() {
  const calls: unknown[][] = [], finished: { lease: LostWorkLease; result: LostWorkResult }[] = [];
  const failed: { lease: LostWorkLease; code: string; retryable: boolean; notBefore?: string }[] = [];
  const state = { next: lease() as LostWorkLease | null, allowed: true, engineCalls: 0,
    dashboard: { access: { allowed: true, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), dailyRefresh: true },
      sources: [source], runs: [run()], activeRun: null, latestReport: { run: run(), assessments: [assessment()] } } as LostDashboard };
  const store: typeof lostDomainsStore = {
    beginQuoteRefresh:async()=>({reused:true,lease:null}),finishQuoteRefresh:async()=>({applied:false}),
    readAccess: async id => { calls.push(["access", id]); return { allowed: state.allowed, expiresAt: null, dailyRefresh: false }; },
    listSources: async () => [source],
    startRun: async (id, key) => { calls.push(["start", id, key]); return { run: run("queued"), reused: false }; },
    getDashboard: async id => { calls.push(["read", id]); return state.dashboard; },
    claimWork: async (id, selectedRun) => {
      calls.push(["claim", id, selectedRun]);
      if (id !== undefined && (id !== owner || selectedRun !== runId)) return null;
      const value = state.next; state.next = null; return value;
    },
    finishWork: async (ownedLease, result) => { finished.push({ lease: ownedLease, result }); return { applied: true, runStatus: "succeeded" }; },
    failWork: async (ownedLease, code, retryable = true, notBefore) => {
      failed.push({ lease: ownedLease, code, retryable, notBefore }); return { applied: true, runStatus: "running" };
    },
    cancelRun: async (id, selectedRun) => { calls.push(["cancel", id, selectedRun]); return true; },
    scheduleDailyRuns: async () => { calls.push(["schedule"]); return { started: 1, reused: 0, skipped: 0 }; },
  };
  const engine = {
    discoverSource: async (_input: { url: string; allowedHost: string; maxLinks?: number; rotationKey?: string }) => {
      state.engineCalls++; return { candidates: [candidate], observedAt: new Date().toISOString() };
    },
    inspectCandidate: async (_input: typeof candidate) => { state.engineCalls++; return assessment(); },
  };
  return { store, engine, state, calls, finished, failed };
}

test("deep report uses account-scoped full observations, re-evaluates freshness and never fabricates a purchase signal", async()=>{
  const fake=harness(),now=Date.now(),current=assessment(candidate.domain,now-1000);
  fake.state.dashboard.latestReport!.assessments=[current];
  fake.state.dashboard.sourceApprovals={[candidate.domain]:true};
  fake.state.dashboard.researchObservations={[candidate.domain]:[13,2].map(hours=>{
    const at=now-hours*3600000;
    return {...assessment(candidate.domain,at),observedAt:new Date(at).toISOString()};
  })};
  const service=createLostDomainsService({store:fake.store,engine:fake.engine,now:()=>now});
  const fresh=await service.read(owner),row=fresh.candidates[0];
  assert.equal(row.dossier?.status,"ready_for_price_review");
  assert.equal(row.dossier?.temporal.stableChecks,3);
  assert.equal(row.acquisition?.status,"research_only");
  assert.equal(row.acquisition?.priceSignal,"none");
  assert.ok(row.acquisition?.missingChecks.includes("exact_quote"));
  assert.ok(row.acquisition?.missingChecks.includes("valuation"));
  assert.equal("researchObservations" in fresh,false);
  assert.equal("sourceApprovals" in fresh,false);
  assert.equal(current.dossier,undefined,"read enrichment does not mutate immutable stored assessments");
  fake.state.dashboard.supersededDomains=[candidate.domain];
  const superseded=await service.read(owner);
  assert.notEqual(superseded.candidates[0].dossier?.status,"ready_for_price_review");
  assert.equal("supersededDomains" in superseded,false);
  fake.state.dashboard.supersededDomains=[];
  const stale=await createLostDomainsService({store:fake.store,now:()=>now+16*60000}).read(owner);
  assert.notEqual(stale.candidates[0].dossier?.status,"ready_for_price_review");
  assert.equal(stale.candidates[0].acquisition?.readyForAcquisitionReview,false);
  fake.state.dashboard.sourceApprovals={[candidate.domain]:false};
  const revoked=await service.read(owner);
  assert.equal(revoked.candidates[0].dossier?.status,"reject");
  assert.equal(revoked.candidates[0].acquisition?.status,"excluded");
});

test("summary counts and old derived fields cannot bypass dossier source or temporal gates",async()=>{
  const fake=harness(),now=Date.now();
  fake.state.dashboard.sourceApprovals={[candidate.domain]:true};
  fake.state.dashboard.researchObservations={[candidate.domain]:[13,2].map(hours=>({
    domain:candidate.domain,observedAt:new Date(now-hours*3600000).toISOString(),registryStatus:"registry_not_found",
  }))};
  const result=await createLostDomainsService({store:fake.store,now:()=>now}).read(owner);
  assert.equal(result.candidates[0].dossier?.temporal.stableChecks,1);
  assert.notEqual(result.candidates[0].dossier?.status,"ready_for_price_review");
  assert.equal(result.candidates[0].acquisition?.readyForAcquisitionReview,false);
});

test("active run reports durable verification phase and next check without waiting in a function",async()=>{
  const fake=harness(),next=new Date(Date.now()+12*3600000).toISOString();
  fake.state.dashboard.activeRun={...run("running"),verificationRound:3,verificationMaxRounds:3,
    verificationCount:90,completedVerificationCount:60,nextCheckAt:next};
  const result=await createLostDomainsService({store:fake.store}).read(owner);
  assert.equal(result.activeRun?.verificationRound,3);
  assert.equal(result.activeRun?.verificationMaxRounds,3);
  assert.equal(result.activeRun?.verificationCount,90);
  assert.equal(result.activeRun?.nextCheckAt,next);
  assert.equal(fake.state.engineCalls,0);
});

test("exact-domain price enrichment only runs in the final durable phase and does not invent costs or value",async()=>{
  for(const round of [0,1,2,3]) {
    const fake=harness(),now=Date.now();
    fake.state.next={...lease(),verification:round>0,verificationRound:round};
    let checks=0;
    const observed=parsePorkbunDomainCheck(candidate.domain,{status:"SUCCESS",response:{avail:"yes",type:"registration",
      price:"9.73",regularPrice:"10.73",minDuration:1,firstYearPromo:"yes",premium:"no",
      additional:{renewal:{type:"renewal",price:"12.50"}}}},now)!;
    const service=createLostDomainsService({store:fake.store,engine:fake.engine,now:()=>now,
      registrarEnabled:()=>true,registrar:async(domain,options)=>{
        checks++;assert.equal(domain,candidate.domain);assert.ok(options?.signal);
        return observed;
      }});
    await service.advance(owner,runId);
    assert.equal(checks,round===3?1:0);
    const saved=fake.finished[0].result;
    assert.equal(saved.kind,"candidate");
    if(saved.kind!=="candidate" || round!==3)continue;
    assert.deepEqual(saved.assessment.registrar,observed);
    fake.state.dashboard.latestReport!.assessments=[saved.assessment];
    fake.state.dashboard.sourceApprovals={[candidate.domain]:true};
    const read=await service.read(owner),acquisition=read.candidates[0].acquisition!;
    assert.equal(acquisition.gates.registrability,true);
    assert.equal(acquisition.gates.exact_quote,true);
    assert.equal(acquisition.gates.renewal,false,"reported renewal price has no established renewal term");
    assert.equal(acquisition.status,"due_diligence_required");
    assert.equal(acquisition.readyForAcquisitionReview,false);
    assert.deepEqual(acquisition.totalCostScenarios,[]);
    assert.equal(acquisition.priceSignal,"none");
    const later=await createLostDomainsService({store:fake.store,now:()=>now+300001}).read(owner);
    assert.equal(later.candidates[0].acquisition?.gates.exact_quote,false);
    assert.equal(later.candidates[0].registrar?.checkedAt,observed.checkedAt,"read never renews a quote timestamp");
  }
});

test("optional quote failure preserves technical completion; revoked, disabled, sensitive and short leases do no quote work",async()=>{
  const fake=harness();
  fake.state.next={...lease(),verification:true,verificationRound:3};
  await createLostDomainsService({store:fake.store,engine:fake.engine,registrarEnabled:()=>true,
    registrar:async()=>{throw new Error("Simulated optional provider failure");}}).advance(owner,runId);
  assert.equal(fake.finished.length,1);
  assert.equal(fake.failed.length,0);
  for(const variant of ["disabled","short_lease","sensitive","revoked"]) {
    const f=harness();f.state.next={...lease(),verification:true,verificationRound:3};
    if(variant==="short_lease")f.state.next.expiresAt=new Date(Date.now()+4000).toISOString();
    if(variant==="revoked")f.state.allowed=false;
    if(variant==="sensitive")f.engine.inspectCandidate=async()=>({...assessment(),sensitive:true,reviewStatus:"excluded",
      risk:{level:"excluded",reasons:["sensitive_dependency"]}});
    let called=false;
    const service=createLostDomainsService({store:f.store,engine:f.engine,registrarEnabled:()=>variant!=="disabled",
      registrar:async()=>{called=true;throw new Error("Must not call");}});
    if(variant==="revoked")await assert.rejects(()=>service.advance(owner,runId));
    else await service.advance(owner,runId);
    assert.equal(called,false,variant);
  }
});

test("a registrar rejection stays visible as diagnostics but cannot lead the technical opportunity list",async()=>{
  const fake=harness(),now=Date.now(),first=assessment("alpha.dev",now-1000),second=assessment("beta.dev",now-1000);
  first.registrar=parsePorkbunDomainCheck(first.domain,{status:"SUCCESS",response:{avail:"no",type:"registration",
    price:"9.73",minDuration:1,firstYearPromo:"no",premium:"no"}},now)!;
  fake.state.dashboard.latestReport!.assessments=[first,second];
  fake.state.dashboard.sourceApprovals={"alpha.dev":true,"beta.dev":true};
  const result=await createLostDomainsService({store:fake.store,now:()=>now}).read(owner);
  assert.equal(result.candidates[0].domain,"beta.dev");
  assert.equal(result.candidates[1].acquisition?.status,"excluded");
  assert.equal(result.candidates[1].acquisition?.priceSignal,"none");
});

test("service carries real engine source provenance through a bounded source-to-candidate completion", async () => {
  const fake = harness(), observed = Date.now() - 1_000, requests: string[] = [];
  fake.state.next = lease("source");
  const fetch = createSafeFetcher({ now: () => observed, lookup: async () => [{ address: "93.184.216.34", family: 4 }], transport: async input => {
    requests.push(input.url.href);
    const response = input.url.pathname === "/robots.txt" ? { status: 200, headers: { "content-type": "text/plain" }, body: "" }
      : input.url.hostname === source.host ? { status: 200, headers: { "content-type": "text/html" }, body: '<a href="https://alpha.dev/resource">Independent resource</a>' }
      : input.url.hostname === "pubapi.registry.google" ? { status: 404, headers: { "content-type": "application/rdap+json" }, body: '{"errorCode":404}' }
      : { status: 404, headers: { "content-type": "text/html" }, body: "Missing document" };
    return { ...response, url: input.url.href };
  } });
  const engine = createLostDomainsEngine({ fetch, now: () => observed, dns: async () => { throw Object.assign(new Error(), { code: "ENOTFOUND" }); } });
  const finish = fake.store.finishWork;
  fake.store.finishWork = async (ownedLease, result) => {
    if (result.kind === "source") fake.state.next = { ...lease(), candidate: result.candidates[0] };
    return finish(ownedLease, result);
  };
  const service = createLostDomainsService({ store: fake.store, engine });
  assert.equal(await service.advance(owner, runId), true); assert.equal(await service.advance(owner, runId), true);
  assert.equal(fake.finished.length, 2); assert.equal(fake.failed.length, 0);
  const discovery = fake.finished[0].result;
  assert.equal(discovery.kind, "source"); if (discovery.kind !== "source") return;
  assert.deepEqual(discovery.candidates, [candidate]);
  assert.equal(discovery.evidence.method, "robots_checked_https_html");
  assert.equal(discovery.evidence.observedAt, new Date(observed).toISOString());
  const reviewed = fake.finished[1].result;
  assert.equal(reviewed.kind, "candidate"); if (reviewed.kind !== "candidate") return;
  assert.equal(reviewed.assessment.registryStatus, "registry_not_found"); assert.equal(reviewed.assessment.confirmedRegistrable, false);
  assert.equal(reviewed.assessment.reviewStatus, "inconclusive");
  assert.equal(reviewed.assessment.opportunity?.tier, "watch");
  assert.equal(reviewed.assessment.sourceUrl, source.url); assert.equal(reviewed.assessment.targetUrl, candidate.targetUrl);
  assert.ok(requests.includes(source.robotsUrl)); assert.ok(requests.includes("https://alpha.dev/robots.txt"));
  assert.ok(requests.includes("https://pubapi.registry.google/rdap/domain/alpha.dev"));
  assert.deepEqual(fake.calls.filter(call => call[0] === "claim"), [["claim", owner, runId], ["claim", owner, runId]]);
});

test("service uses only server-leased source settings with a sixty-link discovery bound", async () => {
  const fake = harness(); fake.state.next = lease("source");
  fake.engine.discoverSource = async input => {
    assert.deepEqual(input, { url: source.url, allowedHost: source.host, maxLinks: 60, rotationKey: runId });
    return { candidates: [], observedAt: new Date().toISOString() };
  };
  await createLostDomainsService(fake).advance(owner, runId);
  assert.equal(fake.finished.length, 1); assert.deepEqual(fake.finished[0].lease.source, source);
});

test("service denies unpaid work and forwards exact owner/run scope without provider work", async () => {
  const fake = harness(), service = createLostDomainsService(fake);
  fake.state.allowed = false;
  await assert.rejects(service.advance(owner, runId), { code: "plus_required", status: 403 });
  assert.equal(fake.calls.some(call => call[0] === "claim"), false);
  fake.state.allowed = true;
  assert.equal(await service.advance("another-owner", runId), false);
  assert.equal(await service.advance(owner, source.id), false);
  assert.equal(fake.state.engineCalls, 0); assert.equal(fake.finished.length, 0);
  await service.start(owner, source.id); await service.cancel(owner, runId);
  assert.ok(fake.calls.some(call => JSON.stringify(call) === JSON.stringify(["start", owner, source.id])));
  assert.ok(fake.calls.some(call => JSON.stringify(call) === JSON.stringify(["cancel", owner, runId])));
});

test("rate-limited registry observations persist the latest durable retry time instead of completion", async () => {
  const fake = harness(), result = assessment();
  result.registryStatus = "unknown"; result.reviewStatus = "inconclusive"; result.evidence[0].outcome = "rate_limited";
  const observedRetry = new Date(Date.now() + 5 * 60_000).toISOString(), storedRetry = new Date(Date.now() + 10 * 60_000).toISOString();
  result.evidence[0].details = { retryAt: observedRetry };
  fake.engine.inspectCandidate = async () => result;
  const service = createLostDomainsService({ ...fake, registryRetryAt: async endpoint => {
    assert.equal(endpoint, result.evidence[0].source); return storedRetry;
  } });
  assert.equal(await service.advance(owner, runId), true);
  assert.equal(fake.finished.length, 0); assert.equal(fake.failed.length, 1);
  assert.deepEqual(fake.failed[0], { lease: leaseWithSameExpiry(fake.failed[0].lease), code: "registry_rate_limited", retryable: true, notBefore: storedRetry });
});

// The lease's issued expiry is intentionally not re-created against a moving clock.
function leaseWithSameExpiry(value: LostWorkLease): LostWorkLease { return { ...lease(), expiresAt: value.expiresAt }; }

test("unavailable backoff storage uses a bounded delay; absurd Retry-After is capped to one day", async () => {
  for (const retryAt of [undefined, new Date(Date.now() + 7 * 86_400_000).toISOString()]) {
    const fake = harness(), result = assessment(); result.evidence[0].outcome = "rate_limited";
    result.evidence[0].details = retryAt ? { retryAt } : {};
    fake.engine.inspectCandidate = async () => result;
    const before = Date.now();
    await createLostDomainsService({ ...fake, registryRetryAt: async () => { throw new Error("Private database failure"); } }).advance(owner, runId);
    const after = Date.now(), next = Date.parse(fake.failed[0].notBefore!);
    assert.ok(next >= before + 60_000 && next <= after + 86_400_000);
    if (retryAt) assert.ok(next >= before + 86_400_000);
    assert.equal(fake.finished.length, 0); assert.equal(fake.failed[0].code, "registry_rate_limited");
    assert.doesNotMatch(JSON.stringify(fake.failed), /Private database/u);
  }
});

test("transient RDAP unknown retries, while unsupported registries remain honest observations", async () => {
  for (const method of ["rdap", "none"]) {
    const fake = harness(), result = assessment(); result.registryStatus = "unknown"; result.reviewStatus = "inconclusive";
    result.evidence[0].outcome = "unknown"; result.evidence[0].method = method;
    fake.engine.inspectCandidate = async () => result;
    await createLostDomainsService(fake).advance(owner, runId);
    assert.equal(fake.finished.length, method === "none" ? 1 : 0); assert.equal(fake.failed.length, method === "rdap" ? 1 : 0);
    if (method === "rdap") assert.equal(fake.failed[0].code, "registry_unavailable");
  }
});

test("protected sensitive links complete as exclusions without registry or HTTP investigation", async () => {
  const fake = harness(); fake.state.next = { ...lease(), candidate: { ...candidate, sensitive: true } };
  let networkCalls = 0;
  const engine = createLostDomainsEngine({ fetch: async () => { networkCalls++; throw new Error("Must not fetch"); },
    dns: async () => { networkCalls++; throw new Error("Must not resolve"); } });
  await createLostDomainsService({ store: fake.store, engine }).advance(owner, runId);
  assert.equal(networkCalls, 0); assert.equal(fake.failed.length, 0);
  const result = fake.finished[0].result; assert.equal(result.kind, "candidate");
  if (result.kind === "candidate") { assert.equal(result.assessment.reviewStatus, "excluded"); assert.equal(result.assessment.evidence.length, 0); }
});

test("excluded active-dependency observations are persisted even with unavailable RDAP", async () => {
  const fake = harness(), result = assessment(); result.registryStatus = "unknown"; result.reviewStatus = "excluded";
  result.risk = { level: "excluded", reasons: ["active_mail_dependency"] }; result.evidence[0].outcome = "unknown";
  fake.engine.inspectCandidate = async () => result;
  await createLostDomainsService(fake).advance(owner, runId);
  assert.equal(fake.failed.length, 0); assert.equal(fake.finished.length, 1);
});

test("an uncertain completion commit never repeats provider work or invokes failWork", async () => {
  const fake = harness(); fake.store.finishWork = async () => { throw new LostDomainsStoreError("lost_domains_unavailable", 503); };
  await assert.rejects(createLostDomainsService(fake).advance(owner, runId), { code: "lost_domains_unavailable", status: 503 });
  assert.equal(fake.state.engineCalls, 1); assert.equal(fake.failed.length, 0);
  assert.equal(fake.calls.filter(call => call[0] === "claim").length, 1);
});

test("source failures are sanitized and permanent robot denial cannot be retried", async () => {
  for (const code of ["robots_disallowed", "robots_unavailable", "Private SQL Error"]) {
    const fake = harness(); fake.state.next = lease("source");
    fake.engine.discoverSource = async () => { throw Object.assign(new Error("Private response body"), { code }); };
    await createLostDomainsService(fake).advance(owner, runId);
    assert.equal(fake.finished.length, 0); assert.equal(fake.failed[0].code, code === "Private SQL Error" ? "provider_failed" : code);
    assert.equal(fake.failed[0].retryable, code !== "robots_disallowed");
    assert.doesNotMatch(JSON.stringify(fake.failed), /Private/u);
  }
});

test("read preserves prior report alongside a failed attempt and prioritizes fresh ranked evidence", async () => {
  const fake = harness(), low = assessment("low.dev"), high = assessment("high.dev"), stale = assessment("stale.dev", Date.now() - 16 * 60_000);
  // A failed website check ranks below four corroborating observations, even
  // if stale legacy naming/coverage fields claim the opposite ordering.
  high.confidenceScore = 0; high.potentialScore = 0; low.confidenceScore = 100; low.potentialScore = 100;
  low.evidence[3] = { ...low.evidence[3], outcome: "unknown", details: { error: "robots_disallowed" } };
  const prior = run(), failedAttempt = run("failed", source.id);
  fake.state.dashboard.runs = [failedAttempt, prior];
  fake.state.dashboard.latestReport = { run: prior, assessments: [stale, low, high] };
  const original = structuredClone(fake.state.dashboard.latestReport);
  const snapshot = await createLostDomainsService(fake).read(owner);
  assert.equal(snapshot.latestRun?.id, prior.id); assert.equal(snapshot.latestAttempt?.id, failedAttempt.id);
  assert.deepEqual(snapshot.candidates.map(item => item.domain), ["high.dev", "low.dev", "stale.dev"]);
  assert.deepEqual(fake.state.dashboard.latestReport, original); assert.deepEqual(snapshot.candidates[2].evidence, stale.evidence);
  assert.ok(snapshot.candidates.every(item => item.confirmedRegistrable === false));
});

test("read retains candidates beyond the thirty-row priority queue with recomputed diagnostics", async () => {
  const fake = harness();
  fake.state.dashboard.latestReport!.assessments = Array.from({ length: 35 }, (_unused, index) => assessment(`resource${index}.dev`));
  const snapshot = await createLostDomainsService(fake).read(owner);
  assert.equal(snapshot.candidates.length, 35);
  assert.equal(new Set(snapshot.candidates.map(row => row.domain)).size, 35);
  assert.ok(snapshot.candidates.every(row => row.opportunity?.tier === "priority_review" && row.opportunityScore === row.opportunity.score));
});

test("read with revoked access hides all prior reports and source inventory", async () => {
  const fake = harness(); fake.state.dashboard.access.allowed = false;
  const snapshot = await createLostDomainsService(fake).read(owner);
  assert.deepEqual(snapshot, { access: false, sourcesAvailable: 0, activeRun: null, latestRun: null, latestAttempt: null, candidates: [] });
});

test("one cron tick schedules once and stops after the available globally leased work", async () => {
  const fake = harness(), service = createLostDomainsService(fake);
  assert.equal(await service.tick(), true);
  assert.deepEqual(fake.calls, [["schedule"], ["claim", undefined, undefined], ["claim", undefined, undefined]]);
  assert.equal(fake.state.engineCalls, 1); assert.equal(fake.finished.length, 1);
  assert.equal(await service.tick(), false);
  assert.equal(fake.state.engineCalls, 1); assert.equal(fake.finished.length, 1);
});

test("cron executes no more than three items sequentially, including their completion commits", async () => {
  const fake = harness(), events: string[] = []; let claimed = 0, active = 0;
  fake.store.claimWork = async () => { events.push("claim"); claimed++; assert.equal(active, 0); return lease(); };
  fake.engine.inspectCandidate = async () => { events.push("inspect"); active++; assert.equal(active, 1); await Promise.resolve(); return assessment(); };
  fake.store.finishWork = async () => { events.push("commit"); await Promise.resolve(); active--; return { applied: true, runStatus: "running" }; };
  assert.equal(await createLostDomainsService({ ...fake, now: () => 0 }).tick(), true);
  assert.equal(claimed, 3); assert.equal(active, 0);
  assert.deepEqual(events, Array(3).fill(["claim", "inspect", "commit"]).flat());
  assert.equal(fake.calls.filter(call => call[0] === "schedule").length, 1);
});

test("cron starts no further work once its 25-second soft budget is consumed", async () => {
  for (const elapsedPerItem of [13_000, 25_000]) {
    const fake = harness(); let time = 0, claimed = 0;
    fake.store.claimWork = async () => { claimed++; return lease(); };
    fake.engine.inspectCandidate = async () => { time += elapsedPerItem; return assessment(); };
    assert.equal(await createLostDomainsService({ ...fake, now: () => time }).tick(), true);
    assert.equal(claimed, elapsedPerItem === 13_000 ? 2 : 1);
    assert.equal(fake.finished.length, claimed);
  }
  const fake = harness(); let time = 0;
  fake.store.scheduleDailyRuns = async () => { time = 25_000; return { started: 0, skipped: 0, reused: 0 }; };
  assert.equal(await createLostDomainsService({ ...fake, now: () => time }).tick(), false);
  assert.equal(fake.calls.some(call => call[0] === "claim"), false);
});

test("cron stops on unapplied or uncertain completion without repeating provider work", async () => {
  for (const uncertain of [false, true]) {
    const fake = harness(); let claimed = 0;
    fake.store.claimWork = async () => { claimed++; return lease(); };
    fake.store.finishWork = async () => {
      if (uncertain) throw new LostDomainsStoreError("lost_domains_unavailable", 503);
      return { applied: false, runStatus: "running" };
    };
    const pending = createLostDomainsService({ ...fake, now: () => 0 }).tick();
    if (uncertain) await assert.rejects(pending, { code: "lost_domains_unavailable", status: 503 });
    else assert.equal(await pending, false);
    assert.equal(claimed, 1); assert.equal(fake.state.engineCalls, 1); assert.equal(fake.failed.length, 0);
  }
});

test("cron does not keep claiming when a failed provider attempt loses its completion fence", async () => {
  const fake = harness(); let claimed = 0, failed = 0;
  fake.store.claimWork = async () => { claimed++; return lease(); };
  fake.engine.inspectCandidate = async () => { throw new Error("provider problem"); };
  fake.store.failWork = async () => { failed++; return { applied: false, runStatus: "running" }; };
  assert.equal(await createLostDomainsService({ ...fake, now: () => 0 }).tick(), false);
  assert.equal(claimed, 1); assert.equal(failed, 1); assert.equal(fake.finished.length, 0);
});

function archiveFixture(domain = "cloudtools.dev"): TradingArchiveEvidence {
  const collection = "CC-MAIN-2026-34";
  return { source: "common_crawl", domain, status: "observed", reason: "crawl_sightings", checkedAt: new Date().toISOString(),
    collection, sourceUrl: buildDomainArchiveQuery(domain, collection).href, sampleCount: 1,
    earliestSampleAt: "2026-08-20T12:00:00.000Z", latestSampleAt: "2026-08-20T12:00:00.000Z", sampleStatuses: [200],
    priorExistence: true, sampleLimit: 5, collectionLimit: 1 };
}

function verificationHarness(domain = "cloudtools.dev") {
  const fake = harness(), result = assessment(domain);
  fake.state.next = { ...lease(), verification: true, candidate: { ...candidate, domain, targetUrl: result.targetUrl } };
  fake.engine.inspectCandidate = async () => result;
  return { ...fake, result };
}

test("final verification enriches a strong eligible name with bounded archive provenance only", async () => {
  const fake = verificationHarness(), evidence = archiveFixture(), original = structuredClone(fake.result); let calls = 0;
  const issued = fake.state.next!;
  await createLostDomainsService({ ...fake, archiveEnabled: () => true, archive: async (domain, options) => {
    calls++; assert.equal(domain, fake.result.domain);
    assert.ok(options?.deadline && options.deadline > Date.now());
    assert.ok(options.deadline <= Date.now() + 4_000); assert.ok(options.deadline <= Date.parse(issued.expiresAt) - 5_000);
    return evidence;
  } }).advance(owner, runId);
  assert.equal(calls, 1); assert.equal(fake.failed.length, 0); assert.equal(fake.finished.length, 1);
  const finished = fake.finished[0].result; assert.equal(finished.kind, "candidate"); if (finished.kind !== "candidate") return;
  assert.deepEqual(finished.assessment.archive, evidence); assert.equal(isTradingArchiveEvidence(finished.assessment.archive), true);
  assert.ok(finished.assessment.marketFit!.score >= 60); assert.deepEqual(finished.assessment.evidence, original.evidence);
  assert.equal(finished.assessment.registrability, "unverified"); assert.equal(finished.assessment.confirmedRegistrable, false);
});

test("archive gating excludes the initial pass, weak names, unsafe results, disabled feature and expiring lease", async () => {
  const cases = ["initial", "weak", "sensitive", "excluded", "registered", "inconclusive", "disabled", "expiring"];
  for (const condition of cases) {
    const fake = verificationHarness(condition === "weak" ? "qxzztrv.dev" : "cloudtools.dev"); let calls = 0;
    if (condition === "initial") fake.state.next!.verification = false;
    if (condition === "sensitive") fake.result.sensitive = true;
    if (condition === "excluded") { fake.result.reviewStatus = "excluded"; fake.result.risk.level = "excluded"; }
    if (condition === "registered") { fake.result.registryStatus = "registered"; fake.result.reviewStatus = "registered"; fake.result.evidence[0].outcome = "registered"; }
    if (condition === "inconclusive") fake.result.reviewStatus = "inconclusive";
    if (condition === "expiring") fake.state.next!.expiresAt = new Date(Date.now() + 5_000).toISOString();
    await createLostDomainsService({ ...fake, archiveEnabled: () => condition !== "disabled", archive: async () => {
      calls++; return archiveFixture(fake.result.domain);
    } }).advance(owner, runId);
    assert.equal(calls, 0, condition); assert.equal(fake.finished.length, 1, condition);
    assert.equal(fake.result.archive, undefined, condition);
  }
});

test("archive errors or timeout evidence preserve successful primary checks and never request a retry", async () => {
  for (const throwing of [false, true]) {
    const fake = verificationHarness(); let calls = 0;
    const unknown: TradingArchiveEvidence = { ...archiveFixture(), status: "unknown", reason: "timeout", sourceUrl: null, collection: null,
      sampleCount: null, earliestSampleAt: null, latestSampleAt: null, sampleStatuses: [], priorExistence: null };
    await createLostDomainsService({ ...fake, archiveEnabled: () => true, archive: async () => {
      calls++; if (throwing) throw new Error("Private provider response with secret"); return unknown;
    } }).advance(owner, runId);
    assert.equal(calls, 1); assert.equal(fake.failed.length, 0); assert.equal(fake.finished.length, 1);
    const result = fake.finished[0].result; assert.equal(result.kind, "candidate"); if (result.kind !== "candidate") continue;
    assert.equal(result.assessment.registryStatus, "registry_not_found"); assert.equal(result.assessment.confirmedRegistrable, false);
    assert.equal(result.assessment.archive?.status, "unknown"); assert.equal(result.assessment.archive?.priorExistence, null);
    assert.equal(result.assessment.archive?.reason, throwing ? "unavailable" : "timeout");
    assert.equal(isTradingArchiveEvidence(result.assessment.archive), true);
    assert.doesNotMatch(JSON.stringify(result.assessment), /Private provider|secret/u);
  }
});

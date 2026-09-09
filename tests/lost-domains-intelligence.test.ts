import assert from "node:assert/strict";
import test from "node:test";
import { observationHistories, rotateSources, selectDiscoveryCandidates, type HistoricalObservation, type PreviousDomainCheck } from "../api/_shared/lost-domains-intelligence.js";
import type { LostCandidate, LostSource } from "../api/_shared/lost-domains-store.js";

const now=Date.parse("2026-09-09T12:00:00Z");
const candidate=(domain:string):LostCandidate=>({domain,sourceUrl:"https://catalog.org/projects",targetUrl:`https://${domain}/`,anchor:domain,sensitive:false});
test("discovery rotates sources using previous attempts without changing crawl budget",()=>{
  const sources=["a","b","c","d"].map(id=>({id}) as LostSource);
  assert.deepEqual(rotateSources(sources,[{sourceId:"a",attemptedAt:"2026-09-09T10:00:00Z"},{sourceId:"b",attemptedAt:"2026-09-09T09:00:00Z"}],3).map(row=>row.id),["c","d","b"]);
  assert.deepEqual(sources.map(row=>row.id),["a","b","c","d"]);
});
test("source rotation diversifies registrable publishers rather than counting their subdomains separately",()=>{
  const sources=[
    {id:"a",host:"catalog.org"},{id:"b",host:"news.catalog.org"},{id:"c",host:"other.co.uk"},
    {id:"d",host:"resources.other.co.uk"},{id:"e",host:"independent.net"},
  ].map(row=>row as LostSource);
  const history=[{sourceId:"a",attemptedAt:"2026-09-09T10:00:00Z"},{sourceId:"c",attemptedAt:"2026-09-09T09:00:00Z"}];
  assert.deepEqual(rotateSources(sources,history,3).map(row=>row.id),["b","d","e"]);
  assert.deepEqual(rotateSources(sources,history,5).map(row=>row.id),["b","d","e","c","a"]);
  assert.deepEqual(rotateSources(sources,history,-1),[]);
});
test("unseen names beat repeated registered names; due negative checks precede unknown checks",()=>{
  const rows=["old.com","uncertain.com","gone.com","new.com","fresh.com"].map(candidate);
  const checks=[{domain:"old.com",registryStatus:"registered" as const,observedAt:"2026-09-01T12:00:00Z"},
    {domain:"uncertain.com",registryStatus:"unknown" as const,observedAt:"2026-09-09T10:00:00Z"},
    {domain:"gone.com",registryStatus:"registry_not_found" as const,observedAt:"2026-09-09T10:00:00Z"},
    {domain:"fresh.com",registryStatus:"registry_not_found" as const,observedAt:"2026-09-09T11:59:00Z"}];
  assert.deepEqual(selectDiscoveryCandidates(rows,checks,now,20).map(row=>row.domain),["new.com","gone.com","uncertain.com","old.com"]);
  assert.equal(selectDiscoveryCandidates(rows,checks,now,2).length,2);
});
test("recent registered and excluded repeats do not consume another inspection; latest observation wins",()=>{
  const row=candidate("recent.com"),checks=[{domain:row.domain,registryStatus:"registered" as const,observedAt:"2026-09-09T11:00:00Z"},
    {domain:row.domain,registryStatus:"registry_not_found" as const,observedAt:"2026-09-08T00:00:00Z"}];
  assert.deepEqual(selectDiscoveryCandidates([row],checks,now,20),[]);
  assert.deepEqual(selectDiscoveryCandidates([{...row,sensitive:true}],checks,now,20),[]);
});
test("a full fresh backlog cannot starve due negatives, unknowns or weekly status rechecks",()=>{
  const groups=["fresh","negative","uncertain","registered"];
  const rows=groups.flatMap(group=>Array.from({length:40},(_value,index)=>candidate(`${group}${index}.com`)));
  const checks:PreviousDomainCheck[]=rows.filter(row=>!row.domain.startsWith("fresh")).map(row=>({
    domain:row.domain,observedAt:"2026-09-01T10:00:00Z",
    registryStatus:row.domain.startsWith("negative")?"registry_not_found":row.domain.startsWith("uncertain")?"unknown":"registered",
  }));
  const chosen=selectDiscoveryCandidates(rows,checks,now,25);
  assert.equal(chosen.length,25);
  assert.deepEqual(groups.map(group=>chosen.filter(row=>row.domain.startsWith(group)).length),[13,6,4,2]);
  const small=selectDiscoveryCandidates(rows,checks,now,2);
  assert.equal(small[0].domain.startsWith("fresh"),true); assert.equal(small[1].domain,"negative0.com");
  const next=selectDiscoveryCandidates(rows,[...checks,...chosen.map(row=>({domain:row.domain,observedAt:new Date(now).toISOString(),registryStatus:"registered" as const}))],now,25);
  assert.equal(next.some(row=>chosen.some(old=>old.domain===row.domain)),false);
  assert.deepEqual(groups.map(group=>next.filter(row=>row.domain.startsWith(group)).length),[13,6,4,2]);
});
test("unused category quota fills the bounded budget and oldest due evidence wins within each tier",()=>{
  const rows=Array.from({length:40},(_value,index)=>candidate(`candidate${index}.com`));
  const checks:PreviousDomainCheck[]=rows.map((row,index)=>({domain:row.domain,registryStatus:"registry_not_found",
    observedAt:new Date(now-(index+1)*60*60_000).toISOString()}));
  assert.deepEqual(selectDiscoveryCandidates(rows,checks,now,25).map(row=>row.domain),rows.slice(15).reverse().map(row=>row.domain));
  assert.equal(selectDiscoveryCandidates(rows,[],now,25).length,25);
  for(const limit of [-1,NaN,Infinity]) assert.deepEqual(selectDiscoveryCandidates(rows,checks,now,limit),[]);
});
test("fresh discovery ranks coherent commercial names ahead of arbitrary HTML order without bypassing rechecks",()=>{
  const rows=["qzxvbn.com","zovalu.com","fexicloud.com","cloudbilling.com","pending.com"].map(candidate);
  const checks:PreviousDomainCheck[]=[{domain:"pending.com",registryStatus:"registry_not_found",observedAt:"2026-09-09T10:00:00Z"}];
  assert.deepEqual(selectDiscoveryCandidates(rows,checks,now,2).map(row=>row.domain),["cloudbilling.com","pending.com"]);
  assert.deepEqual(rows.map(row=>row.domain),["qzxvbn.com","zovalu.com","fexicloud.com","cloudbilling.com","pending.com"]);
});
test("sensitivity is conservatively merged across normalized duplicates before applying the budget",()=>{
  const first=candidate("LoanDesk.com"), duplicate={...candidate("loandesk.com."),sensitive:true,sourceUrl:"https://second.org/login-links"};
  const safe=candidate("marketpilot.com");
  const chosen=selectDiscoveryCandidates([first,safe,duplicate],[],now,1);
  assert.deepEqual(chosen.map(row=>row.domain),[safe.domain]);
  const all=selectDiscoveryCandidates([first,safe,duplicate],[],now,25);
  assert.equal(all.length,2);
  assert.equal(all.find(row=>row.domain==="loandesk.com")?.sensitive,true);
  assert.equal(all.find(row=>row.domain==="loandesk.com")?.sourceUrl,first.sourceUrl);
  assert.equal(first.sensitive,false); assert.equal(first.domain,"LoanDesk.com");
  const unicode=candidate("bücher.de"), ascii={...candidate("xn--bcher-kva.de"),sensitive:true};
  assert.equal(selectDiscoveryCandidates([unicode,ascii],[],now,2).length,1);
  assert.equal(selectDiscoveryCandidates([unicode,ascii],[],now,2)[0].sensitive,true);
});
test("normalization and conservative same-time observations preserve cooldowns and exact due boundaries",()=>{
  const row=candidate("renewal.com"),observedAt=new Date(now-15*60_000).toISOString();
  const recent:PreviousDomainCheck={domain:"RENEWAL.COM.",registryStatus:"registered",observedAt};
  const negative:PreviousDomainCheck={domain:row.domain,registryStatus:"registry_not_found",observedAt};
  for(const checks of [[negative,recent],[recent,negative]]) assert.deepEqual(selectDiscoveryCandidates([row],checks,now,25),[]);
  assert.equal(selectDiscoveryCandidates([row],[negative],now,25).length,1);
  assert.equal(selectDiscoveryCandidates([row],[negative],now-1,25).length,0);
  assert.equal(selectDiscoveryCandidates([row],[{...recent,observedAt:new Date(now+1000).toISOString()}],now,25).length,1);
});
test("observation history distinguishes real registry transitions from unknown and counts independent source domains",()=>{
  const rows:HistoricalObservation[]=[
    {domain:"signal.com",runId:"latest",observedAt:"2026-09-09T12:00:00Z",registryStatus:"registry_not_found",sourceUrl:"https://news.catalog.org/second"},
    {domain:"signal.com",runId:"previous",observedAt:"2026-09-08T12:00:00Z",registryStatus:"registered",sourceUrl:"https://catalog.org/first"},
    {domain:"signal.com",runId:"oldest",observedAt:"2026-09-07T12:00:00Z",registryStatus:"registered",sourceUrl:"https://independent.org/page"}];
  const result=observationHistories(rows,"latest").get("signal.com")!;
  assert.equal(result.registryChanged,true); assert.equal(result.previousRegistryStatus,"registered");
  assert.equal(result.observations,3); assert.equal(result.independentSources,2);assert.equal(result.windowDays,180);
  assert.equal(result.firstObservedAt,rows[2].observedAt);
  assert.equal(observationHistories([{...rows[0]},{...rows[1],registryStatus:"unknown"}],"latest").get("signal.com")!.registryChanged,false);
  assert.equal(observationHistories(rows,"foreign-run").size,0);
});

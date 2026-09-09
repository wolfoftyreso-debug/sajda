import assert from "node:assert/strict";
import test from "node:test";
import {filterTradingReport,tradingReportCsv} from "../src/lib/tradingReport";
import type {LostDomainAssessment} from "../src/lib/lostDomains";
import {analyzeTradingMarketFit} from "../shared/trading-market-fit";
import {analyzeTradingDossier} from "../shared/trading-dossier";
import {evaluateTradingAcquisition} from "../shared/trading-acquisition";

const row=(domain:string):LostDomainAssessment=>({domain,sourceUrl:"https://catalog.org/links",targetUrl:`https://${domain}/`,anchor:"Name",sensitive:false,
  registryStatus:"registry_not_found",registrability:"unverified",confirmedRegistrable:false,reviewStatus:"review_candidate",
  evidence:[{kind:"registry",source:"https://rdap.verisign.com/com/v1/",method:"rdap",outcome:"registry_not_found",
    observedAt:"2026-09-09T12:00:00Z",expiresAt:"2026-09-09T12:15:00Z"}],risk:{level:"review",reasons:[]},potentialScore:55,confidenceScore:70});
test("report filters narrow real results by domain, extension and registry state without mutation",()=>{
  const rows=[row("bright.com"),{...row("bright.dev"),registryStatus:"registered" as const},row("green.dev")];
  assert.deepEqual(filterTradingReport(rows," BRIGHT ","all","dev").map(row=>row.domain),["bright.dev"]);
  assert.equal(filterTradingReport(rows,"","registered","").length,1);
  assert.equal(filterTradingReport(rows,"","priority","").length,0);
  assert.equal(filterTradingReport(rows,"","changed","").length,0);
  assert.equal(rows.length,3);
});
test("CSV explicitly exports unverified registrability, original evidence times, no invented valuation",()=>{
  const csv=tradingReportCsv([row("bright.com")]);
  assert.match(csv,/"unverified"/u);assert.match(csv,/2026-09-09T12:15:00Z/u);
  assert.doesNotMatch(csv,/available|market_value|confirmed_available/u);
  assert.equal(csv.split("\r\n").length,2);
});
test("CSV formula injection is neutralized and excluded source links are not exported",()=>{
  const csv=tradingReportCsv([{...row("=HYPERLINK(\"bad\")"),sensitive:true}]);
  assert.ok(csv.includes("'=HYPERLINK"));assert.doesNotMatch(csv,/catalog\.org/u);
  const excluded=tradingReportCsv([{...row("name.com"),risk:{level:"excluded",reasons:["active_mail_dependency"]}}]);
  assert.doesNotMatch(excluded,/catalog\.org/u);
});

test("strong name fit stays separate from registry status and excludes sensitive or excluded rows",()=>{
  const strong={...row("insurance.com"),marketFit:analyzeTradingMarketFit("insurance.com")};
  const weak={...row("zovalu.com"),marketFit:analyzeTradingMarketFit("zovalu.com")};
  assert.deepEqual(filterTradingReport([weak,strong,row("cloud.com")],"","strong_fit","").map(row=>row.domain),["insurance.com"]);
  assert.equal(filterTradingReport([{...strong,registryStatus:"registered",reviewStatus:"registered"}],"","strong_fit","").length,1);
  for(const excluded of [{...strong,sensitive:true},{...strong,risk:{level:"excluded" as const,reasons:[]}},{...strong,reviewStatus:"excluded" as const}]) {
    assert.equal(filterTradingReport([excluded],"","strong_fit","").length,0);
  }
});

test("CSV exports auditable name fit and bounded archive sample fields, with no price or demand claim",()=>{
  const domain="cloudbilling.com", candidate={...row(domain),marketFit:analyzeTradingMarketFit(domain)};
  const csv=tradingReportCsv([candidate]);
  assert.match(csv,/"name_fit_score","name_fit_tier","name_fit_methodology"/u);
  assert.match(csv,/"curated-name-fit-v1","cloud \+ billing"/u);
  assert.match(csv,/"exploratory_use_cases","archive_status","archive_checked_at"/u);
  assert.match(csv,/"archive_earliest_sample_at","archive_latest_sample_at"/u);
  assert.match(csv,/"software_product"/u);
  assert.match(csv,/heuristic_not_market_demand/u);
  assert.doesNotMatch(csv,/sale_price|market_value|verified_buyers|total_captures/u);
});

test("research-only evidence never enters ready filters and exports missing checks explicitly",()=>{
  const candidate=row("cloudbilling.com");
  candidate.dossier=analyzeTradingDossier(candidate,{sourceApproved:true});
  candidate.acquisition=evaluateTradingAcquisition({domain:candidate.domain});
  assert.equal(filterTradingReport([candidate],"","price_review","").length,0);
  assert.equal(filterTradingReport([candidate],"","acquisition_review","").length,0);
  const csv=tradingReportCsv([candidate]);
  assert.match(csv,/"technical_dossier_status","dossier_evaluated_at","technical_blockers"/u);
  assert.match(csv,/"acquisition_status","acquisition_evaluated_at","price_signal"/u);
  assert.match(csv,/"research_only"/u);
  assert.match(csv,/exact_quote; renewal; fees; tax; mandatory_addons; history; rights; valuation/u);
  assert.match(csv,/"three_year_cost_minor","cost_currency","investment_value"/u);
});

test("ready filters expire at original validity deadlines, not five or fifteen minutes after a read",()=>{
  const now=Date.parse("2026-09-09T12:00:00.000Z"),deadline=now+1_000,candidate=row("cloudbilling.com");
  // This filter consumes already-validated server models; isolate its clock boundary here.
  candidate.dossier={...analyzeTradingDossier(candidate,{now,sourceApproved:true}),status:"ready_for_price_review",
    evaluatedAt:new Date(now).toISOString(),validUntil:new Date(deadline).toISOString()};
  candidate.acquisition={...evaluateTradingAcquisition({domain:candidate.domain},now),status:"acquisition_review_ready",readyForAcquisitionReview:true,
    evaluatedAt:new Date(now).toISOString(),validUntil:new Date(deadline).toISOString()};
  for(const filter of ["price_review","acquisition_review"] as const){
    assert.equal(filterTradingReport([candidate],"",filter,"",deadline-1).length,1);
    assert.equal(filterTradingReport([candidate],"",filter,"",deadline).length,0);
    assert.equal(filterTradingReport([candidate],"",filter,"",now-1).length,0,"Future evaluations cannot become current");
  }
});

import type { LostDomainAssessment } from "./lostDomains";

export type TradingReportFilter="all"|"priority"|"price_review"|"acquisition_review"|"strong_fit"|"changed"|"unregistered"|"registered"|"unknown"|"excluded";
export function filterTradingReport(rows:LostDomainAssessment[],query:string,filter:TradingReportFilter,tld:string,now=Date.now()):LostDomainAssessment[] {
  const needle=query.trim().toLowerCase();
  return rows.filter(row=>(!needle || row.domain.includes(needle)) && (!tld || row.domain.endsWith(`.${tld}`))
    && (filter==="all" || filter==="priority" && row.opportunity?.tier==="priority_review"
      || filter==="price_review" && row.dossier?.status==="ready_for_price_review" && !row.sensitive && row.risk.level!=="excluded"
        && Date.parse(row.dossier.validUntil ?? "")>now && Date.parse(row.dossier.evaluatedAt)<=now
      || filter==="acquisition_review" && row.acquisition?.readyForAcquisitionReview===true && !row.sensitive && row.risk.level!=="excluded"
        && Date.parse(row.acquisition.validUntil ?? "")>now && Date.parse(row.acquisition.evaluatedAt)<=now
      || filter==="strong_fit" && row.marketFit?.tier==="strong" && !row.sensitive && row.risk.level!=="excluded" && row.reviewStatus!=="excluded"
      || filter==="changed" && row.observationHistory?.registryChanged===true
      || filter==="unregistered" && row.registryStatus==="registry_not_found" && row.risk.level!=="excluded"
      || filter==="registered" && row.registryStatus==="registered" || filter==="unknown" && row.registryStatus==="unknown"
      || filter==="excluded" && row.risk.level==="excluded"));
}

/** Export observations, not advertised inventory. Formula-safe CSV fields. */
export function tradingReportCsv(rows:LostDomainAssessment[]):string {
  const fields=(values:unknown[])=>values.map(value=>{
    const plain=String(value??"").replace(/[\r\n]+/gu," ");
    const safe=/^[\s]*[=+\-@\t]/u.test(plain)?`'${plain}`:plain;
    return `"${safe.replace(/"/gu,'""')}"`;
  }).join(",");
  return [fields(["domain","review_status","registry_status","registrability","review_priority","name_score","source_url","registry_observed_at","registry_expires_at","previous_registry_status","registry_changed",
    "name_fit_score","name_fit_tier","name_fit_methodology","name_fit_tokens","name_fit_reasons","exploratory_use_cases","archive_status","archive_checked_at","archive_collection","archive_sample_count","archive_earliest_sample_at","archive_latest_sample_at","archive_reason",
    "technical_dossier_status","dossier_evaluated_at","technical_blockers","temporal_stable_checks","temporal_span_seconds","acquisition_status","acquisition_evaluated_at","price_signal","acquisition_missing_checks","three_year_cost_minor","cost_currency","investment_value","dossier_valid_until","acquisition_valid_until",
    "registrar_status","registrar_availability","registrar_checked_at","registrar_expires_at","annual_registration_usd_minor","reported_renewal_usd_minor_term_unknown","minimum_registration_years","minimum_registration_subtotal_usd_minor","registrar_tax_fees_addons"]),
    ...rows.map(row=>{
      const registry=row.evidence.find(item=>item.kind==="registry");
      return fields([row.domain,row.reviewStatus,row.registryStatus,"unverified",row.opportunity?.score??"",row.potentialScore,
        row.sensitive||row.risk.level==="excluded"?"":row.sourceUrl,registry?.observedAt,registry?.expiresAt,
        row.observationHistory?.previousRegistryStatus,row.observationHistory?.registryChanged??false,
        row.marketFit?.score,row.marketFit?.tier,row.marketFit?.methodology,row.marketFit?.tokens.join(" + "),row.marketFit?.reasons.join("; "),row.marketFit?.buyerUseCases.join("; "),
        row.archive?.status,row.archive?.checkedAt,row.archive?.collection,row.archive?.sampleCount,row.archive?.earliestSampleAt,row.archive?.latestSampleAt,row.archive?.reason,
        row.dossier?.status,row.dossier?.evaluatedAt,row.dossier?.blockers.join("; "),row.dossier?.temporal.stableChecks,row.dossier?.temporal.spanSeconds,
        row.acquisition?.status,row.acquisition?.evaluatedAt,row.acquisition?.priceSignal,row.acquisition?.missingChecks.join("; "),
        row.acquisition?.totalCostScenarios.find(scenario=>scenario.years===3)?.totalMinor,row.acquisition?.totalCostScenarios.find(scenario=>scenario.years===3)?.currency,"unverified",row.dossier?.validUntil,row.acquisition?.validUntil,
        row.registrar?.status,row.registrar?.availability,row.registrar?.checkedAt,row.registrar?.expiresAt,row.registrar?.annualRegistrationMinor,
        row.registrar?.renewalPriceMinor,row.registrar?.minRegistrationYears,row.registrar?.minimumRegistrationSubtotalMinor,"unknown"]);
    })].join("\r\n");
}

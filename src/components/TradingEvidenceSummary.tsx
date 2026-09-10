import type { LostDomainAssessment, LostDomainQuoteUpdate } from "@/lib/lostDomains";
import type { TradingMarketFitReason, TradingBuyerUseCase } from "../../shared/trading-market-fit";
import { Button } from "@/components/ui/button";
import { tradingText, tradingLocale, type TradingPhrase } from "@/i18n/tradingEvidenceCopy";
import type { Language } from "@/i18n/languagePreference";
import { getLostDomainsCopy } from "@/i18n/lostDomainsCopy";

export interface TradingQuoteControls {
  enabled: boolean; blocked: boolean; disabled: boolean; busy: boolean; uncertain: boolean;
  update?: LostDomainQuoteUpdate;
  onRefresh: () => void;
  onStatus: () => void;
}

const fitReasons: Record<TradingMarketFitReason, TradingPhrase> = {
    exact_curated_word: "Exact word in the curated vocabulary", coherent_two_word_compound: "Two words with a shared application",
    modifier_only: "Descriptive word without a clear service", unrelated_word_pair: "The word pair has no clear shared application", mixed_language_pair: "Words from different languages",
    no_curated_meaning: "The vocabulary does not cover this name", partial_word_only: "Only part of the name matches a known word", compact_label: "Short, easy to scan label",
    long_label: "Long name", hyphen_present: "Hyphens add typing steps", digits_present: "Numbers may make spoken recall harder",
    repeated_word: "Repeated word", repeated_characters: "Repeated letters", difficult_letter_sequence: "The letter sequence may be hard to pronounce",
    possible_dictionary_typo: "Resembles a misspelling of a vocabulary word", unverified_coined_name: "A possible coined name needs independent language review",
    broad_commercial_extension: ".com receives general commercial weight in this rubric", swedish_language_extension: "Swedish words align with .se in this rubric",
    sector_extension_fit: "The extension fits the words' application", extension_fit_unestablished: "The rubric has not established extension fit",
    internationalized_label_requires_review: "Internationalized name needs separate language review", unsupported_domain: "This domain format is outside the rubric",
    heuristic_not_market_demand: "A naming rubric, not measured demand",
  };
const useCases: Record<TradingBuyerUseCase, TradingPhrase> = { software_product: "Software or digital service", finance_comparison: "Financial comparison service", property_service: "Housing or property service",
    travel_service: "Travel or booking service", retail_store: "Store or e-commerce", wellness_service: "Health or wellness service", energy_service: "Energy or installation service",
    education_service: "Education or courses", business_service: "Business service", food_service: "Food or meal service", creative_studio: "Creative studio or media project", mobility_service: "Transport or vehicle service" };

export default function TradingEvidenceSummary({candidate,language,time,quote}:{candidate:LostDomainAssessment;language:string;time:(value:string)=>string;quote?:TradingQuoteControls}) {
  const opportunity=candidate.opportunity,history=candidate.observationHistory,fit=candidate.marketFit,archive=candidate.archive,dossier=candidate.dossier,acquisition=candidate.acquisition,registrar=candidate.registrar;
  const locale=language;
  const copy=getLostDomainsCopy(locale);
  const registrarFresh=registrar?.status==="checked" && Date.parse(registrar.checkedAt)<=Date.now() && Date.parse(registrar.expiresAt)>Date.now();
  const staleDossier=dossier?.status==="ready_for_price_review" && !(Date.parse(dossier.validUntil ?? "")>Date.now());
  const staleAcquisition=acquisition?.readyForAcquisitionReview && !(Date.parse(acquisition.validUntil ?? "")>Date.now());
  const labels={registry: tradingText(copy.locale, "Registry"), dns: tradingText(copy.locale, "DNS"), mail: tradingText(copy.locale, "Mail"), website: tradingText(copy.locale, "Website"), name: tradingText(copy.locale, "Name structure"), source: tradingText(copy.locale, "Source trail"), penalties: tradingText(copy.locale, "Risk deductions"), registrar: tradingText(copy.locale, "Registrar purchase confirmation"), history: tradingText(copy.locale, "Past use"), trademark: tradingText(copy.locale, "Trademark rights"), market_comparables: tradingText(copy.locale, "Comparable sales")};
  return <div className="space-y-4">
    {quote && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{copy.quoteRefresh}</h5>
      <p id={`quote-note-${candidate.domain}`} className="mt-2 text-xs leading-5 text-muted-foreground">{copy.quoteNote}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" className="h-auto min-h-11 max-w-full whitespace-normal px-4 py-3 text-center" disabled={!quote.enabled || quote.blocked || quote.disabled || quote.busy || quote.update?.status==="pending"}
          onClick={quote.onRefresh} aria-describedby={`quote-note-${candidate.domain}`}>
          {quote.busy?copy.quoteRefreshing:copy.quoteRefresh}
        </Button>
        {(quote.uncertain || quote.update?.status==="pending") && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal px-4 py-3" disabled={quote.disabled || quote.busy} onClick={quote.onStatus}>{copy.reload}</Button>}
      </div>
      {(!quote.enabled || quote.blocked) && <p className="mt-2 text-xs leading-5 text-muted-foreground">{quote.blocked?copy.quoteExcluded:copy.quoteDisabled}</p>}
      {quote.uncertain && <p className="mt-3 text-xs leading-5" role="alert">{copy.quoteUncertain}</p>}
      {quote.update && <div className="mt-3 space-y-1 text-xs leading-5" role="status">
        <p>{quote.update.status==="pending"?copy.quotePending:quote.update.status==="failed"?copy.quoteFailed:copy.quoteSuccess}</p>
        <p className="text-muted-foreground">{copy.quoteRequested}: <time dateTime={quote.update.requestedAt}>{time(quote.update.requestedAt)}</time></p>
      </div>}
      {candidate.registrar && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Original quote observation time")}: {time(candidate.registrar.checkedAt)}.</p>}
      {dossier && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Original technical observations")}: {dossier.coverage.oldestEvidenceAt?time(dossier.coverage.oldestEvidenceAt):(tradingText(copy.locale, "Fresh evidence missing"))}. {dossier.validUntil && `${tradingText(copy.locale, "Valid no later than")}: ${time(dossier.validUntil)}.`}</p>}
    </section>}
    {dossier && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "Technical deep review")}</h5>
      <p className="mt-2 text-sm font-medium">{staleDossier?(tradingText(copy.locale, "Evidence expired — a fresh check is required")):({ready_for_price_review: tradingText(copy.locale, "Technical gates met for price review"), monitor: tradingText(copy.locale, "Further checks required"), reject: tradingText(copy.locale, "Excluded from acquisition review"), incomplete: tradingText(copy.locale, "Evidence is incomplete")})[dossier.status]}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "This assessment applies at the stated time. Ready for price review does not mean purchasable or undervalued. Four check types are not four independent data providers.")}</p>
      {dossier.reasons.includes("newer_observation_available") && <p className="mt-3 rounded-md bg-secondary/60 p-3 text-xs leading-5">{tradingText(copy.locale, "A newer check is available. This report must not be used as current purchase evidence; wait for the newer review.")}</p>}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Fresh check types")}</dt><dd className="mt-1 font-medium">{dossier.coverage.observedFamilies} / {dossier.coverage.requiredFamilies}</dd></div>
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Consistent checks over time")}</dt><dd className="mt-1 font-medium">{dossier.temporal.stableChecks} / {dossier.temporal.requiredChecks} · {Math.floor(dossier.temporal.spanSeconds/3600)} {tradingText(copy.locale, "hours (at least 12)")}</dd></div>
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Assessed")}</dt><dd className="mt-1 font-medium">{time(dossier.evaluatedAt)}</dd></div>
      </dl>
      <details className="mt-3 border-t border-border pt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tradingText(copy.locale, "Review gates and remaining evidence")}</summary>
        <dl className="space-y-2 text-xs">{dossier.stages.filter(stage=>!acquisition || !["registrar","rights","market_evidence"].includes(stage.id)).map(stage=><div key={stage.id} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
          <dt>{({source_permission: tradingText(copy.locale, "Approved source"), registry: tradingText(copy.locale, "Domain registry"), dns: tradingText(copy.locale, "DNS addresses"), mail: tradingText(copy.locale, "Mail dependencies"), website: tradingText(copy.locale, "Apex domain and web response"), freshness: tradingText(copy.locale, "Fresh evidence"), temporal: tradingText(copy.locale, "Stability over time"), archive: tradingText(copy.locale, "Archive sample"), registrar: tradingText(copy.locale, "Registrability and exact quote"), rights: tradingText(copy.locale, "Naming and trademark rights"), market_evidence: tradingText(copy.locale, "Demand and comparable sales")})[stage.id]}</dt>
          <dd className="font-medium">{({pass: tradingText(copy.locale, "Met"), fail: tradingText(copy.locale, "Blocking evidence"), unknown: tradingText(copy.locale, "Not verified"), stale: tradingText(copy.locale, "Refresh required")})[stage.state]}</dd>
        </div>)}</dl>
      </details>
      {(dossier.lifecycle.expirationPassed || dossier.lifecycle.renewalObservedAt) && <p className="mt-3 rounded-md bg-secondary/60 p-3 text-xs leading-5">{tradingText(copy.locale, "The registry lifecycle includes a past expiration date or renewal. Neither proves that the domain is available or can be purchased.")}</p>}
    </section>}
    {registrar && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "Registrar check")} · Porkbun</h5>
      <p className="mt-2 text-sm font-medium">{registrarFresh?(registrar.availability==="available"?(tradingText(copy.locale, "The registrar reported available at check time")):(tradingText(copy.locale, "The registrar reported unavailable"))):registrar.status==="checked"?(tradingText(copy.locale, "The quote needs refreshing. No current price is displayed.")):(tradingText(copy.locale, "No verified registrar response"))}</p>
      {registrarFresh && <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Registration price per year")}</dt><dd className="mt-1 font-semibold">{registrar.annualRegistrationMinor===null?(tradingText(copy.locale, "Not confirmed")):new Intl.NumberFormat(tradingLocale[language as Language] ?? tradingLocale.en,{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.annualRegistrationMinor/100)}</dd></div>
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Reported renewal price · term not established")}</dt><dd className="mt-1 font-semibold">{registrar.renewalPriceMinor===null?(tradingText(copy.locale, "Not confirmed")):new Intl.NumberFormat(tradingLocale[language as Language] ?? tradingLocale.en,{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.renewalPriceMinor/100)}</dd></div>
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Minimum registration term")}</dt><dd className="mt-1 font-medium">{registrar.minRegistrationYears===null?(tradingText(copy.locale, "Not confirmed")):`${registrar.minRegistrationYears} ${tradingText(copy.locale, "years")}`}</dd></div>
        {registrar.minimumRegistrationSubtotalMinor!==null && <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Registration for the minimum term, before unconfirmed extras")}</dt><dd className="mt-1 font-semibold">{new Intl.NumberFormat(tradingLocale[language as Language] ?? tradingLocale.en,{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.minimumRegistrationSubtotalMinor/100)}</dd></div>}
      </dl>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Tax, fees, mandatory add-ons and the renewal contract term are unverified. This is not a final payable total or a reservation.")}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Checked")}: {time(registrar.checkedAt)} · {tradingText(copy.locale, "Recheck by")}: {time(registrar.expiresAt)}</p>
    </section>}
    {acquisition && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "Pricing and acquisition evidence")}</h5>
      <p className="mt-2 text-sm font-medium">{staleAcquisition?(tradingText(copy.locale, "Acquisition evidence expired — recheck before proceeding")):({research_only: tradingText(copy.locale, "Research only — purchase evidence missing"), due_diligence_required: tradingText(copy.locale, "More evidence needed before a purchase decision"), acquisition_review_ready: tradingText(copy.locale, "Evidence ready for your acquisition review"), excluded: tradingText(copy.locale, "Excluded from acquisition review")})[acquisition.status]}</p>
      {acquisition.priceSignal==="none" && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "No verified low-price signal. A standard extension price, a good name or an absent registry record is not enough.")}</p>}
      {acquisition.priceSignal==="below_reviewed_range" && !staleAcquisition && <p className="mt-2 text-xs leading-5">{tradingText(copy.locale, "The three-year cost scenario is below the reviewed comparison range. This is a research signal, not a promise of a sale price or profit.")}</p>}
      {acquisition.totalCostScenarios.length>0 && <dl className="mt-3 grid gap-3 sm:grid-cols-3">{acquisition.totalCostScenarios.map(scenario=><div key={scenario.years} className="min-w-0"><dt className="text-xs text-muted-foreground">{scenario.years} {tradingText(copy.locale, "years")}</dt><dd className="mt-1 break-words text-sm font-semibold">{new Intl.NumberFormat(tradingLocale[language as Language] ?? tradingLocale.en,{style:"currency",currency:scenario.currency,currencyDisplay:"code"}).format(scenario.totalMinor/100)}</dd></div>)}</dl>}
      {acquisition.totalCostScenarios.length>0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Scenarios use current price terms; future renewal prices are not locked.")}</p>}
      {acquisition.missingChecks.length>0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{acquisition.missingChecks.map(check=><li key={check}>{({registrability: tradingText(copy.locale, "Registrar confirmation for this exact domain"), exact_quote: tradingText(copy.locale, "Current quote for this exact domain"), renewal: tradingText(copy.locale, "Renewal price"), fees: tradingText(copy.locale, "All fees"), tax: tradingText(copy.locale, "Taxes"), mandatory_addons: tradingText(copy.locale, "Mandatory add-ons"), history: tradingText(copy.locale, "Reviewed past use"), rights: tradingText(copy.locale, "Reviewed naming and trademark risks"), valuation: tradingText(copy.locale, "Sourced comparable sales and a reviewed value range")})[check]}</li>)}</ul>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Assessed")}: {time(acquisition.evaluatedAt)}. {tradingText(copy.locale, "A purchase always requires your confirmation and a fresh registrar check.")}</p>
    </section>}
    {fit && <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h5 className="text-sm font-semibold">{tradingText(copy.locale, "Name fit")}</h5>
        <span className="text-sm font-semibold tabular-nums">{fit.tier==="unrated"?(tradingText(copy.locale, "Unrated")):`${fit.score}/100`}</span></div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Vocabulary model v1 weighs meaning, application, readability and extension. Its English and Swedish vocabulary is a limited selection; unfamiliar names need independent review. The score is independent of registrability and does not measure demand or market value.")}</p>
      {fit.tokens.length>0 && <p className="mt-3 break-words text-sm"><span className="text-muted-foreground">{tradingText(copy.locale, "Recognized words")}: </span><span className="font-medium">{fit.tokens.join(" + ")}</span></p>}
      {fit.tier!=="unrated" && <dl className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {Object.entries(fit.breakdown).map(([key,value])=><div key={key} className="flex justify-between gap-2 text-xs leading-5">
          <dt className="text-muted-foreground">{({meaning: tradingText(copy.locale, "Meaning · max 40"), commercial: tradingText(copy.locale, "Application · max 25"), readability: tradingText(copy.locale, "Readability · max 20"), tldFit: tradingText(copy.locale, "Extension · max 15"), penalties: tradingText(copy.locale, "Name deductions")})[key]}</dt>
          <dd className="font-semibold tabular-nums">{key==="penalties"?"−":"+"}{value}</dd></div>)}
      </dl>}
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{fit.reasons.filter(reason=>reason!=="heuristic_not_market_demand").map(reason=><li key={reason}>{tradingText(locale, fitReasons[reason])}</li>)}</ul>
      {fit.buyerUseCases.length>0 && <div className="mt-3 border-t border-border pt-3"><h6 className="text-xs font-semibold">{tradingText(copy.locale, "Exploratory use cases")}</h6>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">{fit.buyerUseCases.map(useCase=><li key={useCase}>{tradingText(locale, useCases[useCase])}</li>)}</ul>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "These ideas come from the words. No buyers or purchase interest have been identified.")}</p></div>}
    </section>}
    {opportunity && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "How review priority is calculated")}</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Signal model v1 · not a valuation. A source trail is an observed reference, not verified traffic or backlink authority.")}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        {Object.entries(opportunity.breakdown).map(([key,value])=><div key={key} className="flex min-w-0 justify-between gap-2 text-xs leading-5">
          <dt className="text-muted-foreground">{labels[key as keyof typeof labels]}</dt><dd className="font-semibold tabular-nums">{key==="penalties"?"−":"+"}{value}</dd>
        </div>)}
      </dl>
      <p className="mt-3 border-t border-border pt-3 text-sm font-semibold">{tradingText(copy.locale, "Review priority")}: {opportunity.score}/100</p>
      {opportunity.missingChecks.length>0 && <div className="mt-3"><h6 className="text-xs font-semibold">{tradingText(copy.locale, "Still needed before a purchase decision")}</h6>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{opportunity.missingChecks.map(check=><li key={check}>{labels[check]}</li>)}</ul></div>}
    </section>}
    {archive && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "Public archive sample")} · Common Crawl</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "At most 5 metadata observations from 1 collection. Dates describe this sample, not the domain's first or last use ever. This evidence does not establish ownership, traffic, backlink quality or trademark rights.")}</p>
      <p className="mt-3 text-sm font-medium">{archive.status==="observed"?(tradingText(copy.locale, "The domain appears in archive metadata.")):archive.status==="disabled"?(tradingText(copy.locale, "Archive checks are not enabled.")):archive.reason==="no_sightings"?(tradingText(copy.locale, "No sample was found in the checked collection.")):(tradingText(copy.locale, "The archive check did not return reliable evidence."))}</p>
      {archive.status!=="observed" && <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Missing archive data does not prove that the domain has no history.")}</p>}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Checked")}</dt><dd className="mt-1 font-medium">{time(archive.checkedAt)}</dd></div>
        {archive.collection && <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Collection")}</dt><dd className="mt-1 font-medium">{archive.collection}</dd></div>}
        {archive.status==="observed" && <><div><dt className="text-muted-foreground">{tradingText(copy.locale, "Metadata samples")}</dt><dd className="mt-1 font-medium">{archive.sampleCount} / {archive.sampleLimit}</dd></div>
          <div><dt className="text-muted-foreground">{tradingText(copy.locale, "HTTP statuses in the sample")}</dt><dd className="mt-1 font-medium">{archive.sampleStatuses.join(", ")}</dd></div>
          <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Earliest in the sample")}</dt><dd className="mt-1 font-medium">{time(archive.earliestSampleAt!)}</dd></div>
          <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Latest in the sample")}</dt><dd className="mt-1 font-medium">{time(archive.latestSampleAt!)}</dd></div></>}
      </dl>
      {archive.sourceUrl && !candidate.sensitive && candidate.risk.level!=="excluded" && <a className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={archive.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{tradingText(copy.locale, "Open the metadata query at Common Crawl")}</a>}
    </section>}
    {history && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{tradingText(copy.locale, "Sajda observation history")}</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{tradingText(copy.locale, "Your account's checks over the last 180 days. This is not the domain's ownership or traffic history.")}</p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "First seen in this window")}</dt><dd className="mt-1 font-medium">{time(history.firstObservedAt)}</dd></div>
        <div><dt className="text-muted-foreground">{tradingText(copy.locale, "Checks / distinct source domains")}</dt><dd className="mt-1 font-medium">{history.observations} / {history.independentSources}</dd></div>
      </dl>
      {history.registryChanged && <p className="mt-3 rounded-md bg-primary/5 p-3 text-sm font-medium">{tradingText(copy.locale, "Registry status changed since the previous check.")} {history.previousObservedAt && time(history.previousObservedAt)}</p>}
    </section>}
  </div>;
}

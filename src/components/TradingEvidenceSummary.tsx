import type { LostDomainAssessment, LostDomainQuoteUpdate } from "@/lib/lostDomains";
import type { TradingMarketFitReason, TradingBuyerUseCase } from "../../shared/trading-market-fit";
import { Button } from "@/components/ui/button";
import { getLostDomainsCopy } from "@/i18n/lostDomainsCopy";

export interface TradingQuoteControls {
  enabled: boolean; blocked: boolean; disabled: boolean; busy: boolean; uncertain: boolean;
  update?: LostDomainQuoteUpdate;
  onRefresh: () => void;
  onStatus: () => void;
}

const fitReasons: Record<"sv" | "en", Record<TradingMarketFitReason, string>> = {
  sv: {
    exact_curated_word: "Exakt ord i den granskade ordlistan", coherent_two_word_compound: "Två ord med gemensamt användningsområde",
    modifier_only: "Beskrivande ord utan tydlig tjänst", unrelated_word_pair: "Ordparets användningsområde är oklart", mixed_language_pair: "Ord från olika språk",
    no_curated_meaning: "Namnet täcks inte av ordlistan", partial_word_only: "Endast en del av namnet matchar ett känt ord", compact_label: "Kort och lätt att överblicka",
    long_label: "Långt namn", hyphen_present: "Bindestreck ger extra skrivsteg", digits_present: "Siffror kan försvåra muntlig återgivning",
    repeated_word: "Upprepat ord", repeated_characters: "Upprepade bokstäver", difficult_letter_sequence: "Bokstavsföljden kan vara svår att uttala",
    possible_dictionary_typo: "Liknar en felstavning av ett ord i listan", unverified_coined_name: "Ett möjligt nybildat namn kräver egen språkgranskning",
    broad_commercial_extension: ".com får generell kommersiell vikt i modellen", swedish_language_extension: "Svenska ord och .se passar ihop i modellen",
    sector_extension_fit: "Ändelsen passar ordens användningsområde", extension_fit_unestablished: "Modellen har inte fastställt att ändelsen passar",
    internationalized_label_requires_review: "Internationaliserat namn behöver separat språkgranskning", unsupported_domain: "Modellen stöder inte detta domänformat",
    heuristic_not_market_demand: "En namnmodell, inte uppmätt efterfrågan",
  },
  en: {
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
  },
};
const useCases: Record<"sv" | "en", Record<TradingBuyerUseCase, string>> = {
  sv: { software_product: "Programvara eller digital tjänst", finance_comparison: "Jämförelsetjänst för ekonomi", property_service: "Bostads- eller fastighetstjänst",
    travel_service: "Rese- eller bokningstjänst", retail_store: "Butik eller e-handel", wellness_service: "Hälso- eller välmåendetjänst", energy_service: "Energi- eller installationstjänst",
    education_service: "Utbildning eller kurser", business_service: "Företagstjänst", food_service: "Mat- eller måltidstjänst", creative_studio: "Kreativ studio eller medieprojekt", mobility_service: "Transport- eller fordonstjänst" },
  en: { software_product: "Software or digital service", finance_comparison: "Financial comparison service", property_service: "Housing or property service",
    travel_service: "Travel or booking service", retail_store: "Store or e-commerce", wellness_service: "Health or wellness service", energy_service: "Energy or installation service",
    education_service: "Education or courses", business_service: "Business service", food_service: "Food or meal service", creative_studio: "Creative studio or media project", mobility_service: "Transport or vehicle service" },
};

export default function TradingEvidenceSummary({candidate,swedish,time,quote}:{candidate:LostDomainAssessment;swedish:boolean;time:(value:string)=>string;quote?:TradingQuoteControls}) {
  const opportunity=candidate.opportunity,history=candidate.observationHistory,fit=candidate.marketFit,archive=candidate.archive,dossier=candidate.dossier,acquisition=candidate.acquisition,registrar=candidate.registrar;
  const locale=swedish?"sv":"en";
  const copy=getLostDomainsCopy(locale);
  const registrarFresh=registrar?.status==="checked" && Date.parse(registrar.checkedAt)<=Date.now() && Date.parse(registrar.expiresAt)>Date.now();
  const staleDossier=dossier?.status==="ready_for_price_review" && !(Date.parse(dossier.validUntil ?? "")>Date.now());
  const staleAcquisition=acquisition?.readyForAcquisitionReview && !(Date.parse(acquisition.validUntil ?? "")>Date.now());
  const labels=swedish ? {registry:"Register",dns:"DNS",mail:"E-post",website:"Webb",name:"Namnform",source:"Källspår",penalties:"Riskavdrag",
    registrar:"Registratorns köpbesked",history:"Tidigare användning",trademark:"Varumärkesrätt",market_comparables:"Jämförbara försäljningar"}
    : {registry:"Registry",dns:"DNS",mail:"Mail",website:"Website",name:"Name structure",source:"Source trail",penalties:"Risk deductions",
      registrar:"Registrar purchase confirmation",history:"Past use",trademark:"Trademark rights",market_comparables:"Comparable sales"};
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
      {candidate.registrar && <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Prisunderlagets ursprungliga kontrolltid":"Original quote observation time"}: {time(candidate.registrar.checkedAt)}.</p>}
      {dossier && <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Ursprungliga tekniska observationer":"Original technical observations"}: {dossier.coverage.oldestEvidenceAt?time(dossier.coverage.oldestEvidenceAt):(swedish?"Färskt underlag saknas":"Fresh evidence missing")}. {dossier.validUntil && `${swedish?"Giltig längst till":"Valid no later than"}: ${time(dossier.validUntil)}.`}</p>}
    </section>}
    {dossier && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Teknisk djupgranskning":"Technical deep review"}</h5>
      <p className="mt-2 text-sm font-medium">{staleDossier?(swedish?"Underlaget har löpt ut – ny kontroll krävs":"Evidence expired — a fresh check is required"):(swedish?{ready_for_price_review:"Tekniska villkor uppfyllda för prisgranskning",monitor:"Fortsatt kontroll krävs",reject:"Utesluten från förvärvsgranskning",incomplete:"Underlaget är ofullständigt"}:{ready_for_price_review:"Technical gates met for price review",monitor:"Further checks required",reject:"Excluded from acquisition review",incomplete:"Evidence is incomplete"})[dossier.status]}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Bedömningen gäller vid angiven tid. Klar för prisgranskning betyder inte köpbar eller undervärderad. Fyra kontrolltyper är inte fyra oberoende dataleverantörer.":"This assessment applies at the stated time. Ready for price review does not mean purchasable or undervalued. Four check types are not four independent data providers."}</p>
      {dossier.reasons.includes("newer_observation_available") && <p className="mt-3 rounded-md bg-secondary/60 p-3 text-xs leading-5">{swedish?"En nyare kontroll finns. Den här rapporten får inte användas som aktuellt köpunderlag; invänta den nya granskningen.":"A newer check is available. This report must not be used as current purchase evidence; wait for the newer review."}</p>}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{swedish?"Färska kontrolltyper":"Fresh check types"}</dt><dd className="mt-1 font-medium">{dossier.coverage.observedFamilies} / {dossier.coverage.requiredFamilies}</dd></div>
        <div><dt className="text-muted-foreground">{swedish?"Samstämmiga kontroller över tid":"Consistent checks over time"}</dt><dd className="mt-1 font-medium">{dossier.temporal.stableChecks} / {dossier.temporal.requiredChecks} · {Math.floor(dossier.temporal.spanSeconds/3600)} {swedish?"timmar (minst 12)":"hours (at least 12)"}</dd></div>
        <div><dt className="text-muted-foreground">{swedish?"Bedömt":"Assessed"}</dt><dd className="mt-1 font-medium">{time(dossier.evaluatedAt)}</dd></div>
      </dl>
      <details className="mt-3 border-t border-border pt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{swedish?"Granskningssteg och återstående underlag":"Review gates and remaining evidence"}</summary>
        <dl className="space-y-2 text-xs">{dossier.stages.filter(stage=>!acquisition || !["registrar","rights","market_evidence"].includes(stage.id)).map(stage=><div key={stage.id} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
          <dt>{(swedish?{source_permission:"Godkänd källa",registry:"Domänregister",dns:"DNS-adresser",mail:"E-postberoenden",website:"Huvuddomän och webbsvar",freshness:"Aktuellt underlag",temporal:"Stabilitet över tid",archive:"Arkivstickprov",registrar:"Registrerbarhet och exakt pris",rights:"Namn- och varumärkesrätt",market_evidence:"Efterfrågan och jämförbara försäljningar"}:{source_permission:"Approved source",registry:"Domain registry",dns:"DNS addresses",mail:"Mail dependencies",website:"Apex domain and web response",freshness:"Fresh evidence",temporal:"Stability over time",archive:"Archive sample",registrar:"Registrability and exact quote",rights:"Naming and trademark rights",market_evidence:"Demand and comparable sales"})[stage.id]}</dt>
          <dd className="font-medium">{(swedish?{pass:"Uppfyllt",fail:"Hinder upptäckt",unknown:"Ej verifierat",stale:"Ny kontroll krävs"}:{pass:"Met",fail:"Blocking evidence",unknown:"Not verified",stale:"Refresh required"})[stage.state]}</dd>
        </div>)}</dl>
      </details>
      {(dossier.lifecycle.expirationPassed || dossier.lifecycle.renewalObservedAt) && <p className="mt-3 rounded-md bg-secondary/60 p-3 text-xs leading-5">{swedish?"Registerhistoriken innehåller ett passerat utgångsdatum eller en förnyelse. Det bevisar inte att domänen är ledig eller kan köpas.":"The registry lifecycle includes a past expiration date or renewal. Neither proves that the domain is available or can be purchased."}</p>}
    </section>}
    {registrar && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Registratorns kontroll":"Registrar check"} · Porkbun</h5>
      <p className="mt-2 text-sm font-medium">{registrarFresh?(registrar.availability==="available"?(swedish?"Registratorn svarade tillgänglig vid kontrollen":"The registrar reported available at check time"):(swedish?"Registratorn svarade inte tillgänglig":"The registrar reported unavailable")):registrar.status==="checked"?(swedish?"Prisbeskedet behöver förnyas. Inget aktuellt pris visas.":"The quote needs refreshing. No current price is displayed."):(swedish?"Inget verifierat besked från registratorn":"No verified registrar response")}</p>
      {registrarFresh && <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{swedish?"Registreringspris per år":"Registration price per year"}</dt><dd className="mt-1 font-semibold">{registrar.annualRegistrationMinor===null?(swedish?"Ej bekräftat":"Not confirmed"):new Intl.NumberFormat(swedish?"sv-SE":"en-US",{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.annualRegistrationMinor/100)}</dd></div>
        <div><dt className="text-muted-foreground">{swedish?"Rapporterat förnyelsepris · period ej fastställd":"Reported renewal price · term not established"}</dt><dd className="mt-1 font-semibold">{registrar.renewalPriceMinor===null?(swedish?"Ej bekräftat":"Not confirmed"):new Intl.NumberFormat(swedish?"sv-SE":"en-US",{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.renewalPriceMinor/100)}</dd></div>
        <div><dt className="text-muted-foreground">{swedish?"Minsta registreringsperiod":"Minimum registration term"}</dt><dd className="mt-1 font-medium">{registrar.minRegistrationYears===null?(swedish?"Ej bekräftad":"Not confirmed"):`${registrar.minRegistrationYears} ${swedish?"år":"years"}`}</dd></div>
        {registrar.minimumRegistrationSubtotalMinor!==null && <div><dt className="text-muted-foreground">{swedish?"Registrering för minsta perioden, före obekräftade tillägg":"Registration for the minimum term, before unconfirmed extras"}</dt><dd className="mt-1 font-semibold">{new Intl.NumberFormat(swedish?"sv-SE":"en-US",{style:"currency",currency:"USD",currencyDisplay:"code"}).format(registrar.minimumRegistrationSubtotalMinor/100)}</dd></div>}
      </dl>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{swedish?"Skatt, avgifter, obligatoriska tillägg och förnyelsens avtalsperiod är inte verifierade. Detta är inte ett slutligt betalbelopp eller en reservation.":"Tax, fees, mandatory add-ons and the renewal contract term are unverified. This is not a final payable total or a reservation."}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Kontrollerat":"Checked"}: {time(registrar.checkedAt)} · {swedish?"Ny kontroll senast":"Recheck by"}: {time(registrar.expiresAt)}</p>
    </section>}
    {acquisition && <section className="min-w-0 rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Pris och förvärvsunderlag":"Pricing and acquisition evidence"}</h5>
      <p className="mt-2 text-sm font-medium">{staleAcquisition?(swedish?"Förvärvsunderlaget har löpt ut – kontrollera på nytt":"Acquisition evidence expired — recheck before proceeding"):(swedish?{research_only:"Endast research – köpunderlag saknas",due_diligence_required:"Fler underlag krävs före ett köpbeslut",acquisition_review_ready:"Underlag redo för ditt förvärvsbeslut",excluded:"Utesluten från förvärvsgranskning"}:{research_only:"Research only — purchase evidence missing",due_diligence_required:"More evidence needed before a purchase decision",acquisition_review_ready:"Evidence ready for your acquisition review",excluded:"Excluded from acquisition review"})[acquisition.status]}</p>
      {acquisition.priceSignal==="none" && <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Ingen verifierad lågprissignal. Ett standardpris för ändelsen, ett bra namn eller ett tomt registersvar räcker inte.":"No verified low-price signal. A standard extension price, a good name or an absent registry record is not enough."}</p>}
      {acquisition.priceSignal==="below_reviewed_range" && !staleAcquisition && <p className="mt-2 text-xs leading-5">{swedish?"Den beräknade treårskostnaden ligger under det granskade jämförelseintervallet. Det är en signal att undersöka, inte ett löfte om försäljningspris eller vinst.":"The three-year cost scenario is below the reviewed comparison range. This is a research signal, not a promise of a sale price or profit."}</p>}
      {acquisition.totalCostScenarios.length>0 && <dl className="mt-3 grid gap-3 sm:grid-cols-3">{acquisition.totalCostScenarios.map(scenario=><div key={scenario.years} className="min-w-0"><dt className="text-xs text-muted-foreground">{scenario.years} {swedish?"år":"years"}</dt><dd className="mt-1 break-words text-sm font-semibold">{new Intl.NumberFormat(swedish?"sv-SE":"en-US",{style:"currency",currency:scenario.currency,currencyDisplay:"code"}).format(scenario.totalMinor/100)}</dd></div>)}</dl>}
      {acquisition.totalCostScenarios.length>0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Scenarierna använder nuvarande prisvillkor; framtida förnyelsepriser är inte låsta.":"Scenarios use current price terms; future renewal prices are not locked."}</p>}
      {acquisition.missingChecks.length>0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{acquisition.missingChecks.map(check=><li key={check}>{(swedish?{registrability:"Registratorns exakta tillgänglighetsbesked",exact_quote:"Aktuellt pris för just denna domän",renewal:"Förnyelsepris",fees:"Samtliga avgifter",tax:"Skatt och moms",mandatory_addons:"Obligatoriska tillägg",history:"Granskad tidigare användning",rights:"Granskade namn- och varumärkesrisker",valuation:"Källbelagda jämförbara försäljningar och granskat värdeintervall"}:{registrability:"Registrar confirmation for this exact domain",exact_quote:"Current quote for this exact domain",renewal:"Renewal price",fees:"All fees",tax:"Taxes",mandatory_addons:"Mandatory add-ons",history:"Reviewed past use",rights:"Reviewed naming and trademark risks",valuation:"Sourced comparable sales and a reviewed value range"})[check]}</li>)}</ul>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{swedish?"Bedömt":"Assessed"}: {time(acquisition.evaluatedAt)}. {swedish?"Ett köp kräver alltid din bekräftelse och en ny kontroll hos registratorn.":"A purchase always requires your confirmation and a fresh registrar check."}</p>
    </section>}
    {fit && <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h5 className="text-sm font-semibold">{swedish?"Namnmatchning":"Name fit"}</h5>
        <span className="text-sm font-semibold tabular-nums">{fit.tier==="unrated"?(swedish?"Ej bedömt":"Unrated"):`${fit.score}/100`}</span></div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Ordmodell v1 väger betydelse, användningsområde, läsbarhet och ändelse. Ordlistan är ett begränsat urval på svenska och engelska; okända namn behöver egen granskning. Poängen är oberoende av registrerbarhet och mäter inte efterfrågan eller marknadsvärde.":"Vocabulary model v1 weighs meaning, application, readability and extension. Its English and Swedish vocabulary is a limited selection; unfamiliar names need independent review. The score is independent of registrability and does not measure demand or market value."}</p>
      {fit.tokens.length>0 && <p className="mt-3 break-words text-sm"><span className="text-muted-foreground">{swedish?"Tolkade ord":"Recognized words"}: </span><span className="font-medium">{fit.tokens.join(" + ")}</span></p>}
      {fit.tier!=="unrated" && <dl className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {Object.entries(fit.breakdown).map(([key,value])=><div key={key} className="flex justify-between gap-2 text-xs leading-5">
          <dt className="text-muted-foreground">{(swedish?{meaning:"Betydelse · max 40",commercial:"Användningsområde · max 25",readability:"Läsbarhet · max 20",tldFit:"Ändelse · max 15",penalties:"Namnrelaterade avdrag"}:{meaning:"Meaning · max 40",commercial:"Application · max 25",readability:"Readability · max 20",tldFit:"Extension · max 15",penalties:"Name deductions"})[key]}</dt>
          <dd className="font-semibold tabular-nums">{key==="penalties"?"−":"+"}{value}</dd></div>)}
      </dl>}
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{fit.reasons.filter(reason=>reason!=="heuristic_not_market_demand").map(reason=><li key={reason}>{fitReasons[locale][reason]}</li>)}</ul>
      {fit.buyerUseCases.length>0 && <div className="mt-3 border-t border-border pt-3"><h6 className="text-xs font-semibold">{swedish?"Användningsidéer att undersöka":"Exploratory use cases"}</h6>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">{fit.buyerUseCases.map(useCase=><li key={useCase}>{useCases[locale][useCase]}</li>)}</ul>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{swedish?"Idéerna kommer från orden. Inga köpare eller köpintressen har identifierats.":"These ideas come from the words. No buyers or purchase interest have been identified."}</p></div>}
    </section>}
    {opportunity && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Så räknas granskningsprioriteten":"How review priority is calculated"}</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Signalmodell v1 · inte en värdering. Källspår betyder en observerad hänvisning, inte verifierad trafik eller länkkraft.":"Signal model v1 · not a valuation. A source trail is an observed reference, not verified traffic or backlink authority."}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        {Object.entries(opportunity.breakdown).map(([key,value])=><div key={key} className="flex min-w-0 justify-between gap-2 text-xs leading-5">
          <dt className="text-muted-foreground">{labels[key as keyof typeof labels]}</dt><dd className="font-semibold tabular-nums">{key==="penalties"?"−":"+"}{value}</dd>
        </div>)}
      </dl>
      <p className="mt-3 border-t border-border pt-3 text-sm font-semibold">{swedish?"Granskningsprioritet":"Review priority"}: {opportunity.score}/100</p>
      {opportunity.missingChecks.length>0 && <div className="mt-3"><h6 className="text-xs font-semibold">{swedish?"Återstår före ett köpbeslut":"Still needed before a purchase decision"}</h6>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{opportunity.missingChecks.map(check=><li key={check}>{labels[check]}</li>)}</ul></div>}
    </section>}
    {archive && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Publikt arkivstickprov":"Public archive sample"} · Common Crawl</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Högst 5 metadataobservationer i 1 insamling. Datumen avser bara detta stickprov, inte domänens första eller senaste användning någonsin. Underlaget visar inte ägare, trafik, länkkvalitet eller varumärkesrätt.":"At most 5 metadata observations from 1 collection. Dates describe this sample, not the domain's first or last use ever. This evidence does not establish ownership, traffic, backlink quality or trademark rights."}</p>
      <p className="mt-3 text-sm font-medium">{archive.status==="observed"?(swedish?"Domänen förekommer i arkivets metadata.":"The domain appears in archive metadata."):archive.status==="disabled"?(swedish?"Arkivkontroll är inte aktiverad.":"Archive checks are not enabled."):archive.reason==="no_sightings"?(swedish?"Inget stickprov hittades i den kontrollerade insamlingen.":"No sample was found in the checked collection."):(swedish?"Arkivkontrollen gav inget säkert underlag.":"The archive check did not return reliable evidence.")}</p>
      {archive.status!=="observed" && <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Avsaknad av arkivdata bevisar inte att domänen saknar historik.":"Missing archive data does not prove that the domain has no history."}</p>}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{swedish?"Kontrollerat":"Checked"}</dt><dd className="mt-1 font-medium">{time(archive.checkedAt)}</dd></div>
        {archive.collection && <div><dt className="text-muted-foreground">{swedish?"Insamling":"Collection"}</dt><dd className="mt-1 font-medium">{archive.collection}</dd></div>}
        {archive.status==="observed" && <><div><dt className="text-muted-foreground">{swedish?"Metadata i stickprovet":"Metadata samples"}</dt><dd className="mt-1 font-medium">{archive.sampleCount} / {archive.sampleLimit}</dd></div>
          <div><dt className="text-muted-foreground">{swedish?"HTTP-status i stickprovet":"HTTP statuses in the sample"}</dt><dd className="mt-1 font-medium">{archive.sampleStatuses.join(", ")}</dd></div>
          <div><dt className="text-muted-foreground">{swedish?"Tidigast i stickprovet":"Earliest in the sample"}</dt><dd className="mt-1 font-medium">{time(archive.earliestSampleAt!)}</dd></div>
          <div><dt className="text-muted-foreground">{swedish?"Senast i stickprovet":"Latest in the sample"}</dt><dd className="mt-1 font-medium">{time(archive.latestSampleAt!)}</dd></div></>}
      </dl>
      {archive.sourceUrl && !candidate.sensitive && candidate.risk.level!=="excluded" && <a className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={archive.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{swedish?"Öppna metadatafrågan hos Common Crawl":"Open the metadata query at Common Crawl"}</a>}
    </section>}
    {history && <section className="rounded-lg border border-border p-4">
      <h5 className="text-sm font-semibold">{swedish?"Sajdas observationshistorik":"Sajda observation history"}</h5>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{swedish?"Ditt kontos kontroller under de senaste 180 dagarna. Detta är inte domänens ägar- eller trafikhistorik.":"Your account's checks over the last 180 days. This is not the domain's ownership or traffic history."}</p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{swedish?"Först observerad i urvalet":"First seen in this window"}</dt><dd className="mt-1 font-medium">{time(history.firstObservedAt)}</dd></div>
        <div><dt className="text-muted-foreground">{swedish?"Kontroller / olika källdomäner":"Checks / distinct source domains"}</dt><dd className="mt-1 font-medium">{history.observations} / {history.independentSources}</dd></div>
      </dl>
      {history.registryChanged && <p className="mt-3 rounded-md bg-primary/5 p-3 text-sm font-medium">{swedish?"Registerstatus har ändrats sedan föregående kontroll.":"Registry status changed since the previous check."} {history.previousObservedAt && time(history.previousObservedAt)}</p>}
    </section>}
  </div>;
}

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, BookOpen, Crosshair, FlaskConical, Layers3, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDraftNavigationGuard } from "@/contexts/DraftNavigationContext";
import { tradingPortalCopy, type TradingPortalCopy } from "@/i18n/tradingPortalCopy";
import { getLostDomainsCopy } from "@/i18n/lostDomainsCopy";
import { tradingLocale } from "@/i18n/tradingEvidenceCopy";
import type { Language } from "@/i18n/languagePreference";
import type { LostDomainAssessment } from "@/lib/lostDomains";
import { isCurrentTradingEvidence, isFreshTradingEvidence, rankTradingPortal, tradingEvidenceCoverage, tradingReportComposition } from "@/lib/tradingPortal";
import { tradingText } from "@/i18n/tradingEvidenceCopy";
import { getTradingScenarios, saveTradingScenario, TradingScenariosError } from "@/lib/tradingScenarios";
import { canonicalTradingRegistrarDomain } from "../../shared/trading-registrar";
import { evaluateTradingScenario, tradingScenarioInputSchema, type TradingAnalysisMode, type TradingScenario, type TradingScenarioAssumptions, type TradingScenarioInput } from "../../shared/trading-scenarios";

type View = "radar" | "twin" | "scenarios" | "journal";
type MoneyField = keyof TradingScenarioAssumptions;
type Draft = Omit<TradingScenarioInput, "id" | "assumptions"> & {id:string; assumptions:Record<MoneyField,string>};
const modes: TradingAnalysisMode[] = ["balanced","brand","acquisition","risk"];
const fields: MoneyField[] = ["acquisitionUsd","annualRenewalUsd","otherCostsUsd","holdingMonths","sellingFeePercent","saleProbabilityPercent","bearSaleUsd","baseSaleUsd","bullSaleUsd"];
const frame = "rounded-2xl border border-border bg-card";
const control = "mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action = "min-h-11 h-auto whitespace-normal px-4 py-3";
function localCalendarDay(at = Date.now()) {
  const date = new Date(at);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
}
function emptyDraft(domain = ""):Draft {
  return {id:"",expectedVersion:0,domain,title:"",thesis:"",catalyst:"",invalidation:"",reviewOn:localCalendarDay(),stance:"neutral",analysisMode:"balanced",
    assumptions:{acquisitionUsd:"",annualRenewalUsd:"",otherCostsUsd:"0",holdingMonths:"12",sellingFeePercent:"",saleProbabilityPercent:"",bearSaleUsd:"",baseSaleUsd:"",bullSaleUsd:""}};
}
function draftFromSaved(row:TradingScenario):Draft {
  const {version,createdAt:_createdAt,updatedAt:_updatedAt,...input}=row;
  return {...input,expectedVersion:version,assumptions:Object.fromEntries(fields.map(key=>[key,String(row.assumptions[key])])) as Draft["assumptions"]};
}
function parseTradingScenarioDraft(draft:Draft) {
  const numbers=Object.fromEntries(fields.map(key=>[key,draft.assumptions[key].trim()===""?NaN:Number(draft.assumptions[key])]));
  const result=tradingScenarioInputSchema.safeParse({...draft,id:draft.id||"00000000-0000-4000-8000-000000000001",
    domain:canonicalTradingRegistrarDomain(draft.domain)??draft.domain,assumptions:numbers});
  return result.success?{success:true as const,data:result.data as TradingScenarioInput}:{success:false as const,error:result.error};
}
interface Props {accountId:string;language:Language;candidates:readonly LostDomainAssessment[];now:number;onAccessLost?:()=>void}
export default function TradingPortal({accountId,language,candidates,now,onAccessLost}:Props) {
  const c=tradingPortalCopy[language], id=useId(), locale=tradingLocale[language];
  const [view,setView]=useState<View>("radar"), [mode,setMode]=useState<TradingAnalysisMode>("balanced"), [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string|null>(null), [draft,setDraft]=useState<Draft>(emptyDraft), [dirty,setDirty]=useState(false);
  const [saved,setSaved]=useState<{owner:string;rows:TradingScenario[]}|null>(null);
  const [busy,setBusy]=useState<"load"|"save"|null>(null), [error,setError]=useState<TradingScenariosError|null>(null);
  const [errorOperation,setErrorOperation]=useState<"load"|"save"|null>(null);
  const [savedNotice,setSavedNotice]=useState(false), [invalid,setInvalid]=useState(false), [revoked,setRevoked]=useState(false);
  const life=useRef<AbortController|null>(null), owner=useRef(accountId), pending=useRef(false);
  const retryInput=useRef<TradingScenarioInput|null>(null);
  const navigation=useRef<HTMLElement|null>(null), previousView=useRef<View>("radar");
  const panel=useRef<HTMLDivElement|null>(null);
  const onAccessLostRef=useRef(onAccessLost); onAccessLostRef.current=onAccessLost;
  const rows=saved?.owner===accountId?saved.rows:[];
  useDraftNavigationGuard(accountId,dirty&&!revoked&&owner.current===accountId);
  const money=(value:number|null)=>value===null?"—":new Intl.NumberFormat(locale,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
  const time=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
  useLayoutEffect(()=>{
    owner.current=accountId;life.current=new AbortController();pending.current=false;retryInput.current=null;
    setSaved(null);setDraft(emptyDraft());setDirty(false);setError(null);setErrorOperation(null);setSavedNotice(false);setRevoked(false);setView("radar");setSelected(null);setQuery("");setMode("balanced");setInvalid(false);setBusy(null);
    return()=>life.current?.abort();
  },[accountId]);
  const load=useCallback(async()=>{
    if(pending.current||life.current?.signal.aborted)return;
    const signal=life.current?.signal;
    pending.current=true;setBusy("load");setError(null);setErrorOperation(null);
    try {
      const value=await getTradingScenarios({accountId,signal});
      if(!signal?.aborted&&owner.current===accountId)setSaved({owner:accountId,rows:value.scenarios});
    } catch(cause) {
      if(!signal?.aborted&&owner.current===accountId) {
        const failure=cause instanceof TradingScenariosError?cause:new TradingScenariosError("unavailable");
        setError(failure);setErrorOperation("load");
        if(["account_changed","unauthenticated","trading_required"].includes(failure.code)){setSaved(null);setDraft(emptyDraft());setDirty(false);setRevoked(true);onAccessLostRef.current?.();}
      }
    } finally {if(!signal?.aborted&&owner.current===accountId){pending.current=false;setBusy(null);}}
  },[accountId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!dirty||typeof window==="undefined"||!window.addEventListener)return;
    const protectDraft=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",protectDraft);
    return()=>window.removeEventListener("beforeunload",protectDraft);
  },[dirty]);
  useLayoutEffect(()=>{
    if(previousView.current!==view){
      navigation.current?.scrollIntoView({block:"start",behavior:"instant"});
      panel.current?.focus({preventScroll:true});
    }
    previousView.current=view;
  },[view]);
  const ranked=useMemo(()=>rankTradingPortal(candidates,mode,query,now),[candidates,mode,query,now]);
  const composition=useMemo(()=>tradingReportComposition(candidates),[candidates]);
  // A refreshed report may no longer contain the user's selection. Never silently
  // turn that selection into a different domain while its twin is being reviewed.
  const twin=selected===null?ranked[0]?.row??null:candidates.find(row=>row.domain===selected)??null;
  const parsed=useMemo(()=>parseTradingScenarioDraft(draft),[draft]);
  const calculation=parsed.success?evaluateTradingScenario(parsed.data.assumptions):null;
  const invalidFields=new Set(invalid&&!parsed.success?parsed.error.issues.map(issue=>issue.path.join(".")):[]);
  const fieldClass=(field:string)=>control+(invalidFields.has(field)?" border-destructive ring-1 ring-destructive":"");
  const errorText=error?.code==="conflict"?c.conflict:error?.code==="limit"?c.scenarioLimit:
    error?.code==="trading_required"?c.accessRequired:error?.code==="unauthenticated"||error?.code==="account_changed"?c.authRequired:
    errorOperation==="load"?c.loadError:error?.code==="invalid"?c.invalidInput:c.saveError;
  function mutate(patch:Partial<Draft>) {if(pending.current)return;setDraft(value=>({...value,...patch}));setDirty(true);setSavedNotice(false);setInvalid(false);retryInput.current=null;}
  function replaceDraft(next:Draft) {
    if(pending.current)return;
    if(dirty&&!window.confirm(c.discardChanges))return;
    setDraft(next);setDirty(false);setInvalid(false);setSavedNotice(false);setError(null);setErrorOperation(null);retryInput.current=null;setView("scenarios");
  }
  function createScenario(domain="") {replaceDraft({...emptyDraft(domain),analysisMode:mode});}
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(pending.current||revoked)return;
    if(!parsed.success){setInvalid(true);const first=parsed.error.issues[0]?.path.join(".");const element=first?event.currentTarget?.elements?.namedItem(first):null;if(element&&"focus" in element)(element as HTMLElement).focus();return;}
    let input=retryInput.current;
    try {input??={...parsed.data,id:draft.id||crypto.randomUUID()};} catch {setError(new TradingScenariosError("unavailable"));setErrorOperation("save");return;}
    retryInput.current=input;
    if(!draft.id)setDraft(previous=>({...previous,id:input!.id}));
    const signal=life.current?.signal;
    pending.current=true;setBusy("save");setError(null);setErrorOperation(null);setSavedNotice(false);
    try {
      const value=await saveTradingScenario({accountId,signal},input);
      if(signal?.aborted||owner.current!==accountId)return;
      const persisted=value.scenarios.find(row=>row.id===input!.id);
      if(!persisted)throw new TradingScenariosError("invalid");
      setSaved({owner:accountId,rows:value.scenarios});setDraft(draftFromSaved(persisted));setDirty(false);setSavedNotice(true);retryInput.current=null;
    } catch(cause) {
      if(!signal?.aborted&&owner.current===accountId) {
        const failure=cause instanceof TradingScenariosError?cause:new TradingScenariosError("unavailable");setError(failure);setErrorOperation("save");
        if(["account_changed","unauthenticated","trading_required"].includes(failure.code)){setSaved(null);setDraft(emptyDraft());setDirty(false);setRevoked(true);onAccessLostRef.current?.();}
      }
    } finally {if(!signal?.aborted&&owner.current===accountId){pending.current=false;setBusy(null);}}
  }
  if(revoked)return <section className={frame+" mb-6 p-5"} role="alert"><h2 className="font-semibold">{c.authRequired}</h2><p className="mt-2 text-sm">{errorText}</p></section>;
  return <section aria-labelledby={id+"-title"} className={frame+" mb-7 overflow-hidden"} data-testid="trading-portal">
    <header className="bg-[#122338] px-5 py-6 text-white sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-sky-200">Sajda Trading</p>
          <h2 id={id+"-title"} className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{c.intro}</p></div>
        <Button className={action+" shrink-0 bg-white text-slate-950 hover:bg-slate-100"} onClick={()=>createScenario()} disabled={Boolean(busy)}><Plus className="h-4 w-4" aria-hidden="true"/>{c.createThesis}</Button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/15 pt-5 sm:grid-cols-4">
        <Stat label={c.allCandidates} value={candidates.length}/>
        <Stat label={c.freshSignals} value={candidates.filter(row=>tradingEvidenceCoverage(row,now)===4).length}/>
        <Stat label={c.changedRegistry} value={candidates.filter(row=>row.observationHistory?.registryChanged).length}/>
        <Stat label={c.trackedScenarios} value={saved?rows.length:"—"}/>
      </dl>
    </header>
    <nav ref={navigation} aria-label={c.title} className="grid scroll-mt-40 grid-cols-2 gap-1 border-b border-border bg-secondary/40 p-2 sm:scroll-mt-24 sm:grid-cols-4">
      {([["radar",Crosshair],["twin",Layers3],["scenarios",FlaskConical],["journal",BookOpen]] as const).map(([key,Icon])=><button key={key} type="button" aria-pressed={view===key} aria-controls={id+"-panel"}
        onClick={()=>setView(key)} className={"flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring "+(view===key?"bg-card text-primary shadow-sm":"text-muted-foreground hover:bg-card/60")}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>{c.tabs[key]}</button>)}
    </nav>
    {view==="radar"&&<div ref={panel} id={id+"-panel"} data-trading-panel={view} role="region" aria-label={c.tabs.radar} tabIndex={-1} className="space-y-6 p-5 outline-none sm:p-7">
      <div><h3 className="text-xl font-semibold">{c.radarTitle}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{c.radarIntro}</p></div>
      <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide">{c.modeLabel}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{modes.map(key=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}
          className={"min-h-11 rounded-xl border px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring "+(mode===key?"border-primary bg-primary/10 text-primary":"border-border")}>{c.modes[key]}</button>)}</div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.modeHelp[mode]}</p>
      </fieldset>
      <label className="block text-sm font-medium">{c.searchDomains}<input className={control} value={query} maxLength={253} onChange={e=>setQuery(e.target.value)} type="search"/></label>
      {ranked.length?<><div className="grid gap-3 lg:grid-cols-2">{ranked.slice(0,30).map(({row,score})=><button key={row.domain} type="button" onClick={()=>{setSelected(row.domain);setView("twin");}}
        className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0"><span className="block break-all text-base font-semibold">{row.domain}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{row.reviewStatus==="excluded"?c.stateLabels.excluded:c.stateLabels[row.registryStatus]} · {tradingEvidenceCoverage(row,now)}/4 {c.checks}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-primary"><span className="text-lg font-semibold tabular-nums">{score}<span className="text-xs font-normal text-muted-foreground">/100</span></span><ArrowUpRight className="h-4 w-4" aria-hidden="true"/></span>
      </button>)}</div><p className="text-xs leading-5 text-muted-foreground">{Math.min(30,ranked.length)} / {ranked.length} · {c.modeDisclaimer}</p></>:
        <Empty title={c.noCandidatesTitle} body={c.noCandidatesBody}><Button className={action} onClick={()=>createScenario()}>{c.createThesis}</Button><a className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-primary underline" href="#plus-workspace-title">{c.backToResearch}</a></Empty>}
      {!!composition.length&&<section className="border-t border-border pt-5"><h4 className="font-semibold">{c.trendTitle}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{c.trendNote}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{composition.slice(0,10).map(group=><div key={group.extension} className="rounded-xl bg-secondary/50 p-3">
          <div className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold">.{group.extension}</span><span>{group.count} {c.candidates}</span></div>
          <div className="my-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{width:(group.count/Math.max(1,candidates.length)*100)+"%"}}/></div>
          <p className="text-xs text-muted-foreground">{group.changed} {c.registryChanges}</p></div>)}</div>
      </section>}
    </div>}
    {view==="twin"&&<div ref={panel} id={id+"-panel"} data-trading-panel={view} role="region" aria-label={c.tabs.twin} tabIndex={-1} className="p-5 outline-none sm:p-7">{twin?<DomainTwin row={twin} c={c} language={language} now={now} money={money} time={time} onScenario={()=>createScenario(twin.domain)}/>:
      <Empty title={selected===null?c.noSelectionTitle:c.selectedMissingTitle} body={selected===null?c.noSelectionBody:c.selectedMissingBody}><Button className={action} onClick={()=>setView("radar")}>{c.tabs.radar}</Button><Button variant="outline" className={action} onClick={()=>createScenario()}>{c.createThesis}</Button></Empty>}</div>}
    {view==="scenarios"&&<div ref={panel} id={id+"-panel"} data-trading-panel={view} role="region" aria-label={c.tabs.scenarios} tabIndex={-1} className="p-5 outline-none sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{c.scenarioTitle}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{c.scenarioIntro}</p></div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{dirty?c.unsaved:draft.expectedVersion?c.saved:c.assumed}</span></div>
      <form onSubmit={save} className="space-y-6" noValidate aria-describedby={invalid?id+"-errors":undefined}>
        <fieldset disabled={Boolean(busy)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">{c.domain}<input name="domain" aria-invalid={invalidFields.has("domain")} className={fieldClass("domain")} required maxLength={253} value={draft.domain} onChange={e=>mutate({domain:e.target.value})} aria-describedby={id+"-domain-help"} autoCapitalize="none" spellCheck={false}/><span id={id+"-domain-help"} className="mt-1 block text-xs font-normal text-muted-foreground">{c.domainHint}</span></label>
            <label className="text-sm font-medium">{c.scenarioName}<input name="title" aria-invalid={invalidFields.has("title")} className={fieldClass("title")} required maxLength={100} value={draft.title} onChange={e=>mutate({title:e.target.value})}/></label></div>
          <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">{c.stance}<select className={control} value={draft.stance} onChange={e=>mutate({stance:e.target.value as Draft["stance"]})}>{(["bullish","neutral","bearish"] as const).map(key=><option key={key} value={key}>{c.stanceLabels[key]}</option>)}</select></label>
            <label className="text-sm font-medium">{c.modeLabel}<select className={control} value={draft.analysisMode} onChange={e=>mutate({analysisMode:e.target.value as TradingAnalysisMode})}>{modes.map(key=><option key={key} value={key}>{c.modes[key]}</option>)}</select></label>
            <label className="text-sm font-medium">{c.reviewOn}<input name="reviewOn" aria-invalid={invalidFields.has("reviewOn")} className={fieldClass("reviewOn")} type="date" required value={draft.reviewOn} onChange={e=>mutate({reviewOn:e.target.value})}/></label></div>
          <label className="block text-sm font-medium">{c.thesis}<textarea className={control+" min-h-24"} maxLength={2000} value={draft.thesis} onChange={e=>mutate({thesis:e.target.value})}/></label>
          <div className="grid gap-4 sm:grid-cols-2">{(["catalyst","invalidation"] as const).map(key=><label key={key} className="text-sm font-medium">{c[key]}<textarea className={control+" min-h-20"} maxLength={1000} value={draft[key]} onChange={e=>mutate({[key]:e.target.value})}/></label>)}</div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-semibold">{c.assumed}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{c.assumptionNotice}</p></div>
          <div className="grid gap-4 sm:grid-cols-3">{fields.map(key=><label key={key} className="text-sm font-medium">{c[key]}<input name={"assumptions."+key} aria-invalid={invalidFields.has("assumptions."+key)} className={fieldClass("assumptions."+key)+" tabular-nums"} required type="number" inputMode="decimal" min={key==="holdingMonths"?1:0}
            max={key==="holdingMonths"?120:key==="sellingFeePercent"?99:key==="saleProbabilityPercent"?100:100000000} step={key==="holdingMonths"?1:.01} value={draft.assumptions[key]}
            onChange={e=>mutate({assumptions:{...draft.assumptions,[key]:e.target.value}})}/></label>)}</div>
          <p className="text-xs leading-5 text-muted-foreground">{c.renewalConvention} {c.probabilityNotice}</p>
        </fieldset>
        {invalid&&<p id={id+"-errors"} className="text-sm text-destructive" role="alert">{c.invalidInput}</p>}
        {calculation?<section className="rounded-2xl border border-border bg-secondary/25 p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4"><Stat label={c.totalOutlay} value={money(calculation.totalCostUsd)}/><Stat label={c.breakEvenPrice} value={money(calculation.breakEvenSaleUsd)}/><Stat label={c.expectedBreakEven} value={money(calculation.probabilityAdjustedBreakEvenUsd)}/><Stat label={c.noSaleCashflow} value={money(calculation.noSaleCashflowUsd)}/></dl>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">{calculation.cases.map(outcome=><div key={outcome.key} className="min-w-0 rounded-xl border border-border bg-card p-4"><h4 className="text-sm font-semibold">{c[outcome.key]}</h4>
            <p className="mt-2 break-all text-xl font-semibold tabular-nums">{money(outcome.netIfSoldUsd)}</p><p className="text-xs text-muted-foreground">{c.netIfSold}</p>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs"><div className="flex flex-wrap justify-between gap-1"><dt>{c.weightedCashflow}</dt><dd className="font-semibold">{money(outcome.probabilityWeightedNetUsd)}</dd></div>
              <div className="flex justify-between gap-1"><dt>{c.roiIfSold}</dt><dd>{outcome.roiIfSoldPercent===null?"—":new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(outcome.roiIfSoldPercent)+"%"}</dd></div></dl></div>)}</div>
          <h4 className="mt-6 text-sm font-semibold">{c.sensitivity}</h4>
          <ScenarioCurve points={calculation.sensitivity} label={c.sensitivity} note={c.assumptionNotice} money={money} months={c.months} locale={locale}/>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{calculation.sensitivity.map(point=><div key={point.holdingMonths} className="rounded-xl border border-border p-3"><p className="text-xs font-semibold">{point.holdingMonths} {c.months}</p><p className="mt-2 text-sm tabular-nums">{money(point.baseNetIfSoldUsd)}</p><p className="text-xs text-muted-foreground">{c.base} · {c.netIfSold}</p></div>)}</div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{c.cashflowNotice}</p>
        </section>:<div className="rounded-xl bg-secondary/50 p-4"><h4 className="text-sm font-semibold">{c.noModelYet}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{c.noModelBody}</p></div>}
        <div className="flex flex-wrap items-center gap-3"><Button className={action} type="submit" disabled={Boolean(busy)}>{busy==="save"?<LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>:<Save className="h-4 w-4" aria-hidden="true"/>}{busy==="save"?c.saving:draft.expectedVersion?c.save:c.saveNew}</Button>
          <Button className={action} type="button" variant="outline" onClick={()=>createScenario()} disabled={Boolean(busy)}>{c.resetDraft}</Button>
          {savedNotice&&<p className="text-sm font-medium text-primary" role="status">{c.scenarioSaved}</p>}</div>
      </form>
    </div>}
    {view==="journal"&&<div ref={panel} id={id+"-panel"} data-trading-panel={view} role="region" aria-label={c.tabs.journal} tabIndex={-1} className="space-y-5 p-5 outline-none sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{c.journalTitle}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{c.journalIntro}</p></div>
        <Button className={action} variant="outline" disabled={Boolean(busy)} onClick={()=>void load()}><RefreshCw className="h-4 w-4" aria-hidden="true"/>{c.reload}</Button></div>
      {busy==="load"&&<p role="status" className="text-sm">{c.loading}</p>}
      {rows.length?<><p className="text-xs text-muted-foreground">{rows.length}/100 · {c.limitNotice}</p><div className="grid gap-3 lg:grid-cols-2">{rows.map(row=><article key={row.id} className="min-w-0 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-all text-base font-semibold">{row.domain}</h4><span className="rounded-full bg-secondary px-2 py-1 text-xs">{c.stanceLabels[row.stance]}</span></div>
        <p className="mt-1 break-words text-sm font-medium">{row.title}</p><p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{row.thesis}</p>
        <dl className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><div><dt className="text-muted-foreground">{c.totalOutlay}</dt><dd className="mt-1 font-semibold">{money(evaluateTradingScenario(row.assumptions).totalCostUsd)}</dd></div>
          <div><dt className="text-muted-foreground">{c.reviewOn}</dt><dd className="mt-1 font-semibold"><time dateTime={row.reviewOn}>{row.reviewOn}</time>{row.reviewOn<=localCalendarDay(now)?" · "+c.reviewDue:""}</dd></div></dl>
        <p className="mt-3 text-xs text-muted-foreground">{c.version} {row.version} · {c.updatedAt} {time(row.updatedAt)}</p>
        <Button variant="outline" className={action+" mt-4 w-full"} onClick={()=>replaceDraft(draftFromSaved(row))} disabled={Boolean(busy)}>{c.openScenarioEdit}</Button>
      </article>)}</div></>:!busy&&!error&&<Empty title={c.emptyJournalTitle} body={c.emptyJournalBody}><Button className={action} onClick={()=>createScenario()}>{c.createThesis}</Button></Empty>}
    </div>}
    {error&&<div className="mx-5 mb-5 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:mx-7" role="alert">
      <p className="text-sm leading-6">{errorText}</p>
      {error.requestId&&<p className="mt-1 text-xs">{error.requestId}</p>}
      {(errorOperation==="load"||view!=="scenarios")&&<Button variant="outline" className={action+" mt-2"} disabled={Boolean(busy)} onClick={()=>void load()}>{c.retry}</Button>}
      {error.code==="conflict"&&<Button variant="outline" className={action+" mt-2"} disabled={Boolean(busy)} onClick={()=>{void load();setView("journal");}}>{c.reload}</Button>}
    </div>}
  </section>;
}
function Stat({label,value}:{label:string;value:string|number}) {return <div className="min-w-0"><dt className="text-xs opacity-75">{label}</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</dd></div>;}
function ScenarioCurve({points,label,note,money,months,locale}:{points:Array<{holdingMonths:number;baseNetIfSoldUsd:number}>;label:string;note:string;money:(n:number|null)=>string;months:string;locale:string}) {
  const id=useId(),min=Math.min(0,...points.map(p=>p.baseNetIfSoldUsd)),max=Math.max(0,...points.map(p=>p.baseNetIfSoldUsd));
  const span=max-min||1,first=points[0].holdingMonths,last=points[points.length-1].holdingMonths;
  const x=(month:number)=>65+(month-first)/Math.max(1,last-first)*365,y=(value:number)=>22+(max-value)/span*115;
  return <figure className="mt-3 overflow-hidden rounded-xl border border-border bg-card p-3">
    <svg viewBox="0 0 450 178" className="w-full" role="img" aria-labelledby={id+"-title "+id+"-desc"}>
      <title id={id+"-title"}>{label}</title><desc id={id+"-desc"}>{note+" "+points.map(p=>p.holdingMonths+" "+months+": "+money(p.baseNetIfSoldUsd)).join("; ")}</desc>
      {[max,min].map((value,index)=><g key={index}><line x1="65" x2="430" y1={y(value)} y2={y(value)} className="stroke-border" strokeDasharray="3 3"/><text x="60" y={y(value)+4} textAnchor="end" fontSize="10" className="fill-muted-foreground">{new Intl.NumberFormat(locale,{notation:"compact",maximumFractionDigits:1}).format(value)}</text></g>)}
      <line x1="65" x2="430" y1={y(0)} y2={y(0)} className="stroke-muted-foreground" opacity=".4"/>
      <polyline points={points.map(p=>x(p.holdingMonths)+","+y(p.baseNetIfSoldUsd)).join(" ")} fill="none" className="stroke-primary" strokeWidth="2.5"/>
      {points.map(p=><g key={p.holdingMonths}><circle cx={x(p.holdingMonths)} cy={y(p.baseNetIfSoldUsd)} r="4" className="fill-primary"/><text x={x(p.holdingMonths)} y="158" textAnchor="middle" fontSize="11" className="fill-muted-foreground">{p.holdingMonths}</text></g>)}
      <text x="65" y="12" fontSize="10" className="fill-muted-foreground">USD</text><text x="247" y="175" textAnchor="middle" fontSize="10" className="fill-muted-foreground">{months}</text>
    </svg>
  </figure>;
}
function Empty({title,body,children}:{title:string;body:string;children?:React.ReactNode}) {return <div className="rounded-xl border border-dashed border-border p-6 text-center"><h4 className="font-semibold">{title}</h4><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div></div>;}
function DomainTwin({row,c,language,now,money,time,onScenario}:{row:LostDomainAssessment;c:TradingPortalCopy;language:Language;now:number;money:(n:number|null)=>string;time:(s:string)=>string;onScenario:()=>void}) {
  const keys=[["registry","registry"],["dns","dns"],["web","target_http"],["mail","mail"]] as const;
  const quote=row.registrar,quoteFresh=quote?.status==="checked"&&Date.parse(quote.checkedAt)<=now&&Date.parse(quote.expiresAt)>now;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{c.twinTitle}</p><h3 className="mt-2 break-all text-2xl font-semibold">{row.domain}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{c.twinIntro}</p></div>
      <Button className={action} onClick={onScenario}><FlaskConical className="h-4 w-4" aria-hidden="true"/>{c.openScenario}</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{keys.map(([label,kind])=>{
      const evidence=row.evidence.filter(e=>e.kind===kind).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
      const simultaneous=evidence?row.evidence.filter(e=>e.kind===kind&&Date.parse(e.observedAt)===Date.parse(evidence.observedAt)):[];
      const coherent=new Set(simultaneous.map(e=>e.outcome)).size===1;
      const current=coherent&&simultaneous.every(e=>isCurrentTradingEvidence(e,now));
      return <section key={kind} className="min-w-0 rounded-xl border border-border p-4"><Activity className="mb-3 h-5 w-5 text-primary" aria-hidden="true"/><h4 className="font-semibold">{c.evidenceLabels[label]}</h4>
        <p className="mt-1 text-xs font-medium">{!evidence?c.missing:current?c.observed:isFreshTradingEvidence(evidence,now)?c.unknown:c.evidenceExpired}</p>
        {evidence&&<><p className="mt-3 break-words text-xs leading-5 text-muted-foreground">{!coherent?c.unknown:kind==="registry"?c.stateLabels[evidence.outcome as keyof typeof c.stateLabels]??c.unknown:getLostDomainsCopy(language).outcomes[evidence.outcome]??c.unknown}</p>
          <p className="mt-2 text-xs text-muted-foreground"><time dateTime={evidence.observedAt}>{time(evidence.observedAt)}</time></p><p className="mt-2 break-all text-xs text-muted-foreground">{c.source}: {evidence.source}</p></>}
      </section>;
    })}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border p-5"><h4 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden="true"/>{c.evidenceLabels.price}</h4>
        <p className="mt-3 text-xl font-semibold">{quoteFresh?money(quote.minimumRegistrationSubtotalMinor===null?null:quote.minimumRegistrationSubtotalMinor/100):"—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{quoteFresh?c.observed:c.missing}</p>
        {quoteFresh&&<><dl className="mt-3 space-y-2 text-xs"><div><dt className="text-muted-foreground">{c.source}</dt><dd>Porkbun · {quote.availability==="available"?tradingText(language,"Available to register"):quote.availability==="unavailable"?tradingText(language,"Unavailable to register"):c.unknown}</dd></div><div><dt className="text-muted-foreground">{c.checkedAt}</dt><dd><time dateTime={quote.checkedAt}>{time(quote.checkedAt)}</time></dd></div>
          <div><dt className="text-muted-foreground">{tradingText(language,"Minimum registration term")}</dt><dd>{quote.minRegistrationYears===null?"—":quote.minRegistrationYears+" "+tradingText(language,"years")}</dd></div></dl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{tradingText(language,"Registration for the minimum term, before unconfirmed extras")}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{tradingText(language,"Tax, fees, mandatory add-ons and the renewal contract term are unverified. This is not a final payable total or a reservation.")}</p></>}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.evidenceNotice}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{c.noPriceHistory}</p></section>
      <section className="rounded-xl border border-border p-5"><h4 className="font-semibold">{c.observedHistory}</h4>
        {row.observationHistory?<dl className="mt-3 space-y-3 text-xs">{([[c.firstObserved,time(row.observationHistory.firstObservedAt)],[c.lastObserved,time(row.observationHistory.lastObservedAt)],[c.observations,String(row.observationHistory.observations)],[c.previousStatus,row.observationHistory.previousRegistryStatus?c.stateLabels[row.observationHistory.previousRegistryStatus]:c.unknown]]).map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl>:<p className="mt-3 text-sm text-muted-foreground">{c.missing}</p>}
      </section>
    </div>
    <a href="#trading-results" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">{c.allResearch}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></a>
  </div>;
}

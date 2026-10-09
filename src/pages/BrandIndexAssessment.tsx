import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ClipboardList, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NamePackageMarkets from "@/components/NamePackageMarkets";
import BrandEvidencePanel from "@/components/BrandEvidencePanel";
import BrandReportMonitoring from "@/components/BrandReportMonitoring";
import FreeSearchGate from "@/components/FreeSearchGate";
import { useScan } from "@/contexts/ScanContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDraftNavigationGuard, useLocalDraftNavigationGuard } from "@/contexts/DraftNavigationContext";
import { createBrandEvidenceReport } from "../../shared/brand-evidence";
import { buildBrandDomainCheckPlan, checkBrandDomainBatch, projectBrandDomainEvidence } from "@/lib/brandDomainEvidence";
import { brandDomainCheckCopy } from "@/i18n/brandDomainCheckCopy";
import { applyDocumentMetadata, useLanguage, type Language } from "@/i18n/LanguageProvider";
import { brandIndexCopy } from "@/i18n/brandIndexCopy";
import { brandLookupCopy } from "@/i18n/brandLookupCopy";
import { brandWorksheetCopy } from "@/i18n/brandWorksheetCopy";
import { brandReportsCopy } from "@/i18n/brandReportsCopy";
import { BrandReportsError, brandReportSaveFailureIsUncertain, getBrandReports, getBrandReport, getBrandReportHistory, saveBrandReport } from "@/lib/brandReportsClient";
import type { BrandReportSaveInput, BrandReportSnapshot, BrandReportSummary, BrandReportVersionSummary } from "../../shared/brand-reports";
import { brandChecksCopy } from "@/i18n/brandChecksCopy";
import { BrandChecksError, brandCheckFailureIsUncertain, getBrandChecks, startBrandCheck } from "@/lib/brandChecksClient";
import type { BrandCheckRun, BrandChecksStartInput } from "../../shared/brand-checks";
import { exportBrandAssessment } from "@/lib/brandAssessmentExport";
import { isNativeApp } from "@/lib/appSurface";
import { nativeShareFile } from "@/lib/nativeTransport";
import { namePackageCountryName } from "@/i18n/namePackageMarketsCopy";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { socialPlatformNames } from "@/lib/namePackageExport";
import { SOCIAL_PLATFORMS, type SocialPlatform, type PackageDomainInput } from "../../shared/name-packages";
import { DEFAULT_NAME_PACKAGE_MARKETS, type NamePackageMarketCode } from "../../shared/name-package-markets";
import { assessBrandPresence, brandIndexInputSchema, BRAND_INDEX_STATUSES, type BrandIndexInput, type BrandIndexResult } from "../../shared/brand-presence-index";

const field = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action = "h-auto min-h-12 whitespace-normal px-4 py-3 text-left leading-6";
type ReportStatus = BrandIndexInput["observations"][number]["status"];
type Target = BrandIndexResult["targets"][number];

/** Account versions retain self-reports. Session-only checks and separately
 * archived source checks never alter the self-reported index or prove ownership. */
export default function BrandIndexAssessment() {
  const { user } = useAuth();
  // A new session never receives the prior session's public but private-to-user worksheet.
  return <LocalBrandWorksheet key={user ? `account:${user.id}` : "local:anonymous"} ownerId={user?.id ?? null} verified={user?.email_verified === true} />;
}

function LocalBrandWorksheet({ ownerId, verified }: { ownerId: string | null; verified: boolean }) {
  const { language } = useLanguage(), c = brandIndexCopy[language];
  const wc = brandWorksheetCopy[language], rc = brandReportsCopy[language];
  const dc = brandDomainCheckCopy[language], scan = useScan();
  const [brandName, setBrandName] = useState(""), [identity, setIdentity] = useState(""), [primary, setPrimary] = useState(""), [extraDomains, setExtraDomains] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([...SOCIAL_PLATFORMS]);
  const [handles, setHandles] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [markets, setMarkets] = useState<NamePackageMarketCode[]>([...DEFAULT_NAME_PACKAGE_MARKETS]);
  const [input, setInput] = useState<BrandIndexInput | null>(null), inputRef = useRef<BrandIndexInput | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]), [confirmReset, setConfirmReset] = useState(false), [now, setNow] = useState(Date.now);
  const result = useMemo(() => input ? assessBrandPresence(input, now) : null, [input, now]);
  const [domainRows, setDomainRows] = useState<PackageDomainInput[]>([]), [checking, setChecking] = useState(false);
  const [checkNotice, setCheckNotice] = useState<"done" | "failed" | "cancelled" | "limited" | null>(null);
  const domainRequest = useRef<AbortController | null>(null);
  const plan = useMemo(() => input ? buildBrandDomainCheckPlan(input.domains) : null, [input]);
  const domainEvidence = useMemo(() => input ? projectBrandDomainEvidence(input.domains, domainRows, now) : null, [input, domainRows, now]);
  const evidence = useMemo(() => result && domainEvidence ? createBrandEvidenceReport([...result.evidence_report.entries, ...domainEvidence.entries], now) : null, [result, domainEvidence, now]);
  const nameFieldRef = useRef<HTMLInputElement>(null), resultHeadingRef = useRef<HTMLHeadingElement>(null), hadResultRef = useRef(false);
  const hasResult = result !== null;
  const [exporting, setExporting] = useState(false), [exportNotice, setExportNotice] = useState<"downloaded" | "completed" | "cancelled" | "failed" | null>(null);
  const exportingRef = useRef(false), alive = useRef(true);
  const [reports, setReports] = useState<BrandReportSummary[]>([]), [reportsLoading, setReportsLoading] = useState(false);
  const [listError, setListError] = useState<BrandReportsError["code"] | null>(null), [reportError, setReportError] = useState<BrandReportsError["code"] | null>(null);
  const [currentReport, setCurrentReport] = useState<BrandReportSnapshot | null>(null), [historical, setHistorical] = useState(false);
  const [versions, setVersions] = useState<BrandReportVersionSummary[]>([]), [historyId, setHistoryId] = useState<string | null>(null);
  const [operation, setOperation] = useState<"open" | "history" | "save" | null>(null), [saveUncertain, setSaveUncertain] = useState(false);
  const [reportNotice, setReportNotice] = useState<"saved" | "copyReady" | null>(null), [baseline, setBaseline] = useState<string | null>(null);
  const [viewRevision, setViewRevision] = useState(0), [targetDrafts, setTargetDrafts] = useState<string[]>([]);
  const [sourceCheckUnsettled, setSourceCheckUnsettled] = useState(false);
  const [monitorUnsettled, setMonitorUnsettled] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<{ id: string; version?: number } | null>(null);
  const accountRequestRef = useRef<AbortController | null>(null), listRequestRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<BrandReportSaveInput | null>(null);
  const fingerprint = JSON.stringify({ input, brandName, identity, primary, extraDomains, platforms, handles, markets });
  const hasDraft = input !== null || [brandName, identity, primary, extraDomains, ...Object.values(handles)].some(value => value.trim().length > 0)
    || platforms.length !== SOCIAL_PLATFORMS.length || markets.length !== DEFAULT_NAME_PACKAGE_MARKETS.length || markets.some(market => !DEFAULT_NAME_PACKAGE_MARKETS.includes(market));
  const accountDirty = baseline === null ? hasDraft : fingerprint !== baseline;
  const dirty = accountDirty || targetDrafts.length > 0 || domainRows.length > 0 || saveUncertain || sourceCheckUnsettled || monitorUnsettled;
  const locked = historical || operation !== null || saveUncertain || sourceCheckUnsettled || monitorUnsettled;
  useDraftNavigationGuard(ownerId ?? "", !!ownerId && dirty);
  useLocalDraftNavigationGuard(ownerId, !ownerId && dirty);

  useEffect(() => { alive.current = true; return () => { alive.current = false; domainRequest.current?.abort(); domainRequest.current = null; accountRequestRef.current?.abort(); listRequestRef.current?.abort(); pendingSaveRef.current = null; }; }, []);

  useEffect(() => {
    if (!ownerId || !verified) return;
    const controller = new AbortController(); listRequestRef.current = controller; setReportsLoading(true); setListError(null);
    void getBrandReports({ accountId: ownerId, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted && alive.current) setReports(value.reports);
    }).catch(error => { if (!controller.signal.aborted && alive.current) setListError(error instanceof BrandReportsError ? error.code : "unavailable"); })
      .finally(() => { if (!controller.signal.aborted && alive.current) { setReportsLoading(false); if (listRequestRef.current === controller) listRequestRef.current = null; } });
    return () => controller.abort();
  }, [ownerId, verified]);

  useEffect(() => { if (viewRevision > 0) resultHeadingRef.current?.focus(); }, [viewRevision]);

  useEffect(() => {
    applyDocumentMetadata(language, "/brand-index/assessment");
    return () => applyDocumentMetadata(language, window.location.pathname);
  }, [language]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  useEffect(() => {
    // Move focus only between worksheet stages, never when a report or its age changes.
    if (hasResult) resultHeadingRef.current?.focus();
    else if (hadResultRef.current) nameFieldRef.current?.focus();
    hadResultRef.current = hasResult;
  }, [hasResult]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  function build(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const primaryDomain = primary.trim().toLowerCase();
    const requested = [primaryDomain, ...extraDomains.split(/[\s,]+/u).map(value => value.trim().toLowerCase()).filter(Boolean)];
    const parsed = brandIndexInputSchema.safeParse({ brand_name: brandName, identity_label: identity, primary_domain: primaryDomain,
      domains: [...new Set(requested)], socials: platforms.map(platform => ({ platform, handle: handles[platform]?.trim() || identity.trim() })), markets, observations: [] });
    if (!parsed.success) { setInvalidFields([...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "scope")))]); return; }
    domainRequest.current?.abort(); domainRequest.current = null; setChecking(false); setDomainRows([]); setCheckNotice(null);
    inputRef.current = parsed.data; setInput(parsed.data); setNow(Date.now()); setInvalidFields([]); setConfirmReset(false); setExportNotice(null); setReportNotice(null); setTargetDrafts([]); setViewRevision(value => value + 1);
  }
  function record(targetId: string, status: ReportStatus, source: string): boolean {
    const current = inputRef.current;
    if (!current || locked) return false;
    const at = Date.now();
    const parsed = brandIndexInputSchema.safeParse({ ...current, observations: [
      ...current.observations.filter(item => item.target_id !== targetId),
      { target_id: targetId, status, source_url: source.trim() || null, reported_at: new Date(at).toISOString() },
    ] });
    if (!parsed.success) return false;
    inputRef.current = parsed.data; setInput(parsed.data); setNow(at); setExportNotice(null); setReportNotice(null); return true;
  }
  function reset() { if (locked) return; domainRequest.current?.abort(); domainRequest.current = null; setChecking(false); setDomainRows([]); setCheckNotice(null); inputRef.current = null; setInput(null); setConfirmReset(false); setInvalidFields([]); setExportNotice(null); setTargetDrafts([]); setReportNotice(null); }
  function stopChecks() { domainRequest.current?.abort(); domainRequest.current = null; setChecking(false); setCheckNotice("cancelled"); }
  async function checkDomains() {
    if (!plan?.batches.length || domainRequest.current || scan.isScanning || locked) return;
    const controller = new AbortController(); domainRequest.current = controller; setChecking(true); setCheckNotice(null);
    try {
      for (const batch of plan.batches) {
        if (controller.signal.aborted) return;
        const access = scan.requestAnonymousSearchAccess();
        if (!access) { setCheckNotice("limited"); return; }
        try {
          const rows = await checkBrandDomainBatch(batch, language, controller.signal);
          if (controller.signal.aborted || domainRequest.current !== controller) { access.release(); return; }
          const checked = projectBrandDomainEvidence(batch, rows, Date.now());
          if (checked.summary.checked) access.complete(); else access.release();
          setDomainRows(previous => [...previous.filter(row => !batch.includes(row.domain)), ...rows]); setNow(Date.now());
        } catch (error) { access.release(); throw error; }
      }
      if (!controller.signal.aborted && domainRequest.current === controller) setCheckNotice("done");
    } catch { if (!controller.signal.aborted && domainRequest.current === controller) setCheckNotice("failed"); }
    finally { if (domainRequest.current === controller) { domainRequest.current = null; setChecking(false); } }
  }
  async function exportAssessment() {
    if (!input || checking || exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setExportNotice(null);
    try {
      const at = Date.now(), report = exportBrandAssessment(input, domainRows, language, at);
      setNow(at); // A suspended tab and its export use the same age, not renewed observations.
      const filename = `sajda-brand-assessment-${new Date(at).toISOString().slice(0, 10)}.html`;
      if (isNativeApp) {
        const receipt = await nativeShareFile(filename, report);
        if (alive.current) setExportNotice(receipt.completed ? "completed" : "cancelled");
      } else {
        const url = URL.createObjectURL(new Blob([report], { type: "text/html;charset=utf-8" }));
        try {
          const link = document.createElement("a"); link.href = url; link.download = filename;
          document.body.append(link); try { link.click(); } finally { link.remove(); }
          setExportNotice("downloaded");
        } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      }
    } catch { if (alive.current) setExportNotice("failed"); }
    finally { exportingRef.current = false; if (alive.current) setExporting(false); }
  }
  async function refreshReports() {
    if (!ownerId || !verified || operation || saveUncertain) return;
    listRequestRef.current?.abort();
    const controller = new AbortController(); listRequestRef.current = controller; setReportsLoading(true); setListError(null);
    try { const value = await getBrandReports({ accountId: ownerId, signal: controller.signal }); if (!controller.signal.aborted && alive.current) setReports(value.reports); }
    catch (error) { if (!controller.signal.aborted && alive.current) setListError(error instanceof BrandReportsError ? error.code : "unavailable"); }
    finally { if (listRequestRef.current === controller) { listRequestRef.current = null; if (alive.current) setReportsLoading(false); } }
  }
  function applySnapshot(report: BrandReportSnapshot, readOnly: boolean) {
    const value = report.assessment;
    const scopeFields = { brandName: value.brand_name, identity: value.identity_label, primary: value.primary_domain,
      extraDomains: value.domains.filter(domain => domain !== value.primary_domain).join("\n"), platforms: value.socials.map(item => item.platform),
      handles: Object.fromEntries(value.socials.map(item => [item.platform, item.handle])), markets: value.markets };
    domainRequest.current?.abort(); domainRequest.current = null; setChecking(false); setDomainRows([]); setCheckNotice(null);
    setBrandName(scopeFields.brandName); setIdentity(scopeFields.identity); setPrimary(scopeFields.primary); setExtraDomains(scopeFields.extraDomains);
    setPlatforms(scopeFields.platforms); setHandles(scopeFields.handles); setMarkets(scopeFields.markets);
    inputRef.current = value; setInput(value); setNow(Date.now()); setCurrentReport(report); setHistorical(readOnly);
    setBaseline(JSON.stringify({ input: value, ...scopeFields })); setTargetDrafts([]); setConfirmReset(false); setInvalidFields([]); setExportNotice(null); setReportNotice(null);
    setViewRevision(previous => previous + 1);
  }
  async function openReport(selector: { id: string; version?: number }) {
    if (!ownerId || !verified || accountRequestRef.current || saveUncertain || checking || sourceCheckUnsettled || monitorUnsettled) return;
    const controller = new AbortController(); accountRequestRef.current = controller; setOperation("open"); setReportError(null); setPendingOpen(null);
    try {
      const value = await getBrandReport({ accountId: ownerId, signal: controller.signal }, selector);
      if (!controller.signal.aborted && alive.current && accountRequestRef.current === controller) applySnapshot(value.report, selector.version !== undefined);
    } catch (error) { if (!controller.signal.aborted && alive.current) setReportError(error instanceof BrandReportsError ? error.code : "unavailable"); }
    finally { if (accountRequestRef.current === controller) { accountRequestRef.current = null; if (alive.current) setOperation(null); } }
  }
  function requestOpen(selector: { id: string; version?: number }) {
    if (operation || saveUncertain || checking || sourceCheckUnsettled || monitorUnsettled) return;
    if (dirty) setPendingOpen(selector); else void openReport(selector);
  }
  async function showHistory(id: string) {
    if (!ownerId || !verified || accountRequestRef.current || saveUncertain || monitorUnsettled) return;
    const controller = new AbortController(); accountRequestRef.current = controller; setOperation("history"); setReportError(null);
    try {
      const value = await getBrandReportHistory({ accountId: ownerId, signal: controller.signal }, id);
      if (!controller.signal.aborted && alive.current) { setVersions(value.versions); setHistoryId(id); }
    } catch (error) { if (!controller.signal.aborted && alive.current) setReportError(error instanceof BrandReportsError ? error.code : "unavailable"); }
    finally { if (accountRequestRef.current === controller) { accountRequestRef.current = null; if (alive.current) setOperation(null); } }
  }
  function editAsNewReport() {
    if (!input || operation || saveUncertain || targetDrafts.length > 0 || sourceCheckUnsettled || monitorUnsettled) return;
    setCurrentReport(null); setHistorical(false); setBaseline(null); setReportError(null); setReportNotice("copyReady"); setVersions([]); setHistoryId(null); setTargetDrafts([]); setViewRevision(previous => previous + 1);
  }
  async function saveReport() {
    if (!ownerId || !verified || !input || historical || checking || targetDrafts.length > 0 || accountRequestRef.current || sourceCheckUnsettled || monitorUnsettled) return;
    // A timeout keeps this immutable request (including idempotency key). No
    // edited input can be sent until its exact save has been reconciled.
    const payload = pendingSaveRef.current ?? {
      id: currentReport?.id ?? crypto.randomUUID(), requestKey: crypto.randomUUID(), expectedVersion: currentReport?.version ?? 0,
      title: currentReport?.title ?? input.brand_name, assessment: brandIndexInputSchema.parse(input),
    };
    pendingSaveRef.current = payload;
    const savedFingerprint = fingerprint, controller = new AbortController(); accountRequestRef.current = controller;
    setOperation("save"); setReportError(null); setReportNotice(null);
    try {
      const value = await saveBrandReport({ accountId: ownerId, signal: controller.signal }, payload);
      if (controller.signal.aborted || !alive.current || accountRequestRef.current !== controller) return;
      setCurrentReport(value.report); setBaseline(savedFingerprint); setSaveUncertain(false); pendingSaveRef.current = null; setReportNotice("saved");
      setReports(previous => {
        const oldSummary = previous.find(row => row.id === value.report.id);
        // An idempotent receipt can describe an older immutable version after
        // another client has updated the report. It must not downgrade latest.
        if (oldSummary && oldSummary.version > value.report.version) return previous;
        return [{ id: value.report.id, title: value.report.title, version: value.report.version,
          createdAt: oldSummary?.createdAt ?? value.report.savedAt, updatedAt: value.report.savedAt }, ...previous.filter(row => row.id !== value.report.id)];
      });
      listRequestRef.current?.abort();
      const refreshController = new AbortController(); listRequestRef.current = refreshController; setReportsLoading(true);
      void getBrandReports({ accountId: ownerId, signal: refreshController.signal }).then(latest => {
        if (!refreshController.signal.aborted && alive.current) { setReports(latest.reports); setListError(null); }
      }).catch(error => { if (!refreshController.signal.aborted && alive.current) setListError(error instanceof BrandReportsError ? error.code : "unavailable"); })
        .finally(() => { if (listRequestRef.current === refreshController) { listRequestRef.current = null; if (alive.current) setReportsLoading(false); } });
      setVersions([]); setHistoryId(null);
    } catch (error) {
      if (controller.signal.aborted || !alive.current) return;
      const uncertain = brandReportSaveFailureIsUncertain(error);
      setSaveUncertain(uncertain); if (!uncertain) pendingSaveRef.current = null;
      setReportError(error instanceof BrandReportsError ? error.code : "unavailable");
    } finally { if (accountRequestRef.current === controller) { accountRequestRef.current = null; if (alive.current) setOperation(null); } }
  }
  function updateTargetDraft(targetId: string, changed: boolean) {
    setTargetDrafts(previous => changed ? previous.includes(targetId) ? previous : [...previous, targetId] : previous.filter(id => id !== targetId));
  }
  const isInvalid = (name: string) => invalidFields.includes(name);

  return <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-20 sm:px-6" aria-labelledby="brand-index-title">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link to="/brand-index" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />{brandLookupCopy[language].returnLookup}</Link><LanguageSwitcher /></div>
    <header className="max-w-3xl"><p className="text-sm font-semibold text-primary">{c.eyebrow}</p><h1 id="brand-index-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1><p className="mt-4 text-base leading-7 text-muted-foreground">{c.intro}</p></header>
    <aside className="my-6 rounded-2xl border border-border p-4" aria-labelledby="brand-index-warning"><h2 id="brand-index-warning" className="text-sm font-semibold">{c.warning}</h2><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm text-muted-foreground">{rc.privacy}</summary><p className="mt-2 max-w-3xl text-sm leading-6">{c.warningBody}</p>{(!ownerId || !verified) && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{dc.privacy}</p>}</details></aside>
    <section className="mb-6 min-w-0 rounded-2xl border border-border bg-card p-5" aria-labelledby="brand-account-reports-title" data-brand-account-reports>
      <h2 id="brand-account-reports-title" className="text-xl font-semibold">{rc.title}</h2>
      {ownerId && verified ? <><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{rc.help}</p><p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{rc.sessionChecks}</p></> : null}
      {!ownerId ? <><p className="mt-3 text-sm leading-6">{rc.guest}</p><Link to="/auth?next=%2Fbrand-index%2Fassessment" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">{rc.signIn}</Link></> : !verified ? <p className="mt-3 text-sm leading-6">{rc.verify}</p> : <>
        {input && <div className="mt-4 space-y-3">
          {historical ? <><p role="status" className="text-sm leading-6">{rc.historical}</p><Button type="button" className={action} data-brand-report-copy disabled={!!operation} onClick={editAsNewReport}>{rc.copy}</Button></> : <>
            <p data-brand-report-dirty={accountDirty || targetDrafts.length > 0} className="text-sm leading-6">{accountDirty || targetDrafts.length > 0 ? rc.unsaved : rc.unchanged}</p>
            {targetDrafts.length > 0 && <p role="status" className="text-sm leading-6">{rc.unrecorded}</p>}
            {saveUncertain && <p role="alert" className="text-sm leading-6">{rc.pending}</p>}
            <Button type="button" className={action} data-brand-report-save disabled={!!operation || checking || sourceCheckUnsettled || monitorUnsettled || targetDrafts.length > 0 || !saveUncertain && !accountDirty} onClick={() => void saveReport()}>{operation === "save" ? rc.saving : saveUncertain ? rc.retry : currentReport ? rc.update : rc.save}</Button>
            {(reportError === "conflict" || reportError === "version_limit") && <Button type="button" variant="outline" className={action + " ml-0 sm:ml-3"} data-brand-report-conflict-copy disabled={!!operation || targetDrafts.length > 0 || sourceCheckUnsettled || monitorUnsettled} onClick={editAsNewReport}>{rc.conflictCopy}</Button>}
          </>}
          {currentReport && <p className="text-xs leading-5 text-muted-foreground">{rc.version} {currentReport.version} · {rc.savedAt} <time data-brand-report-saved-at dateTime={currentReport.savedAt}>{formatLocalizedDateTime(currentReport.savedAt, language)}</time></p>}
        </div>}
        {reportNotice && <p role="status" className="mt-3 text-sm leading-6">{rc[reportNotice]}</p>}
        {reportError && <p role="alert" className="mt-3 text-sm leading-6">{rc[reportError]}</p>}
        {(operation === "open" || operation === "history") && <p role="status" className="mt-3 text-sm leading-6">{rc.loading}</p>}
        <details className="mt-4 min-w-0" open={!input} data-brand-report-list>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{rc.title} ({reports.length})</summary>
          <Button type="button" variant="outline" className={action} data-brand-report-refresh disabled={reportsLoading || !!operation || saveUncertain} onClick={() => void refreshReports()}>{reportsLoading ? rc.loading : rc.refresh}</Button>
          {listError ? <p role="alert" className="mt-3 text-sm leading-6">{rc[listError]}</p> : !reportsLoading && reports.length === 0 ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{rc.empty}</p> : null}
          <ul className="mt-3 space-y-3">{reports.map(report => <li key={report.id} className="min-w-0 rounded-xl border border-border p-3"><p className="break-words text-sm font-semibold">{report.title}</p><p className="mt-1 text-xs text-muted-foreground">{rc.version} {report.version} · {formatLocalizedDateTime(report.updatedAt, language)}</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" className={action} data-brand-report-open={report.id} disabled={!!operation || saveUncertain || checking || sourceCheckUnsettled || monitorUnsettled} onClick={() => requestOpen({ id: report.id })}>{rc.open}</Button><Button type="button" variant="ghost" className={action} data-brand-report-history={report.id} disabled={!!operation || saveUncertain || monitorUnsettled} onClick={() => void showHistory(report.id)}>{rc.history}</Button></div></li>)}</ul>
          {historyId && <section className="mt-4" aria-labelledby="brand-report-history-title"><h3 id="brand-report-history-title" className="text-sm font-semibold">{rc.history}</h3><ul className="mt-2 space-y-2">{versions.map(version => <li key={version.version}><Button type="button" variant="outline" className={action + " w-full"} data-brand-report-version={version.version} disabled={!!operation || saveUncertain || checking || sourceCheckUnsettled || monitorUnsettled} onClick={() => requestOpen({ id: version.id, version: version.version })}>{rc.version} {version.version} · {formatLocalizedDateTime(version.savedAt, language)}</Button></li>)}</ul></section>}
        </details>
        {pendingOpen && <section className="mt-4 rounded-xl border border-border p-4" aria-labelledby="brand-report-replace-title"><h3 id="brand-report-replace-title" className="font-semibold">{rc.leaveTitle}</h3><p role="alert" className="mt-2 text-sm leading-6">{rc.leaveBody}</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" className={action} data-brand-report-discard-open onClick={() => void openReport(pendingOpen)}>{rc.replace}</Button><Button type="button" variant="ghost" className={action} onClick={() => setPendingOpen(null)}>{rc.keep}</Button></div></section>}
      </>}
      {(!ownerId || !verified) && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-muted-foreground">{rc.privacy}</summary><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{rc.help}</p><p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{rc.sessionChecks}</p></details>}
    </section>
    {!result ? <form onSubmit={build} noValidate className="min-w-0 space-y-6" aria-labelledby="brand-index-scope-title">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 id="brand-index-scope-title" className="mb-5 text-xl font-semibold">{c.scopeTitle}</h2>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-name">{c.brand}<input ref={nameFieldRef} id="brand-index-name" name="brand_name" className={field} value={brandName} required maxLength={100} autoComplete="off" aria-invalid={isInvalid("brand_name")} onChange={event => setBrandName(event.target.value)} /></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-identity">{c.identity}<input id="brand-index-identity" name="identity_label" className={field} value={identity} required maxLength={63} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("identity_label")} aria-describedby="brand-index-identity-help" onChange={event => setIdentity(event.target.value)} /><span id="brand-index-identity-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.identityHelp}</span></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-primary">{c.primary}<input id="brand-index-primary" name="primary_domain" className={field} value={primary} required maxLength={253} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("primary_domain")} aria-describedby="brand-index-domain-help" onChange={event => setPrimary(event.target.value)} /><span id="brand-index-domain-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.domainHelp}</span></label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="brand-index-domains">{c.domains}<textarea id="brand-index-domains" name="domains" className={field} value={extraDomains} rows={3} maxLength={5100} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={isInvalid("domains")} aria-describedby="brand-index-domains-help" onChange={event => setExtraDomains(event.target.value)} /><span id="brand-index-domains-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.domainsHelp}</span></label>
        </div>
      </section>
      <fieldset className="min-w-0 rounded-2xl border border-border bg-card px-5 pb-5 pt-2" aria-describedby="brand-index-social-help"><legend className="px-1 text-base font-semibold">{c.socials}</legend><p id="brand-index-social-help" className="mt-2 text-sm leading-6 text-muted-foreground">{c.socialsHelp}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{SOCIAL_PLATFORMS.map(platform => <div key={platform} className="min-w-0 rounded-xl border border-border p-3"><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" data-brand-platform={platform} checked={platforms.includes(platform)} disabled={platforms.length === 1 && platforms[0] === platform} onChange={() => setPlatforms(previous => previous.includes(platform) ? previous.length > 1 ? previous.filter(value => value !== platform) : previous : [...previous, platform])} className="h-4 w-4 shrink-0" />{socialPlatformNames[platform]}</label><label htmlFor={`brand-handle-${platform}`} className="mt-2 block text-xs text-muted-foreground">{c.handle} · {socialPlatformNames[platform]}<input id={`brand-handle-${platform}`} className={field} value={handles[platform] ?? ""} placeholder={identity || undefined} maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={!platforms.includes(platform)} aria-invalid={isInvalid("socials") && platforms.includes(platform)} onChange={event => setHandles(previous => ({ ...previous, [platform]: event.target.value }))} /></label></div>)}</div></fieldset>
      <NamePackageMarkets markets={markets} onChange={setMarkets} language={language} />
      {invalidFields.length > 0 && <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm leading-6">{c.invalid}</p>}
      <Button type="submit" className={action}><ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" />{c.build}</Button>
    </form> : <section aria-labelledby="brand-index-result-title" className="space-y-5" data-brand-index-result>
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 ref={resultHeadingRef} tabIndex={-1} id="brand-index-result-title" className="scroll-mt-6 text-xl font-semibold">{c.results}</h2><p className="mt-2 break-words text-2xl font-semibold">{result.brand.name}</p><p className="mt-2 break-all text-sm text-muted-foreground">{result.brand.primary_domain}</p></div><Button type="button" variant="outline" className={action} disabled={locked} onClick={() => setConfirmReset(true)}>{c.edit}</Button></header>
      {confirmReset && <section className="rounded-xl border border-border bg-card p-5" aria-label={c.edit}><p role="alert" className="text-sm leading-6">{c.resetWarning}</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" className={action} onClick={reset}>{c.reset}</Button><Button type="button" variant="ghost" className={action} onClick={() => setConfirmReset(false)}>{c.cancel}</Button></div></section>}
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.fixed}</p>
      {ownerId && verified ? currentReport ? <SavedBrandChecks key={`${ownerId}:${currentReport.id}:${currentReport.version}`} ownerId={ownerId} reportId={currentReport.id} reportVersion={currentReport.version} historical={historical}
        latest={reports.find(report => report.id === currentReport.id)?.version === currentReport.version} clean={!accountDirty && targetDrafts.length === 0} blocked={operation !== null || checking || saveUncertain || monitorUnsettled} language={language} now={now} onUnsettledChange={setSourceCheckUnsettled} />
        : <p className="rounded-xl border border-border p-4 text-sm leading-6">{brandChecksCopy[language].saveFirst}</p> : null}
      {ownerId && verified && currentReport && <BrandReportMonitoring key={`monitor:${ownerId}:${currentReport.id}:${currentReport.version}`} ownerId={ownerId} reportId={currentReport.id} reportVersion={currentReport.version} historical={historical}
        latest={reports.find(report => report.id === currentReport.id)?.version === currentReport.version} clean={!accountDirty && targetDrafts.length === 0} blocked={operation !== null || checking || saveUncertain || sourceCheckUnsettled} language={language} now={now} onUnsettledChange={setMonitorUnsettled} />}
      <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="brand-worksheet-export-title">
        <h3 id="brand-worksheet-export-title" className="text-lg font-semibold">{wc.exportTitle}</h3>
        <p id="brand-worksheet-export-help" className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ownerId && verified ? rc.exportHelp : wc.exportHelp}</p>
        {ownerId && verified && <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{brandChecksCopy[language].exportScope}</p>}
        <Button type="button" variant="outline" data-brand-export className={action + " mt-4"} disabled={checking || exporting} aria-describedby="brand-worksheet-export-help" onClick={() => void exportAssessment()}><Download aria-hidden="true" className="h-4 w-4 shrink-0" />{exporting ? wc.exporting : isNativeApp ? wc.share : wc.download}</Button>
        {exportNotice && <p role={exportNotice === "failed" ? "alert" : "status"} className="mt-3 text-sm leading-6">{ownerId && verified && (exportNotice === "completed" || exportNotice === "downloaded") ? rc.exportDone : wc[exportNotice]}</p>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="brand-domain-check-title">
        <h3 id="brand-domain-check-title" className="text-lg font-semibold">{ownerId && verified ? brandChecksCopy[language].localTitle : dc.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ownerId && verified ? brandChecksCopy[language].localHelp : dc.help}</p>
        <div className="mt-4 flex flex-wrap gap-3"><Button type="button" data-brand-check-domains className={action} disabled={checking || scan.isScanning || !plan?.batches.length || locked} onClick={() => void checkDomains()}>{checking ? dc.checking : dc.action}</Button>{checking && <Button type="button" variant="outline" className={action} onClick={stopChecks}>{dc.stop}</Button>}</div>
        <p role="status" className="mt-3 text-sm leading-6">{dc.progress}: {domainEvidence?.summary.checked ?? 0} {dc.separator} {result.scope.domains.length}. {dc.remaining}: {domainEvidence?.summary.unknown ?? result.scope.domains.length}.</p>
        {plan && plan.unsupported.length > 0 && <div className="mt-3 text-sm leading-6"><p className="font-medium">{dc.unsupported}</p><ul className="mt-1 list-inside list-disc">{plan.unsupported.map(domain => <li key={domain} className="break-all">{domain}</li>)}</ul></div>}
        {checkNotice && <p role={checkNotice === "failed" ? "alert" : "status"} className="mt-3 text-sm leading-6">{dc[checkNotice]}</p>}
      </section>
      {evidence && <BrandEvidencePanel report={evidence} language={language} />}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2"><section className="min-w-0 rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="brand-index-reported-title"><h3 id="brand-index-reported-title" className="text-sm font-semibold">{c.reportedScore}</h3><p data-brand-reported-score={result.index.reported_score ?? "unavailable"} className={`mt-3 font-semibold ${result.index.reported_score === null ? "text-lg" : "text-4xl"}`}>{result.index.reported_score === null ? c.notEnough : `${result.index.reported_score} / ${result.index.maximum}`}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{c.threshold}</p></section><section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-labelledby="brand-index-verified-title"><h3 id="brand-index-verified-title" className="text-sm font-semibold">{c.verifiedScore}</h3><p data-brand-verified-score="unavailable" className="mt-3 text-lg font-semibold">{c.notVerified}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{c.warningBody}</p></section></div>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">{c.targetCount}</dt><dd data-brand-target-count className="mt-1 text-xl font-semibold">{result.counts.requested}</dd></div><div><dt className="text-xs text-muted-foreground">{c.reportedCoverage}</dt><dd data-brand-reported-coverage className="mt-1 text-xl font-semibold">{result.index.reported_coverage_percent}%</dd></div><div><dt className="text-xs text-muted-foreground">{c.verifiedCoverage}</dt><dd className="mt-1 text-xl font-semibold">0%</dd></div><div><dt className="text-xs text-muted-foreground">{c.unassessed}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.unassessed}</dd></div><div><dt className="text-xs text-muted-foreground">{c.conflicts}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.conflicts}</dd></div><div><dt className="text-xs text-muted-foreground">{c.stale}</dt><dd className="mt-1 text-xl font-semibold">{result.counts.stale}</dd></div></dl>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.coverageHelp}</p>
      <details className="rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{c.parts}</summary><dl className="space-y-3 text-sm">{([["domains", c.domainPart], ["socials", c.socialPart], ["markets", c.marketPart], ["consistency", c.consistencyPart]] as const).map(([key, text]) => <div key={key} className="flex items-start justify-between gap-3"><dt>{text}</dt><dd className="shrink-0 tabular-nums">{result.subscores[key].score} / {result.subscores[key].max}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-muted-foreground">{c.methodology}: {result.methodology_version}</p><details className="mt-3"><summary className="cursor-pointer py-2 text-xs font-medium">{c.compareKey}</summary><p data-brand-comparison-key className="mt-2 break-all text-xs text-muted-foreground">{result.scope.comparison_key}</p></details></details>
      <section aria-labelledby="brand-index-review-title"><h3 id="brand-index-review-title" className="text-lg font-semibold">{c.review}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{ownerId && verified ? rc.recordHelp : c.recordHelp}</p><div className="mt-4 space-y-4">{(["domain", "social", "market"] as const).map(kind => <details key={kind} className="min-w-0 rounded-2xl border border-border bg-card p-4" open={kind === "domain"}><summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">{c.groups[kind]} ({result.targets.filter(target => target.kind === kind).length})</summary>{kind === "market" && <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.countryHelp}</p>}<div className="mt-3 space-y-3">{result.targets.filter(target => target.kind === kind).map(target => <TargetReport key={`${viewRevision}:${target.id}`} target={target} language={language} disabled={locked} onDraftChange={changed => updateTargetDraft(target.id, changed)} onRecord={(status, source) => record(target.id, status, source)} />)}</div></details>)}</div></section>
      <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h3 className="font-semibold">{c.next}</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{c.gaps}</p></section>
    </section>}
    <Link to="/name-packages" className="mt-8 inline-flex min-h-11 max-w-full items-start gap-2 py-2 text-sm font-semibold text-primary underline underline-offset-4"><span className="min-w-0">{c.packages}</span><ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /></Link>
    <FreeSearchGate />
  </main>;
}

function SavedBrandChecks({ ownerId, reportId, reportVersion, historical, latest, clean, blocked, language, now, onUnsettledChange }: {
  ownerId: string; reportId: string; reportVersion: number; historical: boolean; latest: boolean; clean: boolean; blocked: boolean;
  language: Language; now: number; onUnsettledChange: (value: boolean) => void;
}) {
  const c = brandChecksCopy[language];
  const [runs, setRuns] = useState<BrandCheckRun[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false), [reading, setReading] = useState(false), [starting, setStarting] = useState(false), [uncertain, setUncertain] = useState(false);
  const [readError, setReadError] = useState<BrandChecksError["code"] | null>(null), [startError, setStartError] = useState<BrandChecksError["code"] | null>(null);
  const [latestRun, setLatestRun] = useState<BrandCheckRun | null>(null), [pollStopped, setPollStopped] = useState(false);
  const alive = useRef(true), readRequest = useRef<AbortController | null>(null), startRequest = useRef<AbortController | null>(null);
  const requestInput = useRef<BrandChecksStartInput | null>(null), canonicalRuns = useRef(new Map<string, BrandCheckRun>()), pollCount = useRef(0);
  const refreshRef = useRef<(page?: number) => Promise<void>>(async () => {});
  const pending = latestRun?.status === "pending";
  const canStart = !historical && latest && clean && !blocked && loaded && !readError && !pending;
  const displayedEvidence = useMemo(() => latestRun?.status === "completed" ? createBrandEvidenceReport(latestRun.entries, now) : null, [latestRun, now]);
  function canonical(run: BrandCheckRun): BrandCheckRun {
    const previous = canonicalRuns.current.get(run.id);
    // Pending may become terminal, never the reverse. A late response cannot
    // resurrect a server-expired attempt or replace a known terminal record.
    if (previous && previous.status !== "pending") return previous;
    canonicalRuns.current.set(run.id, run); return run;
  }
  async function refresh(page = 0) {
    readRequest.current?.abort();
    const controller = new AbortController(); readRequest.current = controller; setReading(true); setReadError(null);
    try {
      const value = await getBrandChecks({ accountId: ownerId, signal: controller.signal }, { reportId, version: reportVersion, offset: page, limit: 20 });
      if (controller.signal.aborted || !alive.current || readRequest.current !== controller) return;
      const rows = value.runs.map(canonical);
      setRuns(rows); setTotal(value.total); setOffset(value.offset); setHasMore(value.hasMore); setLoaded(true);
      if (page === 0) setLatestRun(rows[0] ?? null);
      const original = requestInput.current;
      const receipt = original ? rows.find(run => run.id === original.requestKey) : null;
      if (receipt) { setUncertain(false); setStartError(null); if (receipt.status !== "pending") requestInput.current = null; }
    } catch (error) { if (!controller.signal.aborted && alive.current) setReadError(error instanceof BrandChecksError ? error.code : "unavailable"); }
    finally { if (readRequest.current === controller) { readRequest.current = null; if (alive.current) setReading(false); } }
  }
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true; void refreshRef.current(0);
    return () => { alive.current = false; readRequest.current?.abort(); startRequest.current?.abort(); requestInput.current = null; onUnsettledChange(false); };
  }, [ownerId, reportId, reportVersion, onUnsettledChange]);
  useEffect(() => { onUnsettledChange(starting || uncertain); }, [starting, uncertain, onUnsettledChange]);
  useEffect(() => {
    if (!pending || uncertain || historical || pollStopped || reading) return;
    // Bounded status polling uses GET only. It never repeats provider work.
    const timer = window.setTimeout(() => {
      pollCount.current += 1;
      if (pollCount.current >= 6) { setPollStopped(true); return; }
      void refreshRef.current(0);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [pending, latestRun, uncertain, historical, pollStopped, reading]);
  async function start() {
    if (startRequest.current || reading || blocked || historical || !clean || !latest || !uncertain && !canStart) return;
    const payload = requestInput.current ?? { reportId, expectedVersion: reportVersion, requestKey: crypto.randomUUID() };
    requestInput.current = payload;
    const controller = new AbortController(); startRequest.current = controller; setStarting(true); setStartError(null); onUnsettledChange(true);
    try {
      const value = await startBrandCheck({ accountId: ownerId, signal: controller.signal }, payload);
      if (controller.signal.aborted || !alive.current || startRequest.current !== controller) return;
      const run = canonical(value.run); setLatestRun(run); setRuns(previous => [run, ...previous.filter(row => row.id !== run.id)]);
      setUncertain(false); if (run.status !== "pending") requestInput.current = null;
      setPollStopped(false); pollCount.current = 0;
      void refreshRef.current(0);
    } catch (error) {
      if (controller.signal.aborted || !alive.current) return;
      const unknown = brandCheckFailureIsUncertain(error); setUncertain(unknown); if (!unknown) requestInput.current = null;
      const code = error instanceof BrandChecksError ? error.code : "unavailable";
      setStartError(code);
      if (code === "pending") { setLoaded(false); void refreshRef.current(0); }
    } finally { if (startRequest.current === controller) { startRequest.current = null; if (alive.current) setStarting(false); } }
  }
  const earlier = offset === 0 ? runs.filter(run => run.id !== latestRun?.id) : runs;
  return <section className="min-w-0 rounded-2xl border border-primary/25 bg-card p-5" aria-labelledby="brand-saved-checks-title" data-brand-saved-checks>
    <h3 id="brand-saved-checks-title" className="text-lg font-semibold">{c.title}</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{c.help}</p>
    {historical ? <p className="mt-3 text-sm leading-6">{c.historical}</p> : !latest ? <p className="mt-3 text-sm leading-6">{c.notLatest}</p> : !clean ? <p className="mt-3 text-sm leading-6">{c.dirty}</p> : null}
    {uncertain && <p role="alert" className="mt-3 text-sm leading-6">{c.uncertain}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      {!historical && <Button type="button" className={action} data-brand-archived-check-start disabled={starting || reading || blocked || !clean || !latest || !uncertain && !canStart} onClick={() => void start()}>{starting ? c.starting : uncertain ? c.retry : c.action}</Button>}
      <Button type="button" variant="outline" className={action} data-brand-archived-check-refresh disabled={reading || starting} onClick={() => { pollCount.current = 0; setPollStopped(false); void refresh(0); }}>{reading ? c.loading : c.refresh}</Button>
    </div>
    {readError && <p role="alert" className="mt-3 text-sm leading-6">{c[readError]}</p>}
    {startError && <p role="alert" className="mt-3 text-sm leading-6">{c[startError]}</p>}
    {pollStopped && pending && <p role="status" className="mt-3 text-sm leading-6">{c.wait}</p>}
    {loaded && !latestRun ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.empty}</p> : null}
    {latestRun && <section className="mt-4 min-w-0 border-t border-border pt-4" aria-labelledby="brand-latest-check-title" data-brand-latest-check-status={latestRun.status}>
      <h4 id="brand-latest-check-title" className="text-sm font-semibold">{c.current}</h4><p role={latestRun.status === "failed" ? "alert" : "status"} className="mt-2 text-sm leading-6">{c[latestRun.status]}</p>
      <CheckRunDetails run={latestRun} language={language} />
      {displayedEvidence && <BrandEvidencePanel report={displayedEvidence} language={language} headingLevel="h5" compact />}
    </section>}
    {total > 1 || offset > 0 ? <details className="mt-4 min-w-0" data-brand-check-history><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{c.earlier} · {c.total}: {total}</summary>
      <p className="mt-2 text-xs text-muted-foreground">{c.page} {Math.floor(offset / 20) + 1}</p>
      <ul className="mt-3 space-y-3">{earlier.map(run => <li key={run.id} className="min-w-0 rounded-xl border border-border p-3" data-brand-historical-check={run.id}><p className="text-sm font-semibold">{run.status === "completed" ? c.historyCompleted : run.status === "pending" ? c.historyPending : c.historyFailed}</p><CheckRunDetails run={run} language={language} />{run.status === "completed" && <BrandEvidencePanel report={createBrandEvidenceReport(run.entries, now)} language={language} headingLevel="h5" compact />}</li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="outline" className={action} data-brand-check-previous disabled={reading || starting || offset === 0} onClick={() => void refresh(Math.max(0, offset - 20))}>{c.previous}</Button><Button type="button" variant="outline" className={action} data-brand-check-next disabled={reading || starting || !hasMore} onClick={() => void refresh(offset + 20)}>{c.next}</Button></div>
    </details> : null}
  </section>;
}

function CheckRunDetails({ run, language }: { run: BrandCheckRun; language: Language }) {
  const c = brandChecksCopy[language];
  return <><p className="mt-2 text-xs leading-5 text-muted-foreground">{c.version} {run.reportVersion} · {c.requested} <time dateTime={run.requestedAt}>{formatLocalizedDateTime(run.requestedAt, language)}</time>{run.completedAt && <> · {c.completedAt} <time dateTime={run.completedAt}>{formatLocalizedDateTime(run.completedAt, language)}</time></>}</p>
    <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-medium">{c.methodology}</summary><p className="break-all text-xs leading-5">{run.methodologyVersion}</p><p className="mt-1 break-all text-xs leading-5">{c.runId}: {run.id}</p></details></>;
}

function TargetReport({ target, language, disabled, onDraftChange, onRecord }: { target: Target; language: Language; disabled: boolean; onDraftChange: (changed: boolean) => void; onRecord: (status: ReportStatus, source: string) => boolean }) {
  const c = brandIndexCopy[language];
  const [status, setStatus] = useState<ReportStatus>(target.reported_status), [source, setSource] = useState(target.source_url ?? ""), [notice, setNotice] = useState<boolean | null>(null);
  const identifier = target.kind === "market" && target.market ? `${namePackageCountryName(target.market, language)} (${target.market})`
    : target.kind === "social" && target.platform ? `${socialPlatformNames[target.platform]} · @${target.identifier}` : target.identifier;
  const suffix = encodeURIComponent(target.id);
  return <details data-brand-target={target.id} className="min-w-0 rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold">{identifier}<span className="mt-1 block text-xs font-normal text-muted-foreground">{c.statuses[target.reported_status]} · {c.freshness[target.status_freshness]}</span></summary>
    <form onSubmit={event => { event.preventDefault(); if (disabled) return; const success = onRecord(status, source); setNotice(success); if (success) onDraftChange(false); }} noValidate className="mt-3 space-y-4">
      <label htmlFor={`brand-status-${suffix}`} className="block text-sm font-medium">{c.status}<select id={`brand-status-${suffix}`} data-brand-status className={field} value={status} disabled={disabled} onChange={event => { const value = event.target.value as ReportStatus; setStatus(value); setNotice(null); onDraftChange(value !== target.reported_status || source.trim() !== (target.source_url ?? "")); }}>{BRAND_INDEX_STATUSES.map(value => <option key={value} value={value}>{c.statuses[value]}</option>)}</select></label>
      <label htmlFor={`brand-source-${suffix}`} className="block text-sm font-medium">{c.source}<input id={`brand-source-${suffix}`} data-brand-source type="url" className={field} value={source} disabled={disabled} maxLength={512} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby={`brand-source-help-${suffix}`} aria-invalid={notice === false} onChange={event => { const value = event.target.value; setSource(value); setNotice(null); onDraftChange(status !== target.reported_status || value.trim() !== (target.source_url ?? "")); }} /><span id={`brand-source-help-${suffix}`} className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{c.sourceHelp}</span></label>
      <Button type="submit" variant="outline" className={action} disabled={disabled}>{c.record}</Button>
      {target.reported_at && <p className="text-xs leading-5 text-muted-foreground">{c.reportedTime}: <time dateTime={target.reported_at}>{formatLocalizedDateTime(target.reported_at, language)}</time></p>}
      {notice !== null && <p role={notice ? "status" : "alert"} className="text-sm leading-6">{notice ? c.saved : c.invalidReport}</p>}
    </form>
  </details>;
}

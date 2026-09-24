import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Download, FolderOpen, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { readAccountSession } from "@/integrations/neon/auth";
import { useDraftNavigationGuard } from "@/contexts/DraftNavigationContext";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { nameProjectsCopy } from "@/i18n/nameProjectsCopy";
import { namePackageEntryCopy } from "@/i18n/namePackageEntryCopy";
import { brandShortlistCopy } from "@/i18n/brandShortlistCopy";
import { nameLanguageCopy } from "@/i18n/nameLanguageCopy";
import { getNameProjects, saveNameProject, NameProjectsError } from "@/lib/nameProjectsClient";
import { emptyNameProjectDraft, exportNameProject, nameProjectToDraft, parseNameProjectDraft, type NameProjectDraft } from "@/lib/nameProjectDraft";
import { getWatchlist } from "@/lib/watchlistService";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { isNativeApp } from "@/lib/appSurface";
import { nativeShareFile } from "@/lib/nativeTransport";
import { nativeExportCopy } from "@/app/nativeExportCopy";
import { NAME_PROJECT_LANGUAGES, NAME_PROJECT_SHORTLIST_LIMIT, brandShortlistEntryKey, nameProjectInputSchema, type NameProject, type NameProjectInput } from "../../shared/name-projects";

const field = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action = "min-h-11 h-auto whitespace-normal px-4 py-3";

export default function NameProjects() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const copy = nameProjectsCopy[language];
  const location = useLocation();
  const requestedId = typeof location.state?.selectedProjectId === "string" ? location.state.selectedProjectId : null;
  if (loading) return <main className="mx-auto min-h-screen max-w-6xl px-4 py-8" aria-busy="true"><p role="status">{copy.loading}</p></main>;
  if (!user || !user.email_verified) return <main className="mx-auto min-h-screen max-w-3xl px-4 py-8"><h1 className="text-3xl font-semibold">{copy.title}</h1><p className="my-5">{user ? copy.verify : copy.signIn}</p><Button asChild className={action}><Link to="/auth?next=%2Fprojects">{user ? copy.verify : copy.signIn}</Link></Button></main>;
  // Unmount all private rows, requests and drafts immediately on an account change.
  return <Workspace key={user.id} accountId={user.id} language={language} requestedId={requestedId} />;
}

function Workspace({ accountId, language, requestedId }: { accountId: string; language: Language; requestedId: string | null }) {
  const copy = nameProjectsCopy[language];
  const brandCopy = brandShortlistCopy[language];
  const languages = NAME_PROJECT_LANGUAGES.map(value => ({ value, label: value === "zh" ? "简体中文" : nameLanguageCopy[language].names[value] }));
  const [projects, setProjects] = useState<NameProject[]>([]);
  const [savedDomains, setSavedDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState<NameProjectDraft | null>(null);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState<"load" | "save" | null>(null);
  const [error, setError] = useState<NameProjectsError | null>(null), [errorOperation, setErrorOperation] = useState<"load" | "save">("load");
  const [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [revoked, setRevoked] = useState(false);
  const [savedFailed, setSavedFailed] = useState(false), [notice, setNotice] = useState<"saved" | "removed" | "export_failed" | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]), [query, setQuery] = useState(""), [includeArchived, setIncludeArchived] = useState(false);
  const lifetime = useRef<AbortController | null>(null), active = useRef(false), retryInput = useRef<NameProjectInput | null>(null);
  const editor = useRef<HTMLHeadingElement | null>(null), details = useRef<HTMLDetailsElement | null>(null), draftRef = useRef(draft);
  draftRef.current = draft;
  useDraftNavigationGuard(accountId, dirty && !revoked);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const revoke = () => { setRevoked(true); setProjects([]); setSavedDomains([]); setDraft(null); setDirty(false); setUncertain(false); retryInput.current = null; };
  const load = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || active.current) return;
    active.current = true; setBusy("load"); setError(null); setNotice(null); setErrorOperation("load");
    try {
      const [projectResult, savedResult] = await Promise.allSettled([getNameProjects({ accountId, signal }), getWatchlist({ accountId, signal })]);
      if (signal.aborted) return;
      if (projectResult.status === "rejected") throw projectResult.reason;
      // The two reads can finish at different times. Recheck identity after both,
      // so a late Saved response cannot outlive the project client's session check.
      const session = await readAccountSession();
      if (signal.aborted) return;
      if (!session || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000) throw new NameProjectsError("unauthenticated");
      if (session.user?.id !== accountId) throw new NameProjectsError("account_changed");
      const rows = projectResult.value.projects;
      // A second service rejecting the owner must not leave a successful first response visible.
      if (savedResult.status === "rejected" && (["account_changed", "invalid_session"].includes(savedResult.reason?.code) || [401, 403].includes(savedResult.reason?.status))) throw new NameProjectsError("account_changed");
      const names = savedResult.status === "fulfilled" ? savedResult.value.map(row => row.domain).filter(domain => nameProjectInputSchema.shape.shortlistDomains.safeParse([domain]).success) : [];
      setSavedDomains([...new Set(names)]); setSavedFailed(savedResult.status === "rejected"); setProjects(rows); setLoaded(true);
      const selected = rows.find(row => row.id === draftRef.current?.id) ?? rows.find(row => row.id === requestedId) ?? rows.find(row => !row.archived) ?? null;
      setDraft(selected ? nameProjectToDraft(selected) : null); setDirty(false); setUncertain(false); setInvalidFields([]); retryInput.current = null;
    } catch (cause) {
      if (signal.aborted) return;
      const failure = cause instanceof NameProjectsError ? cause : new NameProjectsError("unavailable");
      setError(failure);
      if (["account_changed", "unauthenticated", "verification_required"].includes(failure.code)) revoke();
    } finally { if (!signal.aborted) { active.current = false; setBusy(null); } }
  }, [accountId, requestedId]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller; active.current = false;
    void load();
    return () => { controller.abort(); };
  }, [load]);
  const visibleProjects = projects.filter(project => includeArchived || !project.archived);
  const selectedProject = projects.find(project => project.id === draft?.id) ?? null;
  const visibleDomains = useMemo(() => savedDomains.filter(domain => domain.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language))), [savedDomains, query, language]);
  const refreshRequired = error?.code === "conflict" || error?.code === "saved_domain_required";
  const locked = Boolean(busy) || uncertain || refreshRequired;
  const errorText = error?.code === "disabled" ? copy.disabled : error?.code === "conflict" ? copy.conflict : error?.code === "limit" ? copy.limit : error?.code === "saved_domain_required" ? copy.missing :
    error?.code === "rate_limited" ? copy.rateLimit : error?.code === "invalid" ? copy.invalid : errorOperation === "save" ? copy.saveError : copy.loadError;
  function replaceDraft(next: NameProjectDraft) {
    if (active.current || locked || dirty && !window.confirm(copy.discard)) return;
    setDraft(next); setDirty(!next.expectedVersion); setNotice(null); setError(null); setQuery(""); setInvalidFields([]); retryInput.current = null;
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.scrollIntoView({ block: "start" }); });
  }
  function mutate(patch: Partial<NameProjectDraft>) {
    if (active.current || locked) return;
    setDraft(previous => previous ? { ...previous, ...patch } : previous); setDirty(true); setNotice(null); setInvalidFields([]); setError(null);
  }
  function reload() { if (!active.current && (!dirty || window.confirm(copy.discard))) void load(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!draft || !signal || signal.aborted || active.current || revoked || refreshRequired) return;
    const parsed = parseNameProjectDraft(draft);
    if (!parsed.success && !retryInput.current) {
      const paths = parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join("."));
      setInvalidFields(paths); setError(new NameProjectsError("invalid")); setErrorOperation("save");
      if (details.current && paths.some(path => !["title", "description", "shortlistDomains"].includes(path))) details.current.open = true;
      const first = event.currentTarget.elements.namedItem(paths[0]);
      if (first && "focus" in first) (first as HTMLElement).focus();
      return;
    }
    let input: NameProjectInput;
    try {
      input = retryInput.current ?? nameProjectInputSchema.parse({ ...(parsed.success ? parsed.data : {}), id: draft.id || crypto.randomUUID() }) as NameProjectInput;
    } catch { setError(new NameProjectsError("invalid")); setErrorOperation("save"); return; }
    retryInput.current = input;
    active.current = true; setBusy("save"); setError(null); setErrorOperation("save"); setNotice(null); setDirty(true);
    try {
      const snapshot = await saveNameProject({ accountId, signal }, input);
      if (signal.aborted) return;
      const persisted = snapshot.projects.find(project => project.id === input.id);
      if (!persisted) throw new NameProjectsError("invalid_response");
      setProjects(snapshot.projects); setDraft(nameProjectToDraft(persisted)); setDirty(false); setUncertain(false); retryInput.current = null;
      setNotice(persisted.shortlistDomains.length < input.shortlistDomains.length ? "removed" : "saved");
    } catch (cause) {
      if (signal.aborted) return;
      const failure = cause instanceof NameProjectsError ? cause : new NameProjectsError("unavailable");
      setError(failure);
      if (["account_changed", "unauthenticated", "verification_required"].includes(failure.code)) revoke();
      else if (["unavailable", "invalid_response"].includes(failure.code)) setUncertain(true);
      else { retryInput.current = null; setUncertain(false); }
    } finally { if (!signal.aborted) { active.current = false; setBusy(null); } }
  }
  async function download() {
    if (!selectedProject || dirty || locked) return;
    try {
      const content = exportNameProject(selectedProject);
      if (isNativeApp) {
        // Native sharing accepts generated HTML artifacts, not arbitrary JSON files.
        const escaped = content.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
        await nativeShareFile(`sajda-project-${selectedProject.id}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sajda</title></head><body><h1>Sajda</h1><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escaped}</pre></body></html>`);
        return;
      }
      const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `sajda-project-${selectedProject.id}.json`; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (!lifetime.current?.signal.aborted) setNotice("export_failed"); }
  }
  const fieldClass = (name: string) => field + (invalidFields.includes(name) ? " border-destructive ring-1 ring-destructive" : "");
  if (revoked) return <main className="mx-auto min-h-screen max-w-3xl px-4 py-8"><h1 className="text-3xl font-semibold">{copy.title}</h1><p role="alert" className="my-5">{copy.accessLost}</p><Button asChild className={action}><Link to="/auth?next=%2Fprojects">{copy.signIn}</Link></Button></main>;
  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 pb-28 sm:px-6" aria-labelledby="name-projects-title">
    <Link to="/" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.home}</Link>
    <header className="mb-7 flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><h1 id="name-projects-title" className="text-3xl font-semibold tracking-tight">{copy.title}</h1><p className="mt-3 text-base leading-7 text-muted-foreground">{copy.intro}</p></div>
      {loaded && (projects.length > 0 || draft) && error?.code !== "disabled" && <Button className={action} disabled={locked} onClick={() => replaceDraft(emptyNameProjectDraft(language))}><Plus className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.create}</Button>}
    </header>
    {busy === "load" && <p className="mb-4 flex items-center gap-2" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{copy.loading}</p>}
    {error && <section className="mb-5 rounded-2xl border border-destructive/30 bg-card p-4" role="alert"><p className="text-sm leading-6">{errorText}</p>{error.requestId && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{error.requestId}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className={action} disabled={Boolean(busy)} onClick={reload}>{loaded ? copy.reload : copy.retry}</Button>{error.code === "disabled" && <Button variant="ghost" asChild className={action}><Link to="/watchlist">{copy.savedDomains}</Link></Button>}</div></section>}
    {notice && <p role="status" className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">{notice === "saved" ? copy.saved : notice === "removed" ? copy.discardedRefs : copy.exportFailed}</p>}
    {loaded && error?.code !== "disabled" && <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border border-border bg-card p-4" aria-label={copy.title}>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />{copy.showArchived}</label>
        <ul className="mt-3 space-y-2">{visibleProjects.map(project => <li key={project.id}><button type="button" aria-current={draft?.id === project.id ? "true" : undefined} disabled={locked} onClick={() => replaceDraft(nameProjectToDraft(project))}
          className={"min-h-14 w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 " + (draft?.id === project.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
          <span className="block break-words font-semibold">{project.title}</span><span className="mt-1 block text-xs text-muted-foreground">{copy.shortlistCount.replace("{count}", String(project.shortlistDomains.length))}{project.archived ? ` · ${copy.archived}` : ""}</span>{!!project.brandShortlist?.length && <span className="mt-1 block text-xs text-muted-foreground">{brandCopy.count.replace("{count}", String(project.brandShortlist.length))}</span>}</button></li>)}</ul>
        <Link to="/watchlist" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline">{copy.savedDomains}</Link>
      </aside>
      {!draft ? <section className="rounded-2xl border border-border bg-card p-6 sm:p-8"><FolderOpen className="mb-4 h-8 w-8 text-primary" aria-hidden="true" /><h2 className="text-2xl font-semibold">{copy.empty}</h2><p className="mt-3 text-base leading-7 text-muted-foreground">{copy.emptyHelp}</p><Button className={action + " mt-5"} disabled={locked} onClick={() => replaceDraft(emptyNameProjectDraft(language))}>{copy.create}</Button></section> :
        <form noValidate onSubmit={save} className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 ref={editor} tabIndex={-1} className="scroll-mt-24 break-words text-xl font-semibold outline-none">{selectedProject?.title || copy.create}</h2><span className="text-xs text-muted-foreground">{dirty ? copy.unsaved : copy.private}</span></div>
          {selectedProject && !dirty && !locked && !selectedProject.archived && <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><Button asChild className={action + " w-full"}><Link to="/" state={{ nameProject: selectedProject, nameProjectAccountId: accountId }}><Search className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.find}</Link></Button><p className="text-xs leading-5 text-muted-foreground">{copy.findHelp}</p></section>}
          <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-70">
            {selectedProject && !dirty && !locked && !selectedProject.archived && <Button asChild variant="outline" className={action + " w-full"}><Link to="/name-packages" state={{ nameProject: selectedProject, nameProjectAccountId: accountId }}>{namePackageEntryCopy[language].action}</Link></Button>}
            <label className="block text-sm font-medium" htmlFor="project-title">{copy.projectTitle}<input id="project-title" name="title" autoComplete="off" required maxLength={120} className={fieldClass("title")} value={draft.title} aria-invalid={invalidFields.includes("title")} onChange={event => mutate({ title: event.target.value })} /></label>
            <label className="block text-sm font-medium" htmlFor="project-description">{copy.description}<textarea id="project-description" name="description" rows={4} maxLength={2000} className={fieldClass("description")} value={draft.description} aria-describedby="project-description-hint" aria-invalid={invalidFields.includes("description")} onChange={event => mutate({ description: event.target.value })} /><span id="project-description-hint" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">{copy.descriptionHint}</span></label>
            <details ref={details} className="rounded-xl border border-border p-4"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{copy.details}</summary><div className="mt-4 space-y-5">
              <label className="block text-sm font-medium">{copy.audience}<textarea name="audience" rows={2} maxLength={500} className={fieldClass("audience")} value={draft.audience} onChange={event => mutate({ audience: event.target.value })} /></label>
              <label className="block text-sm font-medium">{copy.style}<textarea name="desiredStyle" rows={2} maxLength={500} className={fieldClass("desiredStyle")} value={draft.desiredStyle} onChange={event => mutate({ desiredStyle: event.target.value })} /></label>
              <fieldset className={invalidFields.includes("languages") ? "rounded-lg border border-destructive p-2" : ""}><legend className="text-sm font-medium">{copy.languages}</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">{languages.map(item => <label key={item.value} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="languages" value={item.value} checked={draft.languages.includes(item.value)} onChange={event => mutate({ languages: event.target.checked ? [...draft.languages, item.value] : draft.languages.filter(value => value !== item.value) })} />{item.label}</label>)}</div></fieldset>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="block min-w-0 text-sm font-medium sm:col-span-2">{copy.currency}<select name="budget.currency" className={field} value={draft.budget.currency} onChange={event => mutate({ budget: { ...draft.budget, currency: event.target.value as NameProjectDraft["budget"]["currency"] } })}>{["USD", "EUR", "SEK", "GBP"].map(currency => <option key={currency}>{currency}</option>)}</select></label>
                {(["maxFirstYearCents", "maxAnnualRenewalCents"] as const).map(key => <label key={key} className="block min-w-0 text-sm font-medium">{key === "maxFirstYearCents" ? copy.firstYear : copy.renewal}<input name={`budget.${key}`} inputMode="decimal" maxLength={16} className={fieldClass(`budget.${key}`)} value={draft.budget[key]} aria-describedby="project-budget-hint" aria-invalid={invalidFields.includes(`budget.${key}`)} onChange={event => mutate({ budget: { ...draft.budget, [key]: event.target.value } })} /></label>)}</div>
              <p id="project-budget-hint" className="text-xs leading-5 text-muted-foreground">{copy.budgetHint}</p>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={draft.archived} onChange={event => mutate({ archived: event.target.checked })} />{copy.archive}</label><p className="text-xs leading-5 text-muted-foreground">{copy.archiveHelp}</p>
            </div></details>
            {!!draft.brandShortlist?.length && <section aria-labelledby="project-brand-shortlist-title" className="min-w-0 border-t border-border pt-5"><h3 id="project-brand-shortlist-title" className="text-lg font-semibold">{brandCopy.section}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{brandCopy.sectionHelp}</p><ul className="mt-4 space-y-3">{draft.brandShortlist.map(entry => <li key={brandShortlistEntryKey(entry)} className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-lg font-semibold">{entry.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{brandCopy.userInput}</p><p className="mt-1 text-sm leading-6">{nameLanguageCopy[language].result}: {nameLanguageCopy[language].names[entry.nameLanguage ?? "en"]}</p></div><Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${brandCopy.remove}: ${entry.label} (${nameLanguageCopy[language].names[entry.nameLanguage ?? "en"]})`} onClick={() => mutate({ brandShortlist: draft.brandShortlist?.filter(item => brandShortlistEntryKey(item) !== brandShortlistEntryKey(entry)) })}><X className="h-4 w-4" aria-hidden="true" /></Button></div><p className="mt-3 break-words text-sm leading-6">{entry.requiredTlds.map(tld => `.${tld}`).join(" · ")}</p><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{[entry.platforms.join(" · "), entry.markets.join(" · ")].filter(Boolean).join(" — ")}</p>{entry.note && <p className="mt-2 break-words text-sm leading-6">{entry.note}</p>}{selectedProject && !dirty && !locked && !selectedProject.archived && <Button asChild variant="outline" className={action + " mt-3 w-full"}><Link to="/name-packages" state={{ nameProject: selectedProject, nameProjectAccountId: accountId, brandPackage: entry }}><Search className="h-4 w-4 shrink-0" aria-hidden="true" />{brandCopy.recheck}</Link></Button>}</li>)}</ul></section>}
            <section aria-labelledby="project-shortlist-title" className="min-w-0 border-t border-border pt-5"><h3 id="project-shortlist-title" className="text-lg font-semibold">{copy.shortlist}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.shortlistHelp}</p>
              {!!draft.shortlistDomains.length && <ol className="mt-4 space-y-2">{draft.shortlistDomains.map((domain, index) => <li key={domain} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"><span className="min-w-0 break-all text-sm font-semibold">{index + 1}. {domain}</span><div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={index === 0} aria-label={`${copy.up}: ${domain}`} onClick={() => { const next = [...draft.shortlistDomains]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; mutate({ shortlistDomains: next }); }}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={index === draft.shortlistDomains.length - 1} aria-label={`${copy.down}: ${domain}`} onClick={() => { const next = [...draft.shortlistDomains]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; mutate({ shortlistDomains: next }); }}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`${copy.remove}: ${domain}`} onClick={() => mutate({ shortlistDomains: draft.shortlistDomains.filter(value => value !== domain) })}><X className="h-4 w-4" aria-hidden="true" /></Button></div></li>)}</ol>}
              {savedFailed ? <p className="mt-4 text-sm leading-6" role="status">{copy.savedLoadError}</p> : !savedDomains.length ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.noSaved}</p> : <><label className="mt-4 block text-sm font-medium">{copy.filter}<input type="search" value={query} className={field} onChange={event => setQuery(event.target.value)} /></label><div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border p-2">{visibleDomains.map(domain => <label key={domain} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"><input type="checkbox" checked={draft.shortlistDomains.includes(domain)} disabled={!draft.shortlistDomains.includes(domain) && draft.shortlistDomains.length >= NAME_PROJECT_SHORTLIST_LIMIT} onChange={event => mutate({ shortlistDomains: event.target.checked ? [...draft.shortlistDomains, domain] : draft.shortlistDomains.filter(value => value !== domain) })} /><span className="min-w-0 break-all">{domain}</span></label>)}</div></>}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.snapshots}</p><p className="mt-1 text-xs text-muted-foreground">{copy.selectedLimit.replace("{count}", String(NAME_PROJECT_SHORTLIST_LIMIT))}</p>
            </section>
          </fieldset>
          {savedFailed && <Button type="button" variant="outline" className={action} disabled={Boolean(busy)} onClick={reload}>{copy.retry}</Button>}
          <Button type="submit" className={action + " w-full sm:w-auto"} disabled={Boolean(busy) || refreshRequired || !dirty}>{busy === "save" ? copy.saving : uncertain ? copy.retrySave : copy.save}</Button>
          {selectedProject && !dirty && !locked && <section className="space-y-3 border-t border-border pt-5"><Button type="button" variant="outline" className={action} onClick={() => void download()}><Download className="h-4 w-4 shrink-0" aria-hidden="true" />{isNativeApp ? nativeExportCopy[language].action : copy.export}</Button><p className="text-xs text-muted-foreground">{copy.updated}: {formatLocalizedDateTime(selectedProject.updatedAt, language)}</p></section>}
        </form>}
    </div>}
  </main>;
}

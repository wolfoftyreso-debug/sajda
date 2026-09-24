import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Check, LoaderCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { brandShortlistCopy } from "@/i18n/brandShortlistCopy";
import { nameProjectsEnabled } from "@/lib/nameProjectsFeature";
import { getNameProjects, saveNameProject, NameProjectsError } from "@/lib/nameProjectsClient";
import { prepareBrandPackageSave } from "@/lib/brandPackageShortlist";
import { cn } from "@/lib/utils";
import { nameProjectInputSchema, type BrandShortlistEntry, type NameProject, type NameProjectInput } from "../../shared/name-projects";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export interface SaveBrandPackageButtonProps { entry: BrandShortlistEntry; projectId?: string; className?: string }

/** Save actions use the existing verified account + project API, never a provider check. */
export function SaveBrandPackageButton(props: SaveBrandPackageButtonProps) {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  if (!nameProjectsEnabled) return null;
  if (!user?.email_verified) return <Button asChild={!loading} variant="outline" className={cn("h-auto min-h-11 whitespace-normal", props.className)} disabled={loading}>
    {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link to="/auth?next=%2Fname-packages"><Bookmark className="h-4 w-4 shrink-0" aria-hidden="true" />{brandShortlistCopy[language].save}</Link>}
  </Button>;
  // An account change discards private rows and aborts in-flight requests.
  return <AccountSave key={user.id} {...props} accountId={user.id} />;
}

function AccountSave({ entry, projectId, className, accountId }: SaveBrandPackageButtonProps & { accountId: string }) {
  const { language } = useLanguage();
  const copy = brandShortlistCopy[language];
  const id = useId();
  const [open, setOpen] = useState(false), [rows, setRows] = useState<NameProject[]>([]);
  const [selected, setSelected] = useState(projectId ?? "new"), [title, setTitle] = useState(entry.label);
  const [busy, setBusy] = useState<"load" | "save" | null>(null), [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<NameProjectsError | null>(null), [saved, setSaved] = useState<NameProject | null>(null);
  const [uncertain, setUncertain] = useState(false), [revoked, setRevoked] = useState(false);
  const lifetime = useRef<AbortController | null>(null), active = useRef(false), retry = useRef<NameProjectInput | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); };
  }, []);
  function reject(cause: unknown, saving: boolean) {
    const error = cause instanceof NameProjectsError ? cause : new NameProjectsError("unavailable");
    setFailure(error);
    if (["unauthenticated", "account_changed", "verification_required"].includes(error.code)) {
      setRevoked(true); setRows([]); setSaved(null); setLoaded(false); setUncertain(false); retry.current = null;
    } else if (saving) {
      const unknown = ["unavailable", "invalid_response"].includes(error.code);
      setUncertain(unknown);
      if (!unknown) retry.current = null;
    }
  }
  async function load() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || active.current || retry.current || revoked) return;
    active.current = true; setBusy("load"); setFailure(null); setSaved(null);
    try {
      const result = await getNameProjects({ accountId, signal });
      if (signal.aborted) return;
      const available = result.projects.filter(project => !project.archived);
      setRows(available); setLoaded(true);
      setSelected(previous => available.some(project => project.id === previous) ? previous : "new");
    } catch (cause) { if (!signal.aborted) reject(cause, false); }
    finally { if (!signal.aborted) { active.current = false; setBusy(null); } }
  }
  function changeOpen(value: boolean) {
    // Closing does not cancel an uncertain save or throw away its retry identity.
    setOpen(value);
    if (value && !retry.current && !active.current && !revoked) void load();
  }
  async function save() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || active.current || revoked || !loaded || failure?.code === "conflict" || failure?.code === "saved_domain_required") return;
    let input: NameProjectInput;
    try {
      const project = rows.find(row => row.id === selected);
      if (selected !== "new" && !project) throw new NameProjectsError("conflict");
      input = retry.current ?? (project ? prepareBrandPackageSave(project, entry) : nameProjectInputSchema.parse({
        id: crypto.randomUUID(), expectedVersion: 0, title, description: "", audience: "", desiredStyle: "", languages: [entry.nameLanguage ?? "en"],
        budget: { currency: "USD", maxFirstYearCents: null, maxAnnualRenewalCents: null }, archived: false, shortlistDomains: [], brandShortlist: [entry],
      }));
    } catch { setFailure(new NameProjectsError("invalid")); return; }
    retry.current = input;
    active.current = true; setBusy("save"); setFailure(null); setSaved(null);
    try {
      const result = await saveNameProject({ accountId, signal }, input);
      if (signal.aborted) return;
      const project = result.projects.find(row => row.id === input.id);
      if (!project) throw new NameProjectsError("invalid_response");
      setSaved(project); setRows(result.projects.filter(row => !row.archived)); setSelected(project.id);
      setUncertain(false); retry.current = null;
    } catch (cause) { if (!signal.aborted) reject(cause, true); }
    finally { if (!signal.aborted) { active.current = false; setBusy(null); } }
  }
  const conflict = failure?.code === "conflict" || failure?.code === "saved_domain_required";
  const errorText = revoked ? copy.access : failure?.code === "disabled" ? copy.disabled : conflict ? copy.conflict
    : ["invalid", "limit"].includes(failure?.code ?? "") ? copy.invalid : uncertain ? copy.failed : copy.loadFailed;
  const field = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base";
  return <>
    <Button type="button" variant="outline" className={cn("h-auto min-h-11 whitespace-normal", className)} onClick={() => changeOpen(true)}><Bookmark className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.save}</Button>
    {uncertain && !open && <p role="status" className="mt-2 text-sm leading-6 text-muted-foreground">{copy.pending}</p>}
    <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.intro}</DialogDescription></DialogHeader>
      <p className="break-all text-xl font-semibold">{entry.label}</p>
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{busy === "load" ? copy.loading : copy.saving}</p>}
      {failure && <section role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-3"><p className="text-sm leading-6">{errorText}</p>
        {failure.requestId && <p className="break-all font-mono text-xs">{failure.requestId}</p>}
        {revoked ? <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><Link to="/auth?next=%2Fname-packages">{copy.access}</Link></Button>
          : !uncertain && failure.code !== "disabled" && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={Boolean(busy)} onClick={() => void load()}>{copy.reload}</Button>}
      </section>}
      {saved ? <section className="space-y-4"><p role="status" className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-primary" aria-hidden="true" />{copy.saved}</p><p className="text-sm leading-6 text-muted-foreground">{copy.savedHelp}</p><Button asChild className="h-auto min-h-11 w-full whitespace-normal"><Link to="/projects" state={{ selectedProjectId: saved.id }}>{copy.view}</Link></Button><Button type="button" variant="ghost" className="min-h-11 w-full" onClick={() => changeOpen(false)}>{copy.close}</Button></section>
        : loaded && !revoked && failure?.code !== "disabled" && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={Boolean(busy) || uncertain || conflict} className="min-w-0 space-y-4 disabled:opacity-70"><label className="block text-sm font-medium" htmlFor={`${id}-project`}>{copy.project}<select id={`${id}-project`} className={field} value={selected} onChange={event => setSelected(event.target.value)}><option value="new">{copy.newProject}</option>{rows.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            {selected === "new" && <label className="block text-sm font-medium" htmlFor={`${id}-title`}>{copy.projectTitle}<input id={`${id}-title`} className={field} autoComplete="off" maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} /></label>}
          </fieldset><Button type="submit" disabled={Boolean(busy) || conflict} className="h-auto min-h-11 w-full whitespace-normal">{uncertain ? copy.retry : copy.save}</Button>
        </form>}
    </DialogContent></Dialog>
  </>;
}

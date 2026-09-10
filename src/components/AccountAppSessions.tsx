import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { appSessionsCopy } from "@/i18n/appSessionsCopy";
import { formatLocalizedDateTime } from "@/lib/localeFormat";
import { listAppSessions, revokeAppSession, type AppSession } from "@/lib/appSessions";

/** A new account gets a new state lifetime, before any previous data can render. */
export default function AccountAppSessions({ accountId }: { accountId: string }) {
  return <AppSessionsForAccount key={accountId} accountId={accountId} />;
}

function AppSessionsForAccount({ accountId }: { accountId: string }) {
  const { language } = useLanguage();
  const copy = appSessionsCopy[language];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppSession[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"read" | "revoke" | null>(null);
  const [error, setError] = useState<"loadError" | "revokeError" | "paginationError" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const visited = useRef(new Set<string>());
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const revokeButtons = useRef(new Map<string, HTMLButtonElement>());
  const previousConfirmation = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (confirmId) cancelButton.current?.focus();
    else if (previousConfirmation.current) (revokeButtons.current.get(previousConfirmation.current) ?? refreshButton.current)?.focus();
    previousConfirmation.current = confirmId;
  }, [confirmId]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); };
  }, []);

  async function load(more = false) {
    if (pending.current || !lifetime.current || (more && !cursor)) return;
    const signal = lifetime.current.signal;
    if (signal.aborted) return;
    pending.current = true; setBusy("read"); setError(null); setConfirmId(null); setRevoked(false);
    try {
      const page = await listAppSessions({ accountId, signal }, more ? cursor : null);
      if (signal.aborted) return;
      if (more && page.nextCursor && (page.nextCursor === cursor || visited.current.has(page.nextCursor))) {
        setError("paginationError"); return;
      }
      if (!more) visited.current.clear();
      if (cursor && more) visited.current.add(cursor);
      setItems(previous => more ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCurrentId(page.currentSessionId); setCursor(page.nextCursor); setLoaded(true);
    } catch {
      if (!signal.aborted) setError("loadError");
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(null); }
    }
  }

  async function revoke(id: string) {
    if (pending.current || id !== confirmId || id === currentId || !items.some(item => item.id === id) || !lifetime.current) return;
    const signal = lifetime.current.signal;
    if (signal.aborted) return;
    pending.current = true; setBusy("revoke"); setError(null); setRevoked(false);
    try {
      await revokeAppSession(id, { accountId, signal });
      if (signal.aborted) return;
      setItems(previous => previous.filter(item => item.id !== id)); setConfirmId(null); setRevoked(true);
    } catch {
      if (!signal.aborted) setError("revokeError");
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(null); }
    }
  }

  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby="app-sessions-heading">
    <div className="flex items-center gap-3"><Smartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><h2 id="app-sessions-heading" className="text-lg font-semibold">{copy.title}</h2></div>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.lead}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" className="min-h-11 h-auto whitespace-normal text-left" aria-expanded={open} aria-controls="app-sessions-list" disabled={busy !== null}
        onClick={() => { if (pending.current) return; setOpen(!open); if (!open) void load(); }}>{open ? copy.hide : copy.show}</Button>
      {open && <Button ref={refreshButton} variant="ghost" className="min-h-11 h-auto whitespace-normal" disabled={busy !== null} onClick={() => void load()}><RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.refresh}</Button>}
    </div>
    {open && <div id="app-sessions-list" className="mt-4 space-y-4" aria-busy={busy !== null}>
      {busy === "read" && <p role="status" className="text-sm text-muted-foreground">{copy.loading}</p>}
      {error && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm leading-relaxed">
        <p>{copy[error]}</p>
        {error !== "revokeError" && <Button variant="outline" className="mt-2 min-h-11" disabled={busy !== null} onClick={() => void load()}>{copy.retry}</Button>}
      </div>}
      {revoked && <p role="status" className="text-sm leading-relaxed">{copy.revoked}</p>}
      {loaded && !error && busy !== "read" && items.length === 0 && !cursor && <div><h3 className="font-medium">{copy.empty}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.emptyBody}</p></div>}
      {items.length > 0 && <>
        <p className="text-sm text-muted-foreground">{copy.shown}: {items.length}</p>
        <ul className="space-y-3">
          {items.map(item => <li key={item.id} className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
            <h3 className="font-medium">{item.id === currentId ? copy.current : copy.session} <span className="text-xs font-normal text-muted-foreground">· {item.id.slice(0, 8)}</span></h3>
            <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-x-2"><dt>{copy.created}:</dt><dd><time dateTime={item.createdAt}>{formatLocalizedDateTime(item.createdAt, language, { dateStyle: "medium", timeStyle: "medium" })}</time></dd></div>
              <div className="flex flex-wrap gap-x-2"><dt>{copy.expires}:</dt><dd><time dateTime={item.expiresAt}>{formatLocalizedDateTime(item.expiresAt, language)}</time></dd></div>
            </dl>
            {item.id === currentId ? <p className="mt-3 text-sm leading-relaxed">{copy.currentHint}</p> : confirmId === item.id ? <div className="mt-3 space-y-3" role="group" aria-label={copy.confirm}>
              <p className="font-medium">{copy.confirm}</p><p className="text-sm leading-relaxed text-muted-foreground">{copy.consequence}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" className="min-h-11 h-auto whitespace-normal" disabled={busy !== null} onClick={() => void revoke(item.id)}>{busy === "revoke" ? copy.revoking : copy.confirmAction}</Button>
                <Button ref={cancelButton} variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={busy !== null} onClick={() => { setConfirmId(null); setError(null); }}>{copy.cancel}</Button>
              </div>
            </div> : <Button ref={element => { if (element) revokeButtons.current.set(item.id, element); else revokeButtons.current.delete(item.id); }} variant="outline" className="mt-3 min-h-11 h-auto whitespace-normal" disabled={busy !== null} onClick={() => { setConfirmId(item.id); setError(null); setRevoked(false); }}>{copy.revoke}</Button>}
          </li>)}
        </ul>
      </>}
      {cursor && <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => void load(true)}>{copy.more}</Button>}
    </div>}
  </section>;
}

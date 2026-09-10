import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { accountDeletionCopy } from "@/i18n/accountDeletionCopy";
import { accountRequest } from "@/integrations/neon/auth";
import { isDeletionCode, newDeletionRequestId, parseDeletionChallenge, parseDeletionReceipt, type DeletionChallenge } from "@/lib/accountDeletion";

export default function AccountDeletionPanel({ accountId, onDeleted }: { accountId: string; onDeleted: (accountId: string) => Promise<void> }) {
  const { language } = useLanguage();
  const copy = accountDeletionCopy[language];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [challenge, setChallenge] = useState<DeletionChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"request" | "confirm" | null>(null);
  const [error, setError] = useState<keyof typeof copy | null>(null);
  const [deleted, setDeleted] = useState(false);
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  const scope = useRef<{ accountId: string; controller: AbortController } | null>(null);

  useEffect(() => {
    const current = { accountId, controller: new AbortController() };
    scope.current = current;
    requestId.current = null; pending.current = false;
    setOpen(false); setAcknowledged(false); setChallenge(null); setCode(""); setBusy(null); setError(null); setDeleted(false);
    return () => { current.controller.abort(); if (scope.current === current) scope.current = null; };
  }, [accountId]);

  async function perform(action: "request" | "confirm") {
    const owner = scope.current;
    if (pending.current || !owner || owner.accountId !== accountId || !acknowledged || deleted) return;
    if (action === "confirm" && (!challenge || !isDeletionCode(code))) return;
    pending.current = true; setBusy(action); setError(null);
    try {
      requestId.current ??= newDeletionRequestId();
      const expectedId = action === "confirm" ? challenge!.deletionRequestId : requestId.current;
      const body = action === "request"
        ? { action, requestId: expectedId, language }
        : { action, requestId: expectedId, code, confirmation: "DELETE" };
      const payload = await accountRequest<unknown>("/api/account/deletion", {
        accountId: owner.accountId, signal: owner.controller.signal, method: "POST", body,
      });
      if (scope.current !== owner || owner.controller.signal.aborted) return;
      if (action === "request") {
        setChallenge(parseDeletionChallenge(payload, owner.accountId, expectedId));
        setCode("");
      } else {
        parseDeletionReceipt(payload, owner.accountId, expectedId);
        // A confirmed deletion stays a success even if device-session cleanup fails.
        setDeleted(true); setCode(""); setChallenge(null);
        await onDeleted(owner.accountId).catch(() => undefined);
      }
    } catch (failure) {
      if (scope.current !== owner || owner.controller.signal.aborted) return;
      const failureCode = failure && typeof failure === "object" && "code" in failure ? failure.code : null;
      setError(failureCode === "deletion_code_invalid" ? "invalid"
        : failureCode === "deletion_rate_limited" ? "limited"
        : failureCode === "deletion_email_unavailable" ? "emailError" : action === "request" ? "requestError" : "uncertain");
    } finally {
      if (scope.current === owner && !owner.controller.signal.aborted) { pending.current = false; setBusy(null); }
    }
  }
  function close() {
    if (pending.current) return;
    setOpen(false); setAcknowledged(false); setChallenge(null); setCode(""); setError(null); requestId.current = null;
  }

  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h2 id={`${id}-title`} className="text-lg font-semibold">{copy.title}</h2>
    {deleted ? <div role="status" className="mt-3 space-y-2 text-sm"><p>{copy.success}</p><p>{copy.closeWarning}</p></div>
      : <>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.lead}</p>
        {!open ? <Button variant="outline" className="mt-4 min-h-11 whitespace-normal text-destructive" onClick={() => setOpen(true)} aria-expanded={false}>{copy.title}</Button>
          : <div className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{copy.billing}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{copy.apple}</p>
            <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">{copy.manageApple}</a>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm leading-relaxed">
              <input type="checkbox" checked={acknowledged} disabled={busy !== null} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
              <span>{copy.acknowledge}</span>
            </label>
            {challenge && <div className="space-y-2">
              <p id={`${id}-help`} role="status" className="text-sm leading-relaxed text-muted-foreground">{copy.sent}</p>
              <label htmlFor={`${id}-code`} className="block text-sm font-semibold">{copy.code}</label>
              <input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code}
                onChange={event => setCode(event.target.value)} disabled={busy !== null} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)}
                className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>}
            {error && <p id={`${id}-error`} role="alert" className="text-sm leading-relaxed text-destructive">{copy[error]}</p>}
            <div className="flex flex-wrap gap-3">
              <Button variant="destructive" disabled={busy !== null || !acknowledged || (Boolean(challenge) && !isDeletionCode(code))}
                className="min-h-11 h-auto whitespace-normal py-3" onClick={() => void perform(challenge ? "confirm" : "request")}>
                {busy === "confirm" ? copy.confirming : busy === "request" ? copy.requesting : challenge ? copy.confirm : copy.request}
              </Button>
              <Button variant="outline" disabled={busy !== null} className="min-h-11" onClick={close}>{copy.cancel}</Button>
              {challenge && <Button variant="ghost" disabled={busy !== null} className="min-h-11 h-auto whitespace-normal" onClick={() => {
                setChallenge(null); setCode(""); setError(null); requestId.current = null;
              }}>{copy.resend}</Button>}
            </div>
          </div>}
      </>}
  </section>;
}

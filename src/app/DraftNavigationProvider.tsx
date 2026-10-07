import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DraftNavigationContext, type DraftNavigationRegistration, type RegisterNavigationDraft } from "@/contexts/DraftNavigationContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { tradingPortalCopy } from "@/i18n/tradingPortalCopy";
import { brandWorksheetCopy } from "@/i18n/brandWorksheetCopy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Requires a data router. Hard reloads remain protected by the editor's beforeunload handler. */
export default function DraftNavigationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const c = tradingPortalCopy[language];
  const [drafts, setDrafts] = useState<ReadonlyMap<string, DraftNavigationRegistration>>(() => new Map());
  const register = useCallback<RegisterNavigationDraft>((id, value) => {
    setDrafts(previous => {
      const old = previous.get(id);
      if (!value && !old || value && old?.scope === value.scope && old.ownerId === value.ownerId && old.dirty === value.dirty) return previous;
      const next = new Map(previous);
      if (value) next.set(id, value); else next.delete(id);
      return next;
    });
  }, []);
  const currentDrafts = [...drafts.values()].filter(draft => draft.dirty &&
    (draft.scope === "local" ? draft.ownerId === (user?.id ?? null) : Boolean(user && draft.ownerId === user.id)));
  const protect = currentDrafts.length > 0;
  const localOnly = currentDrafts.every(draft => draft.scope === "local");
  const localCopy = brandWorksheetCopy[language];
  const currentProtection = useRef(protect);
  currentProtection.current = protect;
  // Read current ownership synchronously: a logout/auth redirect must not be
  // caught by an older callback while router effects are still updating.
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) =>
    currentProtection.current && currentLocation.pathname !== nextLocation.pathname, []);
  const blocker = useBlocker(shouldBlock);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const leaving = useRef(false);
  const isBlocked = blocker.state === "blocked";
  useEffect(() => {
    // Never retain a dialog for another account or after a confirmed save.
    if (!protect && blocker.state === "blocked") blocker.reset();
  }, [protect, blocker]);
  const stay = () => { if (blocker.state === "blocked") blocker.reset(); };

  return <DraftNavigationContext.Provider value={register}>
    {children}
    <Dialog open={isBlocked && protect} onOpenChange={open => { if (!open) stay(); }}>
      <DialogContent className="w-[calc(100%_-_2rem)] rounded-2xl [&>button:last-child]:hidden"
        onOpenAutoFocus={event => {
          // Capture before Radix moves focus, not in a parent layout effect
          // that could run after the dialog's own focus scope.
          previousFocus.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
          leaving.current = false;
          event.preventDefault(); keepEditing.current?.focus();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!leaving.current && previousFocus.current?.isConnected) previousFocus.current.focus();
        }}>
        <DialogHeader>
          <DialogTitle>{localOnly ? localCopy.leaveTitle : c.leaveDraftTitle}</DialogTitle>
          <DialogDescription className="pt-2 leading-6">{localOnly ? localCopy.leaveBody : c.leaveDraftBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:gap-0">
          <Button ref={keepEditing} className="min-h-11" onClick={stay}>{c.keepEditing}</Button>
          <Button variant="outline" className="min-h-11" onClick={() => {
            if (blocker.state === "blocked") { leaving.current = true; blocker.proceed(); }
          }}>{c.leaveWithoutSaving}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </DraftNavigationContext.Provider>;
}

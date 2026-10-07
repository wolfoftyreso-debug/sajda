import { createContext, useContext, useId, useLayoutEffect } from "react";

export type DraftNavigationRegistration =
  | { scope: "account"; ownerId: string; dirty: boolean }
  | { scope: "local"; ownerId: string | null; dirty: boolean };
export type RegisterNavigationDraft = (id: string, registration: DraftNavigationRegistration | null) => void;

// Only ownership and a dirty flag leave the editor. Never store private drafts
// in browser storage or copy their contents into an application-wide context.
export const DraftNavigationContext = createContext<RegisterNavigationDraft | null>(null);

export function useDraftNavigationGuard(ownerId: string, dirty: boolean) {
  const register = useContext(DraftNavigationContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!register) return;
    register(id, { scope: "account", ownerId, dirty });
    return () => register(id, null);
  }, [register, id, ownerId, dirty]);
}

/** Public, unsaved work is fenced to the session in which it was entered.
 * A null owner means anonymous local work, not a synthetic account. */
export function useLocalDraftNavigationGuard(ownerId: string | null, dirty: boolean) {
  const register = useContext(DraftNavigationContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!register) return;
    register(id, { scope: "local", ownerId, dirty });
    return () => register(id, null);
  }, [register, id, ownerId, dirty]);
}

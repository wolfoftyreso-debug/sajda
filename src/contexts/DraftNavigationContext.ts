import { createContext, useContext, useId, useLayoutEffect } from "react";

export type DraftNavigationRegistration = { ownerId: string; dirty: boolean };
export type RegisterNavigationDraft = (id: string, registration: DraftNavigationRegistration | null) => void;

// Only ownership and a dirty flag leave the editor. Never store private drafts
// in browser storage or copy their contents into an application-wide context.
export const DraftNavigationContext = createContext<RegisterNavigationDraft | null>(null);

export function useDraftNavigationGuard(ownerId: string, dirty: boolean) {
  const register = useContext(DraftNavigationContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!register) return;
    register(id, { ownerId, dirty });
    return () => register(id, null);
  }, [register, id, ownerId, dirty]);
}

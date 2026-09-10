import { useEffect, useSyncExternalStore } from "react";
import { productFetch } from "@/lib/productFetch";
import { normaliseReferenceFx, REFERENCE_FX_CACHE_MS, type ReferenceFx } from "../../shared/reference-fx";

let snapshot: ReferenceFx | null = null;
let expiresAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => null;

async function refresh() {
  if (Date.now() < expiresAt) return;
  if (!pending) pending = (async () => {
    try {
      const response = await productFetch("/api/reference-fx", { credentials: "omit", signal: AbortSignal.timeout(7_000) });
      const payload = response.ok ? await response.json() : null;
      snapshot = normaliseReferenceFx(payload?.referenceFx);
    } catch { snapshot = null; }
    expiresAt = snapshot ? Date.parse(snapshot.fetchedAt) + REFERENCE_FX_CACHE_MS : Date.now() + 60_000;
    for (const listener of listeners) listener();
  })().finally(() => { pending = null; });
  await pending;
}

/** One shared request/cache for every comparison card on the page. */
export function useReferenceFx(enabled = true): ReferenceFx | null {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(load, Math.max(1_000, expiresAt - Date.now() + 1));
    };
    void load();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [enabled]);
  return value;
}

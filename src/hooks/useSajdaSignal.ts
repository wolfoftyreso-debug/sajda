import { useCallback, useEffect, useMemo, useState } from "react";
import type { Language } from "@/i18n/LanguageProvider";
import {
  getSajdaSignalPool,
  type SajdaSignal,
  type SajdaSignalKind,
} from "@/lib/sajdaSignals";
import { useDomainSaleFactFeed } from "@/hooks/useDomainSaleFactFeed";

const SIGNAL_STORAGE_KEY = "sajda.product-signal-cycle.v4";
// Signals used to disappear after ten seconds. Keep them visible for twenty
// seconds so the guidance can actually be read without becoming persistent UI.
const SIGNAL_VISIBLE_DURATION_MS = 20_000;

interface StoredSignalCycle {
  version: 4;
  /** All IDs that existed when this queue was last reconciled. */
  knownIds: string[];
  /** IDs not yet shown in the current cycle. */
  remainingIds: string[];
  lastId?: string;
}

let volatileCycle: StoredSignalCycle | null = null;

function randomInteger(upperBound: number) {
  return Math.floor(Math.random() * upperBound);
}

function shuffleIds(ids: readonly string[], lastId?: string): string[] {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  // A completed cycle may be reshuffled. Do not let its first item be the same
  // as the last item of the previous cycle when there is another option.
  if (lastId && shuffled.length > 1 && shuffled[0] === lastId) {
    const replacementIndex = 1 + randomInteger(shuffled.length - 1);
    [shuffled[0], shuffled[replacementIndex]] = [shuffled[replacementIndex], shuffled[0]];
  }

  return shuffled;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

function isValidCycle(value: unknown): value is StoredSignalCycle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSignalCycle>;
  return candidate.version === 4
    && Array.isArray(candidate.knownIds)
    && Array.isArray(candidate.remainingIds)
    && candidate.knownIds.every((id) => typeof id === "string")
    && candidate.remainingIds.every((id) => typeof id === "string")
    && (candidate.lastId === undefined || typeof candidate.lastId === "string");
}

function readCycle(): StoredSignalCycle | null {
  try {
    const raw = window.localStorage.getItem(SIGNAL_STORAGE_KEY);
    if (!raw) return volatileCycle;
    const parsed: unknown = JSON.parse(raw);
    return isValidCycle(parsed) ? parsed : volatileCycle;
  } catch {
    return volatileCycle;
  }
}

function writeCycle(cycle: StoredSignalCycle) {
  volatileCycle = cycle;
  try {
    window.localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify(cycle));
  } catch {
    // Private browsing and restrictive browser settings can block storage. The
    // in-memory cycle still keeps the current session from repeating a note.
  }
}

function createCycle(signalIds: readonly string[], lastId?: string): StoredSignalCycle {
  const ids = uniqueIds(signalIds);
  return {
    version: 4,
    knownIds: ids,
    remainingIds: shuffleIds(ids, lastId),
    lastId,
  };
}

/**
 * Keeps the existing unseen queue intact when a server adds or removes a
 * fact. Newly introduced IDs are folded into that queue once; already shown
 * messages do not reappear simply because the optional feed loaded.
 */
function reconcileCycle(cycle: StoredSignalCycle, signalIds: readonly string[]): StoredSignalCycle {
  const expectedIds = uniqueIds(signalIds);
  const expectedSet = new Set(expectedIds);
  const knownSet = new Set(cycle.knownIds);
  const remainingIds = uniqueIds(cycle.remainingIds).filter((id) => expectedSet.has(id));
  const introducedIds = expectedIds.filter((id) => !knownSet.has(id));
  const unchanged = introducedIds.length === 0
    && expectedIds.length === cycle.knownIds.length
    && expectedIds.every((id) => knownSet.has(id))
    && remainingIds.length === cycle.remainingIds.length;

  if (unchanged) return cycle;

  return {
    ...cycle,
    knownIds: expectedIds,
    remainingIds: shuffleIds([...remainingIds, ...introducedIds], cycle.lastId),
  };
}

function takeNextSignalId(signalIds: readonly string[]): string | null {
  if (signalIds.length === 0) return null;
  const restored = readCycle();
  const cycle = restored && isValidCycle(restored)
    ? reconcileCycle(restored, signalIds)
    : createCycle(signalIds);
  const current = cycle.remainingIds.length > 0 ? cycle : createCycle(signalIds, cycle.lastId);
  const [id, ...remainingIds] = current.remainingIds;
  if (!id) return null;

  writeCycle({
    ...current,
    remainingIds,
    lastId: id,
  });
  return id;
}

export interface UseSajdaSignalOptions {
  /** Keep the control out of an active scan or irrelevant page state. */
  enabled?: boolean;
  /** Limits the brief to concepts that make sense in the current surface. */
  kinds?: readonly SajdaSignalKind[];
}

/**
 * A user-controlled queue for optional product and market context. This hook
 * intentionally does not schedule, animate, or auto-open anything: a search
 * tool should not interrupt somebody who is trying to make a decision. Once
 * opened, a brief stays readable for twenty seconds before it closes quietly.
 */
export function useSajdaSignal(language: Language, { enabled = true, kinds }: UseSajdaSignalOptions = {}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const serverSaleFacts = useDomainSaleFactFeed(enabled);
  const kindFilterKey = kinds ? [...new Set(kinds)].sort().join(",") : "";

  const signalPool = useMemo(() => {
    const pool = getSajdaSignalPool(language, serverSaleFacts);
    if (!kindFilterKey) return pool;
    const allowedKinds = new Set(kindFilterKey.split(",") as SajdaSignalKind[]);
    return pool.filter((signal) => allowedKinds.has(signal.kind));
  }, [kindFilterKey, language, serverSaleFacts]);
  const signalIds = useMemo(() => signalPool.map((signal) => signal.id), [signalPool]);

  const signalsById = useMemo(
    () => new Map(signalPool.map((signal) => [signal.id, signal])),
    [signalPool],
  );

  const selectNext = useCallback(() => {
    if (!enabled) return false;
    const id = takeNextSignalId(signalIds);
    if (!id) return false;
    setCurrentId(id);
    return true;
  }, [enabled, signalIds]);

  const open = useCallback(() => {
    if (!enabled) return;
    const canReuseCurrent = currentId !== null && signalsById.has(currentId);
    if (!canReuseCurrent && !selectNext()) return;
    setIsOpen(true);
  }, [currentId, enabled, selectNext, signalsById]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  const next = useCallback(() => {
    if (selectNext()) setIsOpen(true);
  }, [selectNext]);

  useEffect(() => {
    if (enabled) return;
    setIsOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const timeout = window.setTimeout(() => {
      setIsOpen(false);
    }, SIGNAL_VISIBLE_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!currentId || signalsById.has(currentId)) return;
    setCurrentId(null);
    setIsOpen(false);
  }, [currentId, signalsById]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, isOpen]);

  const signal: SajdaSignal | null = currentId ? signalsById.get(currentId) ?? null : null;
  return {
    signal,
    isVisible: Boolean(isOpen && signal),
    open,
    next,
    dismiss,
  };
}

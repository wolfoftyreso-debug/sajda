/**
 * Browser-scoped access for Sajda's single free search.
 *
 * This is deliberately not an identity system and stores no search terms,
 * account data, or tracking identifier. It only records whether this browser
 * has completed its introductory search. The public API keeps its own
 * server-side rate limit; a browser can always clear site storage, so this is
 * a product access boundary rather than an abuse-prevention mechanism.
 */

const STORAGE_KEY = "sajda.free-search.v1";
const PENDING_TTL_MS = 5 * 60 * 1_000;

type StoredFreeSearchPass = {
  version: 1;
  state: "pending" | "completed";
  reservationId: string;
  updatedAt: string;
  expiresAt?: string;
};

// Private browsing or a strict browser policy can reject localStorage. Keep
// the same one-pass behaviour for the current document rather than blocking a
// legitimate first search. It intentionally disappears when the page closes.
let memoryRecord: StoredFreeSearchPass | null = null;
let storageFailed = false;

export interface FreeSearchReservation {
  complete: () => void;
  release: () => void;
}

function storage(): Storage | null {
  if (typeof window === "undefined" || storageFailed) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is StoredFreeSearchPass {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredFreeSearchPass>;
  return candidate.version === 1
    && (candidate.state === "pending" || candidate.state === "completed")
    && typeof candidate.reservationId === "string"
    && candidate.reservationId.length >= 12
    && typeof candidate.updatedAt === "string";
}

function read(): StoredFreeSearchPass | null {
  const target = storage();
  if (!target) return memoryRecord;

  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      target.removeItem(STORAGE_KEY);
      return null;
    }

    // A closed tab must never burn the introductory search permanently. A
    // short pending reservation only prevents duplicate click/tab requests.
    if (value.state === "pending") {
      const expiresAt = Date.parse(value.expiresAt ?? "");
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        target.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return value;
  } catch {
    // Storage can be full, blocked, or manually edited. Treat it as absent;
    // callers still get the API's server-side rate limiting.
    return memoryRecord;
  }
}

function write(value: StoredFreeSearchPass): boolean {
  const target = storage();
  if (!target) {
    memoryRecord = value;
    return true;
  }
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(value));
    memoryRecord = value;
    return true;
  } catch {
    storageFailed = true;
    memoryRecord = value;
    return true;
  }
}

function newReservationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `free_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function hasCompletedFreeSearch(): boolean {
  return read()?.state === "completed";
}

/**
 * Reserves the single pass until a request either completes or fails. Only a
 * successful caller may commit it, so network/registry failures remain
 * retryable. This is a best-effort UI reservation, not an atomic cross-tab or
 * server-enforced entitlement. localStorage does not provide transactions.
 */
export function reserveFreeSearch(): FreeSearchReservation | null {
  if (read()) return null;

  const reservationId = newReservationId();
  const now = new Date();
  const reserved: StoredFreeSearchPass = {
    version: 1,
    state: "pending",
    reservationId,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
  };

  if (!write(reserved) || read()?.reservationId !== reservationId) return null;

  let settled = false;
  const ownsReservation = () => read()?.reservationId === reservationId;

  return {
    complete: () => {
      if (settled || !ownsReservation()) return;
      settled = true;
      write({
        version: 1,
        state: "completed",
        reservationId,
        updatedAt: new Date().toISOString(),
      });
    },
    release: () => {
      if (settled || !ownsReservation()) return;
      settled = true;
      try {
        const target = storage();
        target?.removeItem(STORAGE_KEY);
        memoryRecord = null;
      } catch {
        // A stale pending record safely expires after a few minutes.
      }
    },
  };
}

export function isFreeSearchQuotaStorageEvent(event: StorageEvent): boolean {
  return event.storageArea === storage() && event.key === STORAGE_KEY;
}

import { AccountAccessError } from "./account-error.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface BrandLookupLease {
  release(): Promise<void>;
  backoff(seconds: number): Promise<void>;
}

export interface BrandLookupBudgetOptions {
  now?: () => number;
  maxPerHour?: number;
  minSpacingMs?: number;
}

const limited = () => new AccountAccessError("rate_limited", 429, "Brand lookup is temporarily limited. Please retry later.");

/**
 * In-memory, per-instance admission gate only: no queue, database, or global
 * operator quota. Separate workers/processes and restarts do not share state.
 * Production-wide provider budgeting must be implemented outside this gate.
 * A reservation is charged on admission, not refunded when its lease releases.
 */
export function createBrandLookupBudget({ now = Date.now, maxPerHour = 30, minSpacingMs = 1000 }: BrandLookupBudgetOptions = {}): (requestUnits?: number) => Promise<BrandLookupLease> {
  if (typeof now !== "function" || !Number.isSafeInteger(maxPerHour) || maxPerHour < 1 || maxPerHour > 30
    || !Number.isSafeInteger(minSpacingMs) || minSpacingMs < 1000 || minSpacingMs > DAY_MS) {
    throw new TypeError("Invalid brand lookup budget options.");
  }

  let reservations: Array<{ at: number; units: number }> = [];
  let active: symbol | null = null;
  let lastReservation: number | null = null;
  let lastClock = 0;
  let cooldownUntil = 0;

  const clock = (): number => {
    let value: number;
    try { value = now(); } catch { throw limited(); }
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - DAY_MS) throw limited();
    // A backwards wall-clock adjustment must not forgive spacing or cooldowns.
    lastClock = Math.max(lastClock, value);
    return lastClock;
  };

  return async (requestUnits = 1) => {
    if (![1, 2].includes(requestUnits)) throw limited();
    const at = clock();
    if (active !== null || at < cooldownUntil || lastReservation !== null && at - lastReservation < minSpacingMs) throw limited();
    reservations = reservations.filter(row => row.at > at - HOUR_MS);
    if (reservations.reduce((total, row) => total + row.units, 0) + requestUnits > maxPerHour) throw limited();

    // No await before this state change: concurrent callers cannot both enter.
    const token = Symbol("brand-lookup-lease");
    active = token;
    reservations.push({ at, units: requestUnits });
    lastReservation = at;
    let released = false;

    return {
      async release() {
        if (released) return;
        released = true;
        if (active === token) active = null;
      },
      async backoff(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Invalid brand lookup backoff.");
        // Never shorten an earlier Retry-After, including after lease release.
        // Huge finite durations saturate closed rather than overflow into a
        // short retry. Like all state here, this survives only this instance.
        const deadline = Math.min(Number.MAX_SAFE_INTEGER, clock() + Math.ceil(seconds * 1000));
        cooldownUntil = Math.max(cooldownUntil, deadline);
      },
    };
  };
}

/** Singleton for this loaded module/process, not a distributed quota. */
export const reserveBrandLookup = createBrandLookupBudget();

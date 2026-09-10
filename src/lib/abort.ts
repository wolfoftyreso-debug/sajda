/** Works without newer AbortSignal methods in older website browsers. */
export function throwIfCancelled(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  throw new DOMException("Request cancelled", "AbortError");
}

/** A request-local timer, not a global polyfill. Always dispose in finally. */
export function requestDeadline(milliseconds: number): {
  signal: AbortSignal;
  dispose: () => void;
  cancel: () => void;
} {
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 2_147_483_647) {
    throw new RangeError("Request deadline must be a non-negative 32-bit integer.");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timer = undefined;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, milliseconds);
  const dispose = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  return { signal: controller.signal, dispose, cancel: () => { dispose(); controller.abort(); } };
}

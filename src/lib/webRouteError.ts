import { isRouteErrorResponse } from "react-router-dom";

const references = new WeakMap<object, string>();
let lastPrimitive: { error: unknown; reference: string } | undefined;

function createReference(): string {
  // A diagnostic label, never an authentication token or server request ID.
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `web-${value}`;
}

/** Ephemeral browser correlation. Objects are weakly held; only one primitive is retained. */
export function webRouteErrorReference(error: unknown): string {
  if (error !== null && (typeof error === "object" || typeof error === "function")) {
    const existing = references.get(error);
    if (existing) return existing;
    const reference = createReference();
    references.set(error, reference);
    return reference;
  }
  if (lastPrimitive && Object.is(lastPrimitive.error, error)) return lastPrimitive.reference;
  const reference = createReference();
  lastPrimitive = { error, reference };
  return reference;
}

/** RouterProvider uses this instead of its default raw-error callback.
 * This is a browser console event only, not delivery to remote monitoring.
 * Never emit exception text, stacks, URLs, account data or credentials.
 */
export function reportWebRouteError(error: unknown): void {
  let kind: "route_response" | "render_error" | "unknown" = "unknown";
  let status: number | undefined;
  // Even an unusual thrown proxy/getter must not break the recovery screen.
  try {
    if (isRouteErrorResponse(error)) {
      kind = "route_response";
      if (Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) status = error.status;
    } else if (error instanceof Error) kind = "render_error";
  } catch { /* Leave the classification unknown; do not inspect the value again. */ }
  console.error(JSON.stringify({ event: "web_screen_failed", clientReference: webRouteErrorReference(error),
    kind,
    ...(status !== undefined ? { status } : {}),
  }));
}

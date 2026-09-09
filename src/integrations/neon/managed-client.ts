import { createAuthClient } from "better-auth/client";

/** Authentication runs on Sajda's own Vercel origin; no external auth tenant. */
export function createManagedAccountClient() {
  return createAuthClient({
    baseURL: window.location.origin,
    basePath: "/api/auth",
    fetchOptions: { credentials: "same-origin", redirect: "error", cache: "no-store", timeout: 12_000, retry: 0 },
    // AuthContext owns navigation and session refresh, including cross-tab events.
    disableDefaultFetchPlugins: true,
  });
}

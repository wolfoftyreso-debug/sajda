const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Local test mode is intentionally constrained to loopback. It cannot turn
 * off authentication for a deployed site. It is enabled only when a local
 * build explicitly sets VITE_LOCAL_TEST_MODE=true.
 */
export function isLocalTestMode(): boolean {
  return typeof window !== "undefined"
    && import.meta.env.VITE_LOCAL_TEST_MODE === "true"
    && LOOPBACK_HOSTS.has(window.location.hostname);
}

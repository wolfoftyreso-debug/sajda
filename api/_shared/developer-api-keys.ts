/**
 * Transitional server-only API-key boundary.
 *
 * The former self-service key store has intentionally been
 * removed. New keys must not be minted, listed, revoked, or authenticated
 * until the Neon Auth and Neon Postgres implementation is live and verified.
 *
 * `api/v1/domains` retains its separate `SAJDA_API_KEY_HASHES` allow-list for
 * already-provisioned operator integrations. This module never authenticates a
 * persisted key while that migration is incomplete.
 */

const PERSISTED_API_KEY_PATTERN = /^sj_(?:test|live)_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/u;

export type PersistedApiKeyAuthentication =
  | { status: "authenticated"; clientId: string }
  | { status: "not_applicable" | "invalid" | "unavailable" };

/**
 * Explicitly declines the retired persisted-key format.
 *
 * A recognizable generated key returns `unavailable`, which lets callers
 * distinguish a disabled Neon migration path from an unrelated bearer token.
 * It deliberately never returns `authenticated`; the static server-only hash
 * allow-list remains the only active compatibility path until Neon storage is
 * provisioned and tested.
 */
export async function authenticatePersistedApiKey(
  token: string,
): Promise<PersistedApiKeyAuthentication> {
  return PERSISTED_API_KEY_PATTERN.test(token)
    ? { status: "unavailable" }
    : { status: "not_applicable" };
}

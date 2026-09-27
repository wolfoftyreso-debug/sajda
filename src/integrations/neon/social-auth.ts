export const SOCIAL_AUTH_PROVIDER_IDS = ["google", "twitter", "github", "apple"] as const;
export type SocialAuthProviderId = typeof SOCIAL_AUTH_PROVIDER_IDS[number];
export interface SocialAuthProviderAvailability { id: SocialAuthProviderId; enabled: boolean }

function isProviderId(value: unknown): value is SocialAuthProviderId {
  return typeof value === "string" && SOCIAL_AUTH_PROVIDER_IDS.includes(value as SocialAuthProviderId);
}

export async function readSocialAuthProviders(): Promise<SocialAuthProviderAvailability[]> {
  const response = await fetch("/api/auth-providers", {
    method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Social sign-in methods are unavailable.");
  const body: unknown = await response.json();
  const providers = body && typeof body === "object" && "providers" in body ? (body as { providers?: unknown }).providers : undefined;
  if (!Array.isArray(providers)) throw new Error("Social sign-in methods are unavailable.");
  const parsed = providers.filter((value): value is SocialAuthProviderAvailability => Boolean(value && typeof value === "object"
    && isProviderId((value as { id?: unknown }).id) && typeof (value as { enabled?: unknown }).enabled === "boolean"));
  if (parsed.length !== SOCIAL_AUTH_PROVIDER_IDS.length || new Set(parsed.map(item => item.id)).size !== parsed.length) {
    throw new Error("Social sign-in methods are unavailable.");
  }
  return SOCIAL_AUTH_PROVIDER_IDS.map(id => parsed.find(item => item.id === id)!);
}

const authorizationHosts: Record<SocialAuthProviderId, string> = {
  google: "accounts.google.com", twitter: "x.com", github: "github.com", apple: "appleid.apple.com",
};

export function verifiedSocialAuthorizationUrl(provider: SocialAuthProviderId, value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === authorizationHosts[provider] && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

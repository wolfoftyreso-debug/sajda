export const SOCIAL_AUTH_PROVIDERS = ["google", "twitter", "github", "apple"] as const;
export type SocialAuthProvider = typeof SOCIAL_AUTH_PROVIDERS[number];

export interface SocialAuthProviderStatus {
  id: SocialAuthProvider;
  enabled: boolean;
}

const providerVariables = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  twitter: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  apple: ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"],
} as const satisfies Record<SocialAuthProvider, readonly [string, string]>;

function credential(value: string | undefined, maximum: number): string | null {
  const normalized = value?.trim();
  // eslint-disable-next-line no-control-regex -- Provider credentials must never contain header/control bytes.
  if (!normalized || normalized.length < 3 || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

function providerCredentials(provider: SocialAuthProvider, env: NodeJS.ProcessEnv): { clientId: string; clientSecret: string } | null {
  const [idVariable, secretVariable] = providerVariables[provider];
  const clientId = credential(env[idVariable], 512);
  const clientSecret = credential(env[secretVariable], provider === "apple" ? 8192 : 4096);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function verifiedTwitterUserInfo(token: { accessToken?: string | undefined }) {
  if (!token.accessToken || token.accessToken.length > 8192) return null;
  const headers = { Authorization: `Bearer ${token.accessToken}`, Accept: "application/json" };
  const request = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    return response.json();
  };
  const [profileValue, emailValue] = await Promise.all([
    request("https://api.x.com/2/users/me?user.fields=profile_image_url"),
    request("https://api.x.com/2/users/me?user.fields=confirmed_email"),
  ]);
  const profile = profileValue && typeof profileValue === "object" && "data" in profileValue
    ? (profileValue as { data?: Record<string, unknown> }).data : undefined;
  const emailData = emailValue && typeof emailValue === "object" && "data" in emailValue
    ? (emailValue as { data?: Record<string, unknown> }).data : undefined;
  const id = typeof profile?.id === "string" && /^[0-9]{1,32}$/u.test(profile.id) ? profile.id : null;
  const name = typeof profile?.name === "string" && profile.name.trim().length <= 100 ? profile.name.trim() : null;
  const username = typeof profile?.username === "string" && /^[A-Za-z0-9_]{1,50}$/u.test(profile.username) ? profile.username : null;
  const email = typeof emailData?.confirmed_email === "string" && emailData.confirmed_email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(emailData.confirmed_email) ? emailData.confirmed_email.toLowerCase() : null;
  const image = typeof profile?.profile_image_url === "string" && profile.profile_image_url.length <= 2048
    && /^https:\/\//u.test(profile.profile_image_url) ? profile.profile_image_url : undefined;
  // Never create a placeholder-email account. X login is enabled only when X
  // returns the account's confirmed email address.
  if (!id || !name || !username || !email) return null;
  const data = { data: { ...profile, id, name, username, email }, includes: undefined };
  return { user: { name, email, emailVerified: true, image }, data };
}

/** Server-only provider configuration. Incomplete credential pairs fail closed. */
export function socialAuthProviders(env: NodeJS.ProcessEnv = process.env) {
  const google = providerCredentials("google", env);
  const twitter = providerCredentials("twitter", env);
  const github = providerCredentials("github", env);
  const apple = providerCredentials("apple", env);
  return {
    ...(google ? { google: { ...google, requireEmailVerification: true, disableIdTokenSignIn: true } } : {}),
    ...(twitter ? { twitter: {
      ...twitter, requireEmailVerification: true, disableDefaultScope: true,
      scope: ["users.read", "users.email"], getUserInfo: verifiedTwitterUserInfo,
    } } : {}),
    ...(github ? { github: { ...github, requireEmailVerification: true } } : {}),
    ...(apple ? { apple: {
      ...apple, requireEmailVerification: true, disableIdTokenSignIn: true,
      ...(credential(env.APPLE_APP_BUNDLE_IDENTIFIER, 512) ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER!.trim() } : {}),
    } } : {}),
  };
}

export function socialAuthProviderStatus(env: NodeJS.ProcessEnv = process.env): SocialAuthProviderStatus[] {
  return SOCIAL_AUTH_PROVIDERS.map(id => ({ id, enabled: providerCredentials(id, env) !== null }));
}

export function socialAuthConfigurationIssues(env: NodeJS.ProcessEnv = process.env): string[] {
  const issues: string[] = [];
  for (const provider of SOCIAL_AUTH_PROVIDERS) {
    const [idVariable, secretVariable] = providerVariables[provider];
    const hasId = credential(env[idVariable], 512) !== null;
    const hasSecret = credential(env[secretVariable], provider === "apple" ? 8192 : 4096) !== null;
    if (hasId !== hasSecret) issues.push(`${provider}_oauth_credential_pair_incomplete`);
  }
  return issues;
}

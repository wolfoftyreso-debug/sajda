/** Never permit a callback or `next` parameter to leave this application. */
export function safeAccountPath(value: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex -- URL parsers strip control characters; reject them before checking the origin.
  if (!value || !/^\/(?![\\/])/u.test(value) || /[\\\u0000-\u001f\u007f]/u.test(value)) return "/";
  try {
    const base = "https://sajda.invalid";
    const parsed = new URL(value, base);
    return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

export function accountCallbackUrl(origin: string, nextPath?: string): string {
  const callback = new URL("/auth", origin);
  const next = safeAccountPath(nextPath);
  if (next !== "/") callback.searchParams.set("next", next);
  return callback.toString();
}

export function passwordRecoveryUrl(origin: string, nextPath?: string): string {
  const callback = new URL(accountCallbackUrl(origin, nextPath));
  callback.searchParams.set("mode", "update-password");
  return callback.toString();
}

/** The provider validates authenticity/expiry; this bounds untrusted URL input. */
export function passwordRecoveryToken(search: string): string | null {
  const token = new URLSearchParams(search).get("token");
  return token && token.length <= 2048 && /^[A-Za-z0-9._~-]+$/u.test(token) ? token : null;
}

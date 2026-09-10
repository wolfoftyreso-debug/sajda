import { AccountAccessError } from "./account-error.js";
import { emailLanguage } from "../../shared/account-email-copy.js";

export type AccountHeaders = Record<string, string | string[] | undefined>;

/** Only server configuration and Vercel deployment metadata establish trust. */
export function accountOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = [env.BETTER_AUTH_URL];
  if (env.VERCEL) {
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL,
      ...(env.VERCEL_ENV === "production" ? [env.VERCEL_PROJECT_PRODUCTION_URL] : [])]) {
      if (host) values.push(`https://${host}`);
    }
  }
  return [...new Set(values.filter(Boolean).map(value => {
    try {
      const url = new URL(value!);
      const loopback = !env.VERCEL && ["127.0.0.1", "localhost"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
        || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
      return url.origin;
    } catch {
      throw new AccountAccessError("auth_not_configured", 503, "Account access is not configured correctly.");
    }
  }))];
}

export function accountRequestOrigin(headers: AccountHeaders, env: NodeJS.ProcessEnv = process.env): string {
  const origins = accountOrigins(env);
  const host = headers.host;
  const origin = typeof host === "string" && origins.find(value => new URL(value).host === host);
  if (!origin) throw new AccountAccessError("invalid_origin", 403, "Open Sajda on its configured website and try again.");
  return origin;
}

export function requireSameOrigin(headers: AccountHeaders, origin: string): void {
  if (headers.origin !== origin || headers["sec-fetch-site"] === "cross-site") {
    throw new AccountAccessError("invalid_origin", 403, "This action must be started on the Sajda website.");
  }
}

export function accountWebHeaders(headers: AccountHeaders): Headers {
  const result = new Headers();
  // Locale is untrusted presentation input; forward only a supported value.
  result.set("x-sajda-language", emailLanguage(headers["x-sajda-language"]));
  for (const name of ["cookie", "origin", "content-type", "user-agent", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "x-vercel-forwarded-for"]) {
    const value = headers[name];
    if (typeof value === "string") result.set(name, value);
  }
  return result;
}

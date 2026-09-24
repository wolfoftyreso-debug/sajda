import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { createRequestId } from "../_shared/public-api.js";
import { nativeJson } from "../_shared/native-http.js";
import { consumePackageSocialQuota, observeGithubHandle, packageSocialInputSchema } from "../_shared/name-package-social.js";
interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; body?: unknown }
interface ResponseLike { setHeader(name:string,value:string|number):void; status(code:number):ResponseLike; json(value:unknown):void }
export const config = { maxDuration: 15 };

export function createPackageSocialHandler(deps: {
  authorize?: typeof requireAccount; quota?: typeof consumePackageSocialQuota; observe?: typeof observeGithubHandle;
} = {}) {
  return async (request: RequestLike, response: ResponseLike) => {
    const requestId = createRequestId();
    for (const [key, value] of Object.entries({ "Cache-Control":"private, no-store", "Content-Type":"application/json; charset=utf-8",
      "X-Robots-Tag":"noindex, nofollow", "Referrer-Policy":"no-referrer", "X-Content-Type-Options":"nosniff",
      "X-Request-Id":requestId, Vary:"Cookie, Authorization, Origin" })) response.setHeader(key,value);
    if (request.method !== "POST") {
      response.setHeader("Allow","POST"); response.status(405).json({code:"method_not_allowed",requestId}); return;
    }
    try {
      const authorize = deps.authorize ?? requireAccount;
      const owner = await authorize(request.headers,{verifiedEmail:true,method:"POST"});
      if (Object.keys(request.query ?? {}).length) throw new AccountAccessError("invalid_request",400,"Use the request body, not URL parameters.");
      request.headers ??= {};
      // Preserve the real IncomingMessage iterator when Vercel has not parsed it.
      const raw = await nativeJson(request as Parameters<typeof nativeJson>[0],{maxBytes:4096,parsedMaxBytes:()=>4096});
      const parsed = packageSocialInputSchema.safeParse(raw);
      if (!parsed.success) throw new AccountAccessError("invalid_request",400,"Choose up to five distinct valid GitHub handles.");
      await (deps.quota ?? consumePackageSocialQuota)(owner.id,parsed.data.handles.length);
      // Five bounded API calls, no recursive discovery or arbitrary URL fetch.
      const observations = await Promise.all(parsed.data.handles.map(handle => (deps.observe ?? observeGithubHandle)(handle)));
      const current = await authorize(request.headers,{verifiedEmail:true,method:"POST"});
      if (current.id !== owner.id) throw new AccountAccessError("account_changed",409,"The account changed. Sign in again.");
      response.status(200).json({accountId:owner.id,observations,requestId});
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error
        : new AccountAccessError("social_unavailable",503,"Profile checks could not finish. No name was marked available. Retry later.");
      if (failure.status === 429) response.setHeader("Retry-After",3600);
      if (failure.status >= 500) console.error(JSON.stringify({event:"name_package_social_failed",requestId,code:failure.code}));
      response.status(failure.status).json({code:failure.code,error:failure.message,requestId});
    }
  };
}
export default createPackageSocialHandler();

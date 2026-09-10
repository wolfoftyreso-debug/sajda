import { z } from "zod";
import { AccountAccessError } from "../_shared/account-error.js";
import { accountRequestOrigin } from "../_shared/account-origin.js";
import { createDelegatedAccountHeaders } from "../_shared/delegated-account.js";
import { requireNativeSession, limitNative } from "../_shared/native-auth.js";
import { createRequestId } from "../_shared/public-api.js";
import { nativeJson, nativeResponseHeaders, nativeFailure, type NativeRequest, type NativeResponse } from "../_shared/native-http.js";
import membership from "../account/membership.js";
import saved from "../account/saved-domains.js";
import trading from "../account/lost-domains.js";
import capabilities from "../account/capabilities.js";
import developerKeys from "../developer/api-keys.js";

export const config = { maxDuration: 60 };
const input = z.object({
  path: z.string().max(1000), method: z.enum(["GET","POST","DELETE"]),
  accountId: z.string().min(1).max(200), body: z.unknown().optional(),
}).strict();
export function nativeAccountRoute(path: string, method: string, body?: unknown) {
  if (/^\/api\/developer\/api-keys(?:\?id=[a-f0-9-]{36})?$/.test(path)
    && ["GET","POST","DELETE"].includes(method)) {
    const target = new URL(path,"https://sajda.invalid");
    if ((method === "DELETE" && target.searchParams.get("id")) || (method !== "DELETE" && !target.search)) {
      return {handler:developerKeys,scope:"keys:manage",query:Object.fromEntries(target.searchParams)};
    }
  }
  if (!/^\/api\/account\/[a-z-]+(?:\?[^#\\]*)?$/.test(path)) {
    throw new AccountAccessError("invalid_request",400,"Use a canonical app API path.");
  }
  const url = new URL(path, "https://sajda.invalid");
  if (url.origin !== "https://sajda.invalid" || url.hash || !path.startsWith("/api/account/")
    || [...url.searchParams.keys()].some(key => key !== "cursor") || url.searchParams.getAll("cursor").length > 1) {
    throw new AccountAccessError("invalid_request",400,"Invalid app API route.");
  }
  if (url.pathname === "/api/account/membership" && method === "GET" && !url.search) return { handler: membership, scope:"account:read", query:{} };
  if (url.pathname === "/api/account/saved-domains" && ["GET","POST","DELETE"].includes(method)
    && (method === "GET" || !url.search)) return { handler: saved, scope:method === "GET" ? "saved:read":"saved:write", query:Object.fromEntries(url.searchParams) };
  if (url.pathname === "/api/account/capabilities" && ["GET","POST"].includes(method) && !url.search)
    return { handler:capabilities, scope:method === "GET"?"account:read":"swipe:write", query:{} };
  if (url.pathname === "/api/account/lost-domains" && ["GET","POST"].includes(method) && !url.search) {
    const action = body && typeof body === "object" && "action" in body ? body.action : undefined;
    if (method === "POST" && !["start","advance","cancel","refresh_quote"].includes(String(action))) {
      throw new AccountAccessError("invalid_request",400,"Choose a supported Trading action.");
    }
    return { handler:trading, scope:method === "GET"?"trading:read":action === "refresh_quote"?"trading:quote":"trading:run", query:{} };
  }
  // In-app billing is a separate StoreKit project. No native request can initiate
  // the browser Stripe checkout or portal, even if its UI is modified.
  throw new AccountAccessError("unsupported_native_action",403,"This action is not available in the app.");
}
export default async function handler(request: NativeRequest, response: NativeResponse) {
  const requestId = createRequestId();
  nativeResponseHeaders(response, requestId);
  try {
    accountRequestOrigin(request.headers);
    if (request.method !== "POST") {
      response.setHeader("Allow","POST");
      throw new AccountAccessError("method_not_allowed",405,"Use POST.");
    }
    const { principal } = await requireNativeSession(request.headers);
    await limitNative(principal.userId,120);
    const parsed = input.safeParse(await nativeJson(request));
    if (!parsed.success) throw new AccountAccessError("invalid_request",400,"Send a valid app request.");
    const value = parsed.data;
    if (value.accountId !== principal.userId) throw new AccountAccessError("account_changed",409,"Your account changed. Reload before trying again.");
    const route = nativeAccountRoute(value.path,value.method,value.body);
    await route.handler({
      method:value.method, headers:createDelegatedAccountHeaders(principal,route.scope,value.method),
      body:value.body, query:route.query,
    },response);
  } catch (error) { nativeFailure(error,response,requestId); }
}

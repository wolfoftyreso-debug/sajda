import { requireAccount, AccountAccessError } from "../_shared/account-auth.js";
import { accountRequestOrigin, accountWebHeaders } from "../_shared/account-origin.js";
import { getAccountAuth } from "../_shared/account-server.js";
import { createRequestId } from "../_shared/public-api.js";
import { nativeAuthorizeInput, nativeExchangeInput, NATIVE_CALLBACK, requireNativeEnabled,
  issueNativeCode, exchangeNativeCode, requireNativeSession, revokeNativeSession, limitNative } from "../_shared/native-auth.js";
import { nativeJson, nativeResponseHeaders, nativeFailure, type NativeRequest, type NativeResponse } from "../_shared/native-http.js";
export const config = { maxDuration: 20 };

export default async function handler(request: NativeRequest, response: NativeResponse) {
  const requestId = createRequestId();
  nativeResponseHeaders(response, requestId);
  try {
    requireNativeEnabled();
    const origin = accountRequestOrigin(request.headers);
    if (request.method === "GET") {
      const { session, principal } = await requireNativeSession(request.headers);
      await limitNative(principal.userId);
      response.status(200).json({ session, requestId });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      throw new AccountAccessError("method_not_allowed", 405, "Use GET or POST.");
    }
    const body = await nativeJson(request);
    const authorize = nativeAuthorizeInput.safeParse(body);
    if (authorize.success) {
      // Only the web consent screen may issue a code. This is a cookie-authenticated,
      // same-origin mutation, never a bearer-to-session or anonymous minting endpoint.
      const account = await requireAccount(request.headers, { method: "POST", verifiedEmail: true });
      await limitNative(`authorize:${account.id}`, 5);
      const current = await getAccountAuth(origin).api.getSession({
        headers: accountWebHeaders(request.headers), query: { disableCookieCache: true, disableRefresh: true },
      });
      if (current?.user.id !== account.id || !current.session.id) throw new AccountAccessError("invalid_session",401,"Sign in again.");
      const code = await issueNativeCode(account.id, current.session.id, authorize.data.challenge);
      const callback = new URL(NATIVE_CALLBACK);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", authorize.data.state);
      response.status(200).json({ callback: callback.href, requestId });
      return;
    }
    const exchange = nativeExchangeInput.safeParse(body);
    if (exchange.success) {
      // Vercel supplies this network header. Missing local addresses share a
      // conservative bucket; arbitrary body identifiers do not reset the budget.
      const network = String(request.headers["x-vercel-forwarded-for"] ?? "unknown").slice(0,100);
      await limitNative(`exchange:${network}`, 20);
      response.status(200).json({ ...await exchangeNativeCode(exchange.data.code, exchange.data.verifier), requestId });
      return;
    }
    if (body && typeof body === "object" && !Array.isArray(body)
      && Object.keys(body).length === 1 && "action" in body && body.action === "logout") {
      const { principal } = await requireNativeSession(request.headers);
      await revokeNativeSession(principal.credentialId, principal.userId);
      response.status(200).json({ ok: true, requestId });
      return;
    }
    throw new AccountAccessError("invalid_request",400,"Choose a supported app sign-in action.");
  } catch (error) { nativeFailure(error, response, requestId); }
}

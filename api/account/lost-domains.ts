import { requireAccount, AccountAccessError } from "../_shared/account-auth.js";
import { createRequestId } from "../_shared/public-api.js";
import { lostDomainsHeaders, lostDomainsFailure, lostDomainsEnabled, parseLostDomainsAction,
  type LostDomainsRequest, type LostDomainsResponse } from "../_shared/lost-domains-http.js";
import { limitLostDomainsAccount } from "../_shared/lost-domains-rate.js";
import { lostDomainsService } from "../_shared/lost-domains-service.js";

export const config = { maxDuration: 30 };

export function createLostDomainsHandler(dependencies: {
  authorize?: typeof requireAccount;
  limit?: typeof limitLostDomainsAccount;
  service?: typeof lostDomainsService;
  enabled?: () => boolean;
} = {}) {
  const authorize = dependencies.authorize ?? requireAccount;
  const limit = dependencies.limit ?? limitLostDomainsAccount;
  const service = dependencies.service ?? lostDomainsService;
  const enabled = dependencies.enabled ?? lostDomainsEnabled;
  return async (request: LostDomainsRequest, response: LostDomainsResponse): Promise<void> => {
    const requestId = createRequestId();
    lostDomainsHeaders(response, requestId);
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ code: "method_not_allowed", requestId });
      return;
    }
    try {
      const account = await authorize(request.headers, { verifiedEmail: true, method: request.method });
      const action = request.method === "POST" ? parseLostDomainsAction(request) : undefined;
      await limit(account.id);
      if (action) {
        // Cancellation stays possible while the operator's kill switch is off.
        if (action.action !== "cancel" && !enabled()) throw new AccountAccessError("engine_disabled", 503, "Lost Domains is paused. The previous report is preserved.");
        if (action.action === "start") await service.start(account.id, action.requestKey);
        else if (action.action === "advance") await service.advance(account.id, action.runId);
        else if (action.action === "refresh_quote") await service.refreshQuote(account.id,action.runId,action.domain,action.requestKey);
        else await service.cancel(account.id, action.runId);
      }
      const snapshot = await service.read(account.id);
      response.status(200).json({ ...snapshot, ...(snapshot.access?{quoteRefreshEnabled:"quoteRefreshEnabled" in snapshot && snapshot.quoteRefreshEnabled===true && enabled()}:{}),enabled: enabled(), accountId: account.id, requestId });
    } catch (error) {
      lostDomainsFailure(error, response, requestId);
    }
  };
}

export default createLostDomainsHandler();

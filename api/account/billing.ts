import { requireAccount } from "../_shared/account-auth.js";
import { accountRequestOrigin } from "../_shared/account-origin.js";
import { createRequestId } from "../_shared/public-api.js";
import { commerceService } from "../_shared/commerce-service.js";
import {
  billingHeaders,
  billingAction,
  billingFailure,
  limitBilling,
  type BillingRequest,
  type BillingResponse,
} from "../_shared/commerce-http.js";

export const config = { maxDuration: 30 };
export function createBillingHandler(
  deps: {
    authorize?: typeof requireAccount;
    service?: typeof commerceService;
    limit?: typeof limitBilling;
    origin?: typeof accountRequestOrigin;
  } = {},
) {
  return async (
    request: BillingRequest,
    response: BillingResponse,
  ): Promise<void> => {
    const requestId = createRequestId();
    billingHeaders(response, requestId);
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ code: "method_not_allowed", requestId });
      return;
    }
    try {
      const account = await (deps.authorize ?? requireAccount)(
        request.headers,
        { verifiedEmail: true, method: request.method },
      );
      await (deps.limit ?? limitBilling)(account.id, request.method);
      const service = deps.service ?? commerceService;
      if (request.method === "GET") {
        response
          .status(200)
          .json({
            ...(await service.read(account.id)),
            accountId: account.id,
            requestId,
          });
        return;
      }
      const action = await billingAction(request),
        origin = (deps.origin ?? accountRequestOrigin)(request.headers);
      const url = await service[action.action](
        account.id,
        action.requestKey,
        origin,
      );
      response.status(200).json({ url, accountId: account.id, requestId });
    } catch (error) {
      billingFailure(error, response, requestId);
    }
  };
}
export default createBillingHandler();

import { createRequestId } from "./_shared/public-api.js";
import { CommerceError } from "./_shared/commerce-config.js";
import { commerceService } from "./_shared/commerce-service.js";
import {
  billingHeaders,
  billingFailure,
  rawWebhookBody,
  type BillingRequest,
  type BillingResponse,
} from "./_shared/commerce-http.js";

export const config = { api: { bodyParser: false }, maxDuration: 30 };
export function createBillingWebhookHandler(
  service: Pick<typeof commerceService, "webhook"> = commerceService,
) {
  return async (
    request: BillingRequest,
    response: BillingResponse,
  ): Promise<void> => {
    const requestId = createRequestId();
    billingHeaders(response, requestId);
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response.status(405).json({ code: "method_not_allowed", requestId });
      return;
    }
    try {
      const signature = request.headers["stripe-signature"];
      if (typeof signature !== "string" || signature.length > 2048)
        throw new CommerceError("invalid_webhook_signature", 400);
      const result = await service.webhook(
        await rawWebhookBody(request),
        signature,
      );
      response.status(200).json({ received: true, ...result, requestId });
    } catch (error) {
      billingFailure(error, response, requestId, true);
    }
  };
}
export default createBillingWebhookHandler();

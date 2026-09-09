import { timingSafeEqual } from "node:crypto";
import { createRequestId } from "../_shared/public-api.js";
import { lostDomainsHeaders, lostDomainsFailure, lostDomainsEnabled,
  type LostDomainsRequest, type LostDomainsResponse } from "../_shared/lost-domains-http.js";
import { lostDomainsService } from "../_shared/lost-domains-service.js";

export const config = { maxDuration: 60 };

export function validLostDomainsCronSecret(header: unknown, secret: unknown): boolean {
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256 || typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createLostDomainsCronHandler(dependencies: {
  service?: typeof lostDomainsService;
  enabled?: () => boolean;
  secret?: () => string | undefined;
  scheduled?: () => boolean;
} = {}) {
  const service = dependencies.service ?? lostDomainsService;
  return async (request: LostDomainsRequest, response: LostDomainsResponse): Promise<void> => {
    const requestId = createRequestId();
    lostDomainsHeaders(response, requestId);
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.status(405).json({ code: "method_not_allowed", requestId }); return;
    }
    if (!validLostDomainsCronSecret(request.headers?.authorization, (dependencies.secret ?? (() => process.env.CRON_SECRET))())) {
      response.status(401).json({ code: "authentication_required", requestId }); return;
    }
    if (!(dependencies.enabled ?? lostDomainsEnabled)()
      || !(dependencies.scheduled ?? (() => process.env.SAJDA_LOST_DOMAINS_CRON_ENABLED === "true"))()) {
      response.status(200).json({ state: "paused", requestId }); return;
    }
    try {
      const result = await service.tick();
      // No customer, source or domain data in the scheduler response/log.
      response.status(200).json({ state: result ? "advanced" : "idle", requestId });
    } catch (error) { lostDomainsFailure(error, response, requestId); }
  };
}

export default createLostDomainsCronHandler();

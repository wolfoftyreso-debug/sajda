import { z } from "zod";
import { tradingScenarioInputSchema, type TradingScenarioInput } from "../../shared/trading-scenarios.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { getAccountMembership } from "../_shared/account-membership.js";
import { createRequestId } from "../_shared/public-api.js";
import { tradingScenariosStore } from "../_shared/trading-scenarios-store.js";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
interface ResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): ResponseLike;
  json(value: unknown): void;
}
const saveInput = z.object({ action: z.literal("save"), scenario: tradingScenarioInputSchema }).strict();
export const config = { maxDuration: 15 };
function body(request: RequestLike): { action: "save"; scenario: TradingScenarioInput } {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const encoded = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 16_384) {
      throw new AccountAccessError("request_too_large", 413, "This scenario is too large to save.");
    }
    return saveInput.parse(JSON.parse(encoded)) as { action: "save"; scenario: TradingScenarioInput };
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Enter valid scenario details and assumptions.");
  }
}
export function createTradingScenariosHandler(deps: {
  authorize?: typeof requireAccount;
  membership?: typeof getAccountMembership;
  store?: typeof tradingScenariosStore;
} = {}) {
  const authorize = deps.authorize ?? requireAccount;
  const membership = deps.membership ?? getAccountMembership;
  const store = deps.store ?? tradingScenariosStore;
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Vary", "Cookie");
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ code: "method_not_allowed", error: "Use GET or POST.", requestId });
      return;
    }
    try {
      // requireAccount verifies real session, initiating account, email and
      // mutation origin. A plan/header/body supplied by a browser grants nothing.
      const account = await authorize(request.headers, { verifiedEmail: true, method: request.method });
      const input = request.method === "POST" ? body(request) : null;
      const access = await membership(account);
      if (access.capabilities.trading !== true) throw new AccountAccessError("trading_required", 403, "An active Trading account is required for the scenario journal.");
      await store.limit(account.id);
      const scenarios = input ? await store.save(account.id, input.scenario) : await store.read(account.id);
      response.status(200).json({ accountId: account.id, requestId, scenarios });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("trading_scenarios_unavailable", 503,
        "Your scenario journal is temporarily unavailable. A save may have completed; retry the same save before making more changes.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "trading_scenarios_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createTradingScenariosHandler();

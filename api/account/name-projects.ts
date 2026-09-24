import { z } from "zod";
import { nameProjectInputSchema } from "../../shared/name-projects.js";
import { AccountAccessError, requireAccount } from "../_shared/account-auth.js";
import { nameProjectsStore } from "../_shared/name-projects-store.js";
import { createRequestId } from "../_shared/public-api.js";

interface RequestLike { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; body?: unknown }
interface ResponseLike { setHeader(name: string, value: string | number): void; status(code: number): ResponseLike; json(value: unknown): void }
const saveSchema = z.object({ action: z.literal("save"), project: nameProjectInputSchema }).strict();
export const config = { maxDuration: 15 };
function body(request: RequestLike) {
  if (typeof request.headers?.["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"])) {
    throw new AccountAccessError("unsupported_media_type", 415, "Send an application/json request.");
  }
  try {
    const supplied = request.body;
    const encoded = typeof supplied === "string" ? supplied : JSON.stringify(supplied);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 32768) throw new AccountAccessError("request_too_large", 413, "This project request is too large.");
    return saveSchema.parse(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof AccountAccessError) throw error;
    throw new AccountAccessError("invalid_request", 400, "Enter valid project details and saved-domain references.");
  }
}
/** Foundation only: not a paid entitlement, public connector tool or live offer. */
export function createNameProjectsHandler(deps: {
  authorize?: typeof requireAccount;
  store?: typeof nameProjectsStore;
  enabled?: () => boolean;
} = {}) {
  return async (request: RequestLike, response: ResponseLike): Promise<void> => {
    const requestId = createRequestId();
    for (const [name, value] of Object.entries({ "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Cookie, Origin", "X-Request-Id": requestId,
      "X-Robots-Tag": "noindex, nofollow" })) response.setHeader(name, value);
    if (!(deps.enabled ?? (() => process.env.SAJDA_NAME_PROJECTS_ENABLED === "true"))()) {
      response.status(404).json({ code: "not_available", error: "Name projects are not available in this environment.", requestId }); return;
    }
    if (!request.method || !["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ code: "method_not_allowed", error: "Use GET or POST.", requestId }); return;
    }
    try {
      const account = await (deps.authorize ?? requireAccount)(request.headers, { verifiedEmail: true, method: request.method });
      if (Object.keys(request.query ?? {}).length) throw new AccountAccessError("invalid_request", 400, "This route does not accept query parameters.");
      const input = request.method === "POST" ? body(request) : null;
      const store = deps.store ?? nameProjectsStore;
      await store.limit(account.id);
      const projects = input ? await store.save(account.id, input.project) : await store.read(account.id);
      response.status(200).json({ accountId: account.id, projects, requestId });
    } catch (error) {
      const failure = error instanceof AccountAccessError ? error : new AccountAccessError("name_projects_unavailable", 503,
        "Name projects are temporarily unavailable. A save may have completed; retry the same save before editing again.");
      if (failure.status === 429) response.setHeader("Retry-After", 60);
      if (failure.status >= 500) console.error(JSON.stringify({ event: "name_projects_failed", requestId, code: failure.code }));
      response.status(failure.status).json({ code: failure.code, error: failure.message, requestId });
    }
  };
}
export default createNameProjectsHandler();

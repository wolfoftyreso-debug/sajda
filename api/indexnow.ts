import { timingSafeEqual } from "node:crypto";
import { submitIndexNow } from "./_shared/seo-indexnow.mjs";

interface VercelRequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelResponseLike {
  setHeader(name: string, value: string | number): void;
  status(code: number): VercelResponseLike;
  json(payload: unknown): void;
}

function setHeaders(response: VercelResponseLike): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export function validIndexNowSubmitSecret(
  headers: VercelRequestLike["headers"],
  secret: unknown,
): boolean {
  if (typeof secret !== "string" || !/^[\x21-\x7E]{32,256}$/u.test(secret)) return false;
  const values = Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() === "authorization");
  if (values.length !== 1 || typeof values[0][1] !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(values[0][1]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createIndexNowHandler(dependencies: {
  secret?: () => string | undefined;
  submit?: typeof submitIndexNow;
} = {}) {
  const secret = dependencies.secret ?? (() => process.env.SAJDA_INDEXNOW_SUBMIT_SECRET);
  const submit = dependencies.submit ?? submitIndexNow;
  return async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
    setHeaders(response);
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response.status(405).json({ submitted: false, reason: "method_not_allowed" });
      return;
    }
    if (!validIndexNowSubmitSecret(request.headers, secret())) {
      response.status(401).json({ submitted: false, reason: "authentication_required" });
      return;
    }
    try {
      const result = await submit();
      response.status(result.submitted ? 200 : 409).json({
        submitted: result.submitted,
        reason: result.reason,
      });
    } catch {
      response.status(503).json({ submitted: false, reason: "unavailable" });
    }
  }
}

export default createIndexNowHandler();

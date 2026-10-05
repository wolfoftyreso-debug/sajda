import { submitIndexNow } from "../scripts/seo-indexnow.mjs";

interface VercelRequestLike {
  method?: string;
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

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  setHeaders(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ submitted: false, reason: "method_not_allowed" });
    return;
  }
  const result = await submitIndexNow();
  response.status(result.submitted ? 200 : 409).json({
    submitted: result.submitted,
    reason: result.reason,
  });
}

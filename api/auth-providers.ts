import { socialAuthProviderStatus } from "./_shared/social-auth.js";
import { createRequestId } from "./_shared/public-api.js";

interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(value: unknown): void;
}

export default function handler(request: { method?: string }, response: Response): void {
  const requestId = createRequestId();
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("X-Request-Id", requestId);
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ code: "method_not_allowed", error: "Use GET.", requestId });
    return;
  }
  response.status(200).json({ providers: socialAuthProviderStatus(), requestId });
}

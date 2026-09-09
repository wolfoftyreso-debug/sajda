const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"];

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || getAllowedOrigins().includes(origin);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-job-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function rejectDisallowedOrigin(request: Request): Response | null {
  return isAllowedOrigin(request) ? null : json(request, { error: "Origin is not allowed" }, 403);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Expected an application/json request body");
  }

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a JSON object");
  }

  return body as Record<string, unknown>;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

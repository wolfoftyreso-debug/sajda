import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { json } from "./http.ts";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export type RequestIdentity =
  | { kind: "user"; user: AuthenticatedUser }
  | { kind: "job" };

function getRequiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function secureEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

export async function requireIdentity(
  request: Request,
  options: { allowJobSecret?: boolean } = {},
): Promise<{ identity: RequestIdentity } | { response: Response }> {
  if (options.allowJobSecret) {
    const configuredSecret = Deno.env.get("JOB_SECRET");
    const suppliedSecret = request.headers.get("x-job-secret");
    if (configuredSecret && suppliedSecret && secureEquals(suppliedSecret, configuredSecret)) {
      return { identity: { kind: "job" } };
    }
  }

  const token = getBearerToken(request);
  if (!token) return { response: json(request, { error: "Authentication is required" }, 401) };

  try {
    const supabase = createClient(
      getRequiredEnvironment("SUPABASE_URL"),
      getRequiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) return { response: json(request, { error: "Invalid or expired user session" }, 401) };
    return { identity: { kind: "user", user: { id: data.user.id, email: data.user.email } } };
  } catch (error) {
    console.error("Authentication configuration error", error);
    return { response: json(request, { error: "Authentication service is unavailable" }, 503) };
  }
}

export function getServiceClient() {
  return createClient(
    getRequiredEnvironment("SUPABASE_URL"),
    getRequiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function consumeRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc("consume_function_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("Rate limit lookup failed", error);
    // Fail closed: resource-intensive endpoints should not become unbounded if
    // the shared limiter is unavailable or its migration was not applied.
    return false;
  }

  return data === true;
}

export function getJobSecret(): string {
  return getRequiredEnvironment("JOB_SECRET");
}

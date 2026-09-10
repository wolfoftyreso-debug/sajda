import { getVercelOidcToken } from "@vercel/oidc";
import { reserveAiAllowance } from "./ai-allowance.js";
import { createRequestId } from "./public-api.js";
import { hasCurrentAiConsent } from "../../shared/ai-consent.js";

// Server-only. This fixed endpoint and model allowlist cannot be overridden by
// caller input. Provider failures never trigger a direct-provider retry.
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";
const ALLOWED_MODELS = new Set(["google/gemini-2.5-flash-lite", "google/gemini-3.1-flash-lite"]);
const MAX_RESPONSE_BYTES = 32_768;
const SAFE_ERROR_CATEGORIES = new Set([
  "access_denied", "no_providers_available", "permission_denied", "insufficient_quota",
  "rate_limit_exceeded", "model_not_found", "invalid_request_error",
]);
const TASK_LIMITS = {
  brief: { modelVariable: "AI_GATEWAY_BRIEF_MODEL", tokens: 600, timeout: 4_000 },
  review: { modelVariable: "AI_GATEWAY_REVIEW_MODEL", tokens: 1_400, timeout: 5_500 },
  naming: { modelVariable: "AI_GATEWAY_NAMING_MODEL", tokens: 1_800, timeout: 6_500 },
} as const;

export interface AiRequestContext {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface GatewayRequest<T> {
  consent?: unknown;
  task: keyof typeof TASK_LIMITS;
  request: AiRequestContext;
  input: string;
  instructions: string;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T | undefined;
}

interface GatewayDependencies {
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  token: () => Promise<string>;
  reserve: typeof reserveAiAllowance;
  log: (record: Record<string, string | number>) => void;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Provider strings are untrusted: only these fixed categories may enter logs. */
function gatewayErrorCategory(value: unknown): string {
  const response = object(value);
  const error = object(response?.error);
  for (const candidate of [error?.type, error?.code, response?.type]) {
    if (typeof candidate !== "string" || candidate.length > 64) continue;
    const category = candidate.trim().toLowerCase().replaceAll("-", "_");
    if (SAFE_ERROR_CATEGORIES.has(category)) return category;
  }
  return "unknown";
}

/** Only complete assistant output is data; refusals/tool/reasoning text isn't. */
export function completedGatewayText(value: unknown): string | undefined {
  const response = object(value);
  if (response?.status !== "completed" || response.error || response.incomplete_details || !Array.isArray(response.output)) return undefined;
  const text: string[] = [];
  for (const raw of response.output) {
    const item = object(raw);
    if (item?.type === "reasoning") continue;
    if (item?.type !== "message" || item.role !== "assistant" || item.status !== "completed" || !Array.isArray(item.content)) return undefined;
    for (const rawPart of item.content) {
      const part = object(rawPart);
      if (part?.type !== "output_text" || typeof part.text !== "string") return undefined;
      text.push(part.text);
    }
  }
  const result = text.join("");
  return result.trim() && Buffer.byteLength(result, "utf8") <= 12_000 ? result : undefined;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("invalid_response");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function currentToken(deps: GatewayDependencies): Promise<string | undefined> {
  // A deployed project must stay attributed to its own OIDC budget. An
  // accidentally added key must not bypass that budget or select another team.
  const key = !deps.env.VERCEL && deps.env.AI_GATEWAY_API_KEY?.trim();
  if (key) return key;
  // Request-time refresh supports warm Vercel functions. Never read a browser
  // Authorization header or forward the customer's session to the Gateway.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deps.token(),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1_500); }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Dependency injection is for tests, not an HTTP-configurable gateway. */
export function createGatewayRequester(deps: GatewayDependencies) {
  return async function requestGatewayJson<T>(options: GatewayRequest<T>): Promise<T | undefined> {
    // This is the final transport boundary, not merely a UI setting. Refuse
    // even token/quota lookup until explicit current permission is present.
    if (!hasCurrentAiConsent(options.consent)) return undefined;
    const limits = TASK_LIMITS[options.task];
    const model = deps.env[limits.modelVariable]?.trim();
    if (deps.env.AI_GATEWAY_ENABLED !== "true" || !model || !ALLOWED_MODELS.has(model)) return undefined;
    if (!options.input.trim() || Buffer.byteLength(options.input, "utf8") > 16_000) return undefined;
    const requestId = createRequestId();
    const started = Date.now();
    let status = "authentication_unavailable";
    let httpStatus = 0;
    let errorCategory: string | undefined;
    let release: (() => Promise<void>) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = await currentToken(deps);
      if (!token) return undefined;
      status = "allowance_unavailable";
      const allowance = await deps.reserve(options.request.headers, { remoteAddress: options.request.socket?.remoteAddress });
      if (!allowance.allowed) { status = "allowance_denied"; return undefined; }
      release = allowance.release;
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), limits.timeout);
      status = "provider_unavailable";
      const response = await deps.fetch(GATEWAY_URL, {
        method: "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model, store: false, stream: false, max_output_tokens: limits.tokens,
          instructions: options.instructions, input: options.input,
          text: { format: { type: "json_schema", name: options.schemaName, strict: true, schema: options.schema } },
          // Pro per-request ZDR: if no compliant provider is available we use
          // local analysis, never retry with weaker privacy settings or BYOK.
          providerOptions: { gateway: { only: ["google", "vertex"], disallowPromptTraining: true, zeroDataRetention: true, tags: ["sajda", options.task] } },
        }),
      });
      httpStatus = response.status;
      if (!response.ok) {
        errorCategory = "unknown";
        try { errorCategory = gatewayErrorCategory(await boundedJson(response)); }
        catch { /* Malformed/oversized errors must not expose provider details. */ }
        finally { await response.body?.cancel().catch(() => undefined); }
        return undefined;
      }
      status = "invalid_output";
      const text = completedGatewayText(await boundedJson(response));
      if (!text) return undefined;
      const result = options.parse(JSON.parse(text));
      if (result === undefined) return undefined;
      status = "completed";
      return result;
    } catch {
      // Neither error messages nor provider payloads are safe to log: they can
      // contain the private brief, candidate domains or authorization material.
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
      if (release) await release().catch(() => undefined);
      deps.log({ event: "sajda_ai_gateway", requestId, task: options.task, model, status, httpStatus,
        ...(errorCategory ? { errorCategory } : {}), durationMs: Date.now() - started });
    }
  };
}

export const requestGatewayJson = createGatewayRequester({
  env: process.env,
  fetch: (input, init) => fetch(input, init),
  token: () => getVercelOidcToken(),
  reserve: reserveAiAllowance,
  log: (record) => console.info(JSON.stringify(record)),
});

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AccountSession } from "@/integrations/neon/account-types";
export const nativeAvailable = Capacitor.isNativePlatform();
interface NativeBridge {
  signIn(): Promise<unknown>;
  signOut(): Promise<unknown>;
  session(): Promise<unknown>;
  request(options: { path: string; method: string; body?: string; id: string }): Promise<unknown>;
  cancel(options: { id: string }): Promise<void>;
}
const bridge = registerPlugin<NativeBridge>("SajdaNative");
let authGeneration = 0;
let signInPending = false;
let signOutPending = false;
const invalidResponse = () => new Error("The app returned an invalid response. Try again.");
const staleAccount = () => new Error("The app account changed. Try again.");
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
}
/** Only public, verified identity crosses the bridge. Unknown fields never escape. */
export function sanitizeNativeSession(value: unknown, now = Date.now()): AccountSession | null {
  if (value === null) return null;
  if (!record(value) || !record(value.user)) throw invalidResponse();
  const { user, expires_at: expiresAt } = value;
  if (typeof user.id !== "string" || !user.id.trim() || user.id.length > 200 || user.id !== user.id.trim() ||
      typeof user.email !== "string" || !user.email.trim() || user.email.length > 320 || user.email_verified !== true ||
      !timestamp(user.created_at) || (user.last_sign_in_at !== undefined && user.last_sign_in_at !== null && !timestamp(user.last_sign_in_at)) ||
      typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now) throw invalidResponse();
  return { user: { id: user.id, email: user.email, email_verified: true, created_at: user.created_at,
    ...(typeof user.last_sign_in_at === "string" ? { last_sign_in_at: user.last_sign_in_at } : {}) }, expires_at: expiresAt };
}
function checkAbort(signal?: AbortSignal) {
  // iOS 15 does not universally provide AbortSignal.throwIfAborted().
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}
function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}
function responseFromBridge(value: unknown) {
  if (!record(value) || typeof value.status !== "number" || !Number.isInteger(value.status) || value.status < 200 || value.status > 599 ||
      typeof value.body !== "string" || value.body.length > 4_000_000 || new TextEncoder().encode(value.body).length > 4_000_000) throw invalidResponse();
  const headers: Record<string, string> = {};
  if (value.headers !== undefined) {
    if (!record(value.headers)) throw invalidResponse();
    for (const [name, content] of Object.entries(value.headers)) {
      if (!["content-type", "allow", "access-control-allow-methods", "retry-after", "x-request-id"].includes(name.toLowerCase())) continue;
      if (typeof content !== "string" || content.length > 4096 || /[\r\n]/u.test(content)) throw invalidResponse();
      headers[name.toLowerCase()] = content;
    }
  }
  headers["content-type"] ??= "application/json";
  return new Response([204, 205, 304].includes(value.status) ? null : value.body, { status: value.status, headers });
}
export async function nativeSignIn() {
  if (!nativeAvailable) throw new Error("App sign-in requires the iOS app.");
  if (signInPending || signOutPending) throw new Error("An account change is already in progress.");
  signInPending = true;
  const generation = ++authGeneration;
  try {
    const result = await bridge.signIn();
    if (generation !== authGeneration) throw staleAccount();
    if (!record(result) || result.ok !== true) throw invalidResponse();
    return { ok: true };
  } finally { signInPending = false; }
}
export async function nativeSignOut() {
  if (!nativeAvailable) throw new Error("App sign-out requires the iOS app.");
  if (signOutPending) throw new Error("Sign-out is already in progress.");
  signOutPending = true;
  const generation = ++authGeneration;
  try {
    const result = await bridge.signOut();
    if (generation !== authGeneration) throw staleAccount();
    if (!record(result) || result.ok !== true) throw invalidResponse();
    return { ok: true };
  } finally { signOutPending = false; }
}
export async function readNativeSession() {
  if (!nativeAvailable) return null;
  const generation = authGeneration;
  const result = await bridge.session();
  if (generation !== authGeneration) throw staleAccount();
  if (!record(result)) throw invalidResponse();
  return sanitizeNativeSession(result.session);
}
export async function nativeRequest(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  if (!nativeAvailable) throw new Error("This operation requires the iOS app.");
  checkAbort(signal);
  // Serialization can invoke user code; finish it before registering cancellation.
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  checkAbort(signal);
  const generation = authGeneration;
  const privateRequest = path.split("?", 1)[0] === "/api/native/account";
  const id = requestId();
  let abort: (()=>void) | undefined;
  const aborted = new Promise<never>((_,reject) => {
    abort = () => {
      void bridge.cancel({id}).catch(()=>undefined);
      reject(new DOMException("Request cancelled","AbortError"));
    };
    signal?.addEventListener("abort",abort,{once:true});
  });
  try {
    checkAbort(signal);
    const result = await Promise.race([bridge.request({path,method,body:serializedBody,id}),aborted]);
    checkAbort(signal);
    if (privateRequest && generation !== authGeneration) throw staleAccount();
    return responseFromBridge(result);
  } finally { if (abort) signal?.removeEventListener("abort",abort); }
}

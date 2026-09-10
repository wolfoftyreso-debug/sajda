import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AccountSession } from "@/integrations/neon/account-types";
export const nativeAvailable = Capacitor.isNativePlatform();
interface NativeBridge {
  signIn(): Promise<unknown>;
  signOut(): Promise<unknown>;
  session(): Promise<unknown>;
  request(options: { path: string; method: string; body?: string; id: string }): Promise<unknown>;
  cancel(options: { id: string }): Promise<void>;
  shareCsv(options: { filename: string; csv: string }): Promise<unknown>;
  shareFile(options: { filename: string; content: string }): Promise<unknown>;
  commerceCatalog(options: { accountId: string }): Promise<unknown>;
  commercePurchase(options: { accountId: string; productId: string }): Promise<unknown>;
  commerceRestore(options: { accountId: string }): Promise<unknown>;
  commerceManage(): Promise<unknown>;
  forgetDeletedAccount(options: { accountId: string }): Promise<unknown>;
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
/** Export only generated CSV through the OS share sheet, never arbitrary files. */
export async function nativeShareCsv(filename: string, csv: string): Promise<{ completed: boolean }> {
  if (!nativeAvailable) throw new Error("CSV sharing requires the iOS app.");
  if (!/^sajda-research-[a-zA-Z0-9-]{1,100}\.csv$/u.test(filename)
    || typeof csv !== "string" || !csv.length || csv.length > 4_000_000
    || new TextEncoder().encode(csv).length > 4_000_000) throw invalidResponse();
  const generation = authGeneration;
  const result = await bridge.shareCsv({ filename, csv });
  if (generation !== authGeneration) throw staleAccount();
  if (!record(result) || typeof result.completed !== "boolean") throw invalidResponse();
  return { completed: result.completed };
}
/** The fixed generated-artifact allowlist is repeated at the native boundary. */
export async function nativeShareFile(filename: string, content: string): Promise<{ completed: boolean }> {
  if (!nativeAvailable) throw new Error("File sharing requires the iOS app.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\.(?:csv|svg|html)$/u.test(filename)
    || typeof content !== "string" || !content.length || content.length > 4_000_000
    || new TextEncoder().encode(content).length > 4_000_000) throw invalidResponse();
  const result = await bridge.shareFile({ filename, content });
  if (!record(result) || typeof result.completed !== "boolean") throw invalidResponse();
  return { completed: result.completed };
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

export interface NativeStoreProduct { id: string; name: string; price: string; plan: "basic" | "premium" | "trading" }
export interface NativeStoreCatalog { enabled: boolean; purchasesEnabled: boolean; accountId: string; products: NativeStoreProduct[] }
let commercePending = false;
async function commerceCall(accountId: string, perform: () => Promise<unknown>) {
  if (!nativeAvailable) throw new Error("App Store actions require the iPhone app.");
  if (!accountId || accountId.length > 200 || signInPending || signOutPending || commercePending) throw staleAccount();
  commercePending = true;
  const generation = authGeneration;
  try {
    const value = await perform();
    if (generation !== authGeneration) throw staleAccount();
    if (!record(value) || value.accountId !== accountId) throw invalidResponse();
    return value;
  } finally { commercePending = false; }
}
export function sanitizeNativeStoreCatalog(value: unknown, accountId: string): NativeStoreCatalog {
  if (!record(value) || value.accountId !== accountId || typeof value.enabled !== "boolean"
    || typeof value.purchasesEnabled !== "boolean" || !Array.isArray(value.products) || value.products.length > 3
    || !value.enabled && (value.products.length > 0 || value.purchasesEnabled)) throw invalidResponse();
  const products = value.products.map(item => {
    if (!record(item) || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$/.test(item.id)
      || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200
      || typeof item.price !== "string" || !item.price.trim() || item.price.length > 80
      || !["basic","premium","trading"].includes(String(item.plan))) throw invalidResponse();
    return { id:item.id,name:item.name,price:item.price,plan:item.plan as NativeStoreProduct["plan"] };
  });
  if (new Set(products.map(item=>item.id)).size !== products.length
    || new Set(products.map(item=>item.plan)).size !== products.length || value.enabled && !products.length) throw invalidResponse();
  return { enabled:value.enabled,purchasesEnabled:value.purchasesEnabled,accountId,products };
}
export async function nativeCommerceCatalog(accountId: string) {
  return sanitizeNativeStoreCatalog(await commerceCall(accountId,()=>bridge.commerceCatalog({accountId})),accountId);
}
export async function nativeCommercePurchase(accountId: string, productId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$/.test(productId)) throw invalidResponse();
  const value=await commerceCall(accountId,()=>bridge.commercePurchase({accountId,productId}));
  if (!["verified","pending","cancelled","no_active"].includes(String(value.state))) throw invalidResponse();
  return value.state as "verified"|"pending"|"cancelled"|"no_active";
}
export async function nativeCommerceRestore(accountId:string) {
  const value=await commerceCall(accountId,()=>bridge.commerceRestore({accountId}));
  if(value.state!=="verified"&&value.state!=="no_active") throw invalidResponse();
  return value.state;
}
export async function nativeCommerceManage() {
  if(!nativeAvailable || commercePending) throw invalidResponse();
  commercePending=true;
  try { const value=await bridge.commerceManage();if(!record(value)||value.ok!==true)throw invalidResponse(); }
  finally { commercePending=false; }
}
/** Use only after the account deletion endpoint confirmed removal. Native code
 * independently fences the previously server-verified owner and Keychain token. */
export async function forgetDeletedAccount(accountId:string) {
  if(!nativeAvailable || !accountId || accountId.length>200 || signInPending || signOutPending)throw staleAccount();
  signOutPending=true;
  const generation=++authGeneration;
  try {
    const value=await bridge.forgetDeletedAccount({accountId});
    if(generation!==authGeneration)throw staleAccount();
    if(!record(value)||value.ok!==true)throw invalidResponse();
  }finally{signOutPending=false;}
}

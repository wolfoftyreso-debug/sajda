import { isNativeApp } from "./appSurface";
import { nativeRequest } from "./nativeTransport";
const allowed = new Map([
  ["/api/domain-search",["POST"]],["/api/deep-review",["POST"]],
  ["/api/reference-fx",["GET"]],["/api/fact-signals",["GET"]],
  ["/api/contact",["POST"]],["/api/health",["GET"]],["/api/openapi",["GET"]],
  ["/api/v1/public/domains",["POST","OPTIONS"]],
]);
export function nativePublicPath(input: string | URL, method = "GET") {
  if (!/^\/api\/[a-z0-9/-]+(?:\?[^#\\]*)?$/.test(String(input)) || String(input).includes("/.")) {
    throw new Error("Native product requests must use a canonical relative API path.");
  }
  const url = new URL(String(input),"https://sajda.invalid");
  if (url.origin !== "https://sajda.invalid" || url.hash || url.username || url.password
    || !allowed.get(url.pathname)?.includes(method)) throw new Error("Unsupported native product request.");
  return url.pathname + url.search;
}
/** Explicit transport selection. Never monkey-patch fetch or forward secrets. */
export async function productFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isNativeApp) return fetch(input,init);
  if (input instanceof Request) throw new Error("Native product requests must use a relative API path.");
  const method = init?.method ?? "GET";
  const path = nativePublicPath(input,method);
  if (init?.body !== undefined && init.body !== null && typeof init.body !== "string") throw new Error("Native requests require JSON.");
  return nativeRequest(path,method,init?.body ? JSON.parse(String(init.body)):undefined,init?.signal??undefined);
}

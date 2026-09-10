import { createPrivateKey } from "node:crypto";
import { Environment } from "@apple/app-store-server-library";
import { z } from "zod";
import { AccountAccessError } from "./account-error.js";

export type NativePaidPlan = "basic" | "premium" | "trading";
export interface NativeCommerceConfig {
  namespace: "development" | "preview" | "production";
  environment: Environment.SANDBOX | Environment.PRODUCTION;
  bundleId: string;
  appAppleId: number;
  keyId: string;
  issuerId: string;
  privateKey: string;
  products: Record<string, NativePaidPlan>;
  purchasesEnabled: boolean;
}
export const APP_BUNDLE_ID = "com.hypbit.sajda";
export const nativeCommerceError = (code = "app_store_unavailable", status = 503) =>
  new AccountAccessError(code, status, "App Store access could not be verified. No purchase access was changed. Try again.");
const productMap = z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$/), z.enum(["basic", "premium", "trading"]));

/** Off by default. Local StoreKit/Xcode receipts never reach paid entitlements. */
export function nativeCommerceConfig(env: NodeJS.ProcessEnv = process.env): NativeCommerceConfig | null {
  if (env.SAJDA_APP_STORE_ENABLED !== "true") return null;
  const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
  const environment = env.APP_STORE_ENVIRONMENT;
  const appAppleId = Number(env.APP_STORE_APP_ID);
  if (!["development", "preview", "production"].includes(namespace ?? "")
    || ![Environment.SANDBOX, Environment.PRODUCTION].includes(environment as Environment.SANDBOX)
    || (namespace === "production") !== (environment === Environment.PRODUCTION)
    || (namespace === "production" && env.SAJDA_APP_STORE_LIVE_ENABLED !== "true")
    || !Number.isSafeInteger(appAppleId) || appAppleId <= 0
    || !/^[A-Z0-9]{10}$/.test(env.APP_STORE_KEY_ID ?? "")
    || !z.string().uuid().safeParse(env.APP_STORE_ISSUER_ID).success) throw nativeCommerceError("app_store_not_configured");
  let products: Record<string, NativePaidPlan>;
  const privateKey = env.APP_STORE_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  try {
    products = productMap.parse(JSON.parse(env.APP_STORE_PRODUCTS_JSON ?? ""));
    if (!Object.keys(products).length || Object.keys(products).length > 3
      || new Set(Object.values(products)).size !== Object.keys(products).length) throw new Error();
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error();
  } catch { throw nativeCommerceError("app_store_not_configured"); }
  return { namespace: namespace as NativeCommerceConfig["namespace"], environment: environment as NativeCommerceConfig["environment"],
    appAppleId, bundleId: APP_BUNDLE_ID, keyId: env.APP_STORE_KEY_ID!, issuerId: env.APP_STORE_ISSUER_ID!,
    privateKey, products, purchasesEnabled: env.SAJDA_APP_STORE_PURCHASES_ENABLED === "true" };
}

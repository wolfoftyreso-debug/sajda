export class CommerceError extends Error {
  constructor(
    readonly code: string,
    readonly status = 503,
  ) {
    super(code);
    this.name = "CommerceError";
  }
}
export interface CommerceConfig {
  namespace: "development" | "preview" | "production";
  mode: "test" | "live";
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  portalConfigurationId: string;
  checkoutEnabled: boolean;
}
export function commerceConfig(
  env: NodeJS.ProcessEnv = process.env,
): CommerceConfig {
  const namespace = env.VERCEL ? env.VERCEL_ENV : "development";
  const mode = env.STRIPE_MODE ?? "test";
  if (
    !["development", "preview", "production"].includes(namespace ?? "") ||
    !["test", "live"].includes(mode)
  )
    throw new CommerceError("billing_not_configured");
  // Production never accepts test-mode keys/grants; live requires two deliberate choices.
  if (
    (namespace === "production") !== (mode === "live") ||
    (mode === "live" && env.STRIPE_LIVE_ENABLED !== "true")
  )
    throw new CommerceError("billing_not_configured");
  const secretKey = env.STRIPE_SECRET_KEY ?? "",
    webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? "",
    priceId = env.STRIPE_PLUS_PRICE_ID ?? "",
    portalConfigurationId = env.STRIPE_PORTAL_CONFIGURATION_ID ?? "";
  if (
    !new RegExp(`^sk_${mode}_[A-Za-z0-9]{12,}$`, "u").test(secretKey) ||
    !/^whsec_[A-Za-z0-9]{12,}$/u.test(webhookSecret) ||
    !/^price_[A-Za-z0-9]+$/u.test(priceId) ||
    !/^bpc_[A-Za-z0-9]+$/u.test(portalConfigurationId)
  )
    throw new CommerceError("billing_not_configured");
  return {
    namespace: namespace as CommerceConfig["namespace"],
    mode: mode as CommerceConfig["mode"],
    secretKey,
    webhookSecret,
    priceId,
    portalConfigurationId,
    checkoutEnabled: env.STRIPE_CHECKOUT_ENABLED === "true",
  };
}
export const commerceId = (value: unknown, prefix: string): string => {
  const id =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? String(value.id)
        : "";
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`, "u").test(id))
    throw new CommerceError("invalid_provider_response");
  return id;
};
export function safeStripeUrl(
  value: unknown,
  kind: "checkout" | "portal",
): string {
  try {
    const url = new URL(String(value));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname !==
        (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com")
    )
      throw new Error();
    return url.href;
  } catch {
    throw new CommerceError("invalid_provider_response");
  }
}

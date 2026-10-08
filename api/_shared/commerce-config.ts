import { PAID_PLAN_ORDER, type PaidPlanId } from "../../shared/plans.js";

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
  /** @deprecated Trading alias kept while existing test fixtures migrate. */
  priceId: string;
  priceIds?: Record<PaidPlanId, string>;
  portalConfigurationId: string;
  checkoutEnabled: boolean;
  checkoutPlans?: Record<PaidPlanId, boolean>;
  premiumIntroEnabled?: boolean;
  premiumIntroCouponId?: string;
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
    tradingPriceId = env.STRIPE_TRADING_PRICE_ID ?? env.STRIPE_PLUS_PRICE_ID ?? "",
    configuredPriceIds = {
      basic: env.STRIPE_BASIC_PRICE_ID ?? "",
      premium: env.STRIPE_PREMIUM_PRICE_ID ?? "",
      trading: tradingPriceId,
    },
    portalConfigurationId = env.STRIPE_PORTAL_CONFIGURATION_ID ?? "";
  const multiPlanConfigured = Boolean(configuredPriceIds.basic || configuredPriceIds.premium || env.STRIPE_TRADING_PRICE_ID);
  const priceIds = multiPlanConfigured ? configuredPriceIds : undefined;
  if (
    !new RegExp(`^sk_${mode}_[A-Za-z0-9]{12,}$`, "u").test(secretKey) ||
    !/^whsec_[A-Za-z0-9]{12,}$/u.test(webhookSecret) ||
    !/^price_[A-Za-z0-9]+$/u.test(tradingPriceId) ||
    (priceIds !== undefined && (PAID_PLAN_ORDER.some(plan => !/^price_[A-Za-z0-9]+$/u.test(priceIds[plan])) ||
      new Set(Object.values(priceIds)).size !== PAID_PLAN_ORDER.length)) ||
    !/^bpc_[A-Za-z0-9]+$/u.test(portalConfigurationId)
  )
    throw new CommerceError("billing_not_configured");
  return {
    namespace: namespace as CommerceConfig["namespace"],
    mode: mode as CommerceConfig["mode"],
    secretKey,
    webhookSecret,
    priceId: tradingPriceId,
    priceIds,
    portalConfigurationId,
    checkoutEnabled: env.STRIPE_CHECKOUT_ENABLED === "true",
    premiumIntroEnabled: env.STRIPE_PREMIUM_INTRO_ENABLED === "true",
    premiumIntroCouponId: /^[A-Za-z0-9_-]{1,255}$/u.test(env.STRIPE_PREMIUM_INTRO_COUPON_ID ?? "") ? env.STRIPE_PREMIUM_INTRO_COUPON_ID : undefined,
    checkoutPlans: {
      basic: env.STRIPE_BASIC_CHECKOUT_ENABLED === "true",
      premium: env.STRIPE_PREMIUM_CHECKOUT_ENABLED === "true",
      trading: env.STRIPE_CHECKOUT_ENABLED === "true",
    },
  };
}

export function commercePriceId(config: Pick<CommerceConfig, "priceId"> & Partial<Pick<CommerceConfig, "priceIds">>, plan: PaidPlanId): string {
  const value = config.priceIds?.[plan] ?? (plan === "trading" ? config.priceId : "");
  if (!/^price_[A-Za-z0-9]+$/u.test(value)) throw new CommerceError("billing_price_unavailable");
  return value;
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

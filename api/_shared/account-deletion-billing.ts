import { createHash } from "node:crypto";
import Stripe from "stripe";
import { AccountAccessError } from "./account-error.js";
import { STRIPE_API_VERSION } from "./commerce-provider.js";

export interface DeletionCustomer { namespace: string; customerId: string; live: boolean }
export interface DeletionStripeClient {
  customers: Pick<Stripe["customers"], "retrieve" | "del">;
}

/** No prices, checkout-enabled flag or portal configuration can prevent account
 * removal. Only the correct environment-scoped Stripe credential is needed. */
export function createDeletionBilling(deps: {
  environment?: () => NodeJS.ProcessEnv;
  client?: (key: string) => DeletionStripeClient;
} = {}) {
  return async (owner: string, customers: DeletionCustomer[]): Promise<"none" | "canceled"> => {
    if (!customers.length) return "none";
    const env = (deps.environment ?? (() => process.env))();
    const namespace = env.VERCEL_ENV || "development";
    const live = namespace === "production";
    const key = env.STRIPE_SECRET_KEY ?? "";
    if (!["development", "preview", "production"].includes(namespace)
      || !new RegExp(`^sk_${live ? "live" : "test"}_[A-Za-z0-9]{12,}$`, "u").test(key)
      || customers.length > 3 || customers.some(row => row.live !== live
        || (row.namespace === "production") !== row.live || !/^cus_[A-Za-z0-9]+$/u.test(row.customerId))) {
      throw new AccountAccessError("deletion_billing_unavailable", 503, "Billing could not be safely closed. No account data was deleted. Try again.");
    }
    const stripe = (deps.client ?? (secret => new Stripe(secret, {
      apiVersion: STRIPE_API_VERSION, timeout: 5000, maxNetworkRetries: 0,
    })))(key);
    try {
      // Validate every present customer before making the first irreversible
      // provider mutation. Stored IDs alone are not sufficient ownership proof.
      const pending: string[] = [];
      for (const row of customers) {
        const customer = await stripe.customers.retrieve(row.customerId);
        if (customer.id !== row.customerId) throw new Error("Unexpected customer");
        if (customer.deleted === true) continue; // retry after uncertain DB commit
        const ownerHash = createHash("sha256").update(`${row.namespace}:${owner}`).digest("hex");
        if (customer.livemode !== row.live || customer.metadata.sajda_namespace !== row.namespace
          || customer.metadata.sajda_owner_hash !== ownerHash) throw new Error("Unexpected owner");
        pending.push(row.customerId);
      }
      for (const id of pending) {
        const result = await stripe.customers.del(id);
        if (result.id !== id || result.deleted !== true) throw new Error("Deletion not confirmed");
      }
      // Stripe deletes payment details, cancels active subscriptions and prevents
      // new operations. Its billing history is retained by Stripe, not copied here.
      return "canceled";
    } catch {
      throw new AccountAccessError("deletion_billing_unavailable", 503,
        "Account deletion could not finish. Billing may already have stopped. Your account data remains; retry to finish deletion.");
    }
  };
}

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { CommerceError, type CommerceConfig } from "./commerce-config.js";
import type {
  BillingState,
  BillingEvent,
  CheckoutState,
  SubscriptionStatus,
  AppliedIntroReservation,
} from "./commerce-provider.js";
import type { PaidPlanId } from "../../shared/plans.js";
import type { AddonChange, AddonSubscription, AddonPlan } from "./commerce-addon.js";

export interface CommerceClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface CommercePool {
  connect(): Promise<CommerceClient>;
}
export interface CommerceCustomer {
  ownerId: string;
  customerId: string | null;
  customerKey: string;
  createdAt: string;
  status: SubscriptionStatus;
  subscriptionId: string | null;
  paymentHold: boolean;
  accessExpiresAt: string | null;
  activePlan?: PaidPlanId | null;
  syncedAt: string | null;
}
export interface CommerceLease extends CommerceCustomer {
  token: string;
  fence: number;
}
export interface CheckoutReservation {
  id: string;
  requestKey: string;
  priceId: string;
  plan?: PaidPlanId;
  origin: string;
  state: "creating" | "open" | "complete" | "expired" | "abandoned";
  sessionId: string | null;
  createdAt: string;
  offer?: "premium-first-month-v1";
  couponId?: string;
  returnTo?: "swipe";
}
const date = (value: unknown) =>
  new Date(value instanceof Date ? value : String(value)).toISOString();
const mapped = (r: Record<string, unknown>): CommerceCustomer => ({
  ownerId: String(r.owner_id),
  customerId: typeof r.customer_id === "string" ? r.customer_id : null,
  customerKey: String(r.customer_key),
  createdAt: date(r.created_at),
  status: r.subscription_status as SubscriptionStatus,
  subscriptionId:
    typeof r.subscription_id === "string" ? r.subscription_id : null,
  paymentHold: r.payment_hold === true,
  accessExpiresAt: r.access_expires_at ? date(r.access_expires_at) : null,
  activePlan: ["basic", "premium", "trading"].includes(String(r.active_plan)) ? r.active_plan as PaidPlanId : null,
  syncedAt: r.synced_at ? date(r.synced_at) : null,
});
const checkout = (r: Record<string, unknown>): CheckoutReservation => ({
  id: String(r.id),
  requestKey: String(r.request_key),
  priceId: String(r.price_id),
  plan: ["basic", "premium", "trading"].includes(String(r.plan)) ? r.plan as PaidPlanId : "trading",
  origin: String(r.origin),
  state: r.state as CheckoutReservation["state"],
  sessionId: typeof r.session_id === "string" ? r.session_id : null,
  createdAt: date(r.created_at),
  ...(r.offer_id === "premium-first-month-v1" ? { offer: r.offer_id } : {}),
  ...(typeof r.coupon_id === "string" ? { couponId: r.coupon_id } : {}),
  ...(r.return_to === "swipe" ? { returnTo: r.return_to } : {}),
});
const addonChange = (r: Record<string, unknown>): AddonChange => ({
  id: String(r.id), requestKey: String(r.request_key), subscriptionId: String(r.subscription_id),
  fromPlan: r.from_plan as AddonPlan, targetPlan: r.target_plan as AddonPlan,
  fromPriceId: String(r.from_price_id), targetPriceId: String(r.target_price_id),
  periodStart: Math.floor(Date.parse(date(r.period_start)) / 1000), effectiveAt: Math.floor(Date.parse(date(r.effective_at)) / 1000),
  createdAt: date(r.created_at), scheduleId: typeof r.schedule_id === "string" ? r.schedule_id : null,
  body: r.request_body == null ? null : r.request_body as AddonChange["body"], state: r.state as AddonChange["state"],
  ...(typeof r.cancel_request_key === "string" ? { cancelRequestKey: r.cancel_request_key } : {}),
});
let runtimePool: Pool | undefined;
function defaultPool(): CommercePool {
  if (!runtimePool) {
    if (!process.env.DATABASE_URL)
      throw new CommerceError("billing_unavailable");
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.delete("options");
    runtimePool = new Pool({
      connectionString: url.toString(),
      max: 2,
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    runtimePool.on("error", () =>
      console.error(JSON.stringify({ event: "commerce_database_failed" })),
    );
  }
  return runtimePool;
}
export function createCommerceStore(
  config: Pick<CommerceConfig, "namespace" | "mode">,
  providedPool?: CommercePool,
) {
  const ns = config.namespace,
    live = config.mode === "live";
  async function transaction<T>(
    fn: (client: CommerceClient) => Promise<T>,
  ): Promise<T> {
    let client: CommerceClient | undefined;
    try {
      client = await (providedPool ?? defaultPool()).connect();
      await client.query("BEGIN");
      await client.query(
        "SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='4000ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'",
      );
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (error instanceof CommerceError) throw error;
      throw new CommerceError("billing_unavailable");
    } finally {
      client?.release();
    }
  }
  async function fence(client: CommerceClient, lease: CommerceLease) {
    const result = await client.query(
      `/* commerce:fence */ SELECT payment_hold FROM sajda.commerce_customers
      WHERE namespace=$1 AND owner_id=$2 AND lease_token=$3::uuid AND fence=$4 AND lease_until>clock_timestamp() FOR UPDATE`,
      [ns, lease.ownerId, lease.token, lease.fence],
    );
    if (!result.rows.length) throw new CommerceError("billing_busy", 409);
    return result.rows[0].payment_hold === true;
  }
  async function recordEvent(
    client: CommerceClient,
    event: BillingEvent,
    hash: string,
    outcome: "reconciled" | "ignored",
  ) {
    const result = await client.query(
      `/* commerce:event */ INSERT INTO sajda.commerce_events(namespace,event_id,event_type,payload_hash,customer_id,event_created_at,outcome)
      VALUES($1,$2,$3,$4,$5,to_timestamp($6),$7) ON CONFLICT(namespace,event_id) DO NOTHING RETURNING event_id`,
      [
        ns,
        event.id,
        event.type,
        hash,
        event.customerId,
        event.created,
        outcome,
      ],
    );
    if (!result.rows.length) {
      const existing = await client.query(
        "SELECT payload_hash FROM sajda.commerce_events WHERE namespace=$1 AND event_id=$2",
        [ns, event.id],
      );
      if (existing.rows[0]?.payload_hash !== hash)
        throw new CommerceError("webhook_event_conflict", 400);
    }
  }
  return {
    async addonAvailable(): Promise<boolean> {
      return transaction(async client => {
        const rows = (await client.query("/* commerce:addon-schema */ SELECT to_regclass('sajda.commerce_addon_changes') IS NOT NULL AND EXISTS(SELECT 1 FROM sajda.schema_migrations WHERE id='0027_trading_addon_changes.sql') AS ready")).rows;
        if (rows.length !== 1 || typeof rows[0].ready !== "boolean") throw new CommerceError("billing_unavailable");
        return rows[0].ready;
      });
    },
    async addonChange(lease: CommerceLease, requestKey?: string): Promise<AddonChange | null> {
      return transaction(async client => {
        await fence(client, lease);
        const rows = (await client.query(`/* commerce:addon-existing */ SELECT * FROM sajda.commerce_addon_changes
          WHERE namespace=$1 AND owner_id=$2 AND (request_key=$3::uuid OR state IN ('creating','scheduled','canceling'))
          ORDER BY (request_key=$3::uuid) DESC NULLS LAST,created_at DESC LIMIT 1`, [ns, lease.ownerId, requestKey ?? null])).rows;
        return rows[0] ? addonChange(rows[0]) : null;
      });
    },
    async addonScheduleOwner(lease: CommerceLease, scheduleId: string): Promise<AddonChange | null> {
      return transaction(async client => {
        await fence(client, lease);
        const rows = (await client.query("/* commerce:addon-owner */ SELECT * FROM sajda.commerce_addon_changes WHERE namespace=$1 AND owner_id=$2 AND schedule_id=$3", [ns, lease.ownerId, scheduleId])).rows;
        return rows[0] ? addonChange(rows[0]) : null;
      });
    },
    async addonCancelChange(lease: CommerceLease, requestKey: string): Promise<AddonChange | null> {
      return transaction(async client => {
        await fence(client, lease);
        const rows = (await client.query(`/* commerce:addon-cancel-existing */ SELECT * FROM sajda.commerce_addon_changes
          WHERE namespace=$1 AND owner_id=$2 AND (cancel_request_key=$3::uuid OR state IN ('creating','scheduled','canceling'))
          ORDER BY (cancel_request_key=$3::uuid) DESC NULLS LAST,created_at DESC LIMIT 1`, [ns, lease.ownerId, requestKey])).rows;
        return rows[0] ? addonChange(rows[0]) : null;
      });
    },
    async reserveAddonChange(lease: CommerceLease, requestKey: string, context: AddonSubscription, targetPlan: AddonPlan, targetPriceId: string): Promise<AddonChange> {
      return transaction(async client => {
        await fence(client, lease);
        const existing = (await client.query(`/* commerce:addon-existing */ SELECT * FROM sajda.commerce_addon_changes
          WHERE namespace=$1 AND owner_id=$2 AND (request_key=$3::uuid OR state IN ('creating','scheduled','canceling'))
          ORDER BY (request_key=$3::uuid) DESC,created_at DESC LIMIT 1`, [ns, lease.ownerId, requestKey])).rows;
        if (existing[0]) return addonChange(existing[0]);
        const count = (await client.query("SELECT count(*)::int AS n FROM sajda.commerce_addon_changes WHERE namespace=$1 AND owner_id=$2 AND created_at>clock_timestamp()-interval '24 hours'", [ns, lease.ownerId])).rows;
        if (Number(count[0]?.n) >= 5) throw new CommerceError("addon_change_limit", 429);
        const rows = (await client.query(`/* commerce:addon-reserve */ INSERT INTO sajda.commerce_addon_changes
          (id,namespace,owner_id,request_key,subscription_id,from_plan,target_plan,from_price_id,target_price_id,period_start,effective_at)
          VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8,$9,to_timestamp($10),to_timestamp($11)) RETURNING *`,
        [randomUUID(), ns, lease.ownerId, requestKey, context.id, context.plan, targetPlan, context.priceId, targetPriceId, context.start, context.end])).rows;
        return addonChange(rows[0]);
      });
    },
    async saveAddonChange(lease: CommerceLease, change: AddonChange, patch: Partial<Pick<AddonChange, "state" | "scheduleId" | "body" | "cancelRequestKey">>): Promise<AddonChange> {
      return transaction(async client => {
        await fence(client, lease);
        const rows = (await client.query(`/* commerce:addon-save */ UPDATE sajda.commerce_addon_changes
          SET state=$4,schedule_id=COALESCE($5,schedule_id),request_body=COALESCE($6::jsonb,request_body),cancel_request_key=COALESCE(cancel_request_key,$8::uuid),updated_at=clock_timestamp()
          WHERE namespace=$1 AND owner_id=$2 AND id=$3::uuid AND state=$7
            AND ($5::text IS NULL OR schedule_id IS NULL OR schedule_id=$5)
            AND ($6::jsonb IS NULL OR request_body IS NULL OR request_body=$6::jsonb)
          RETURNING *`, [ns, lease.ownerId, change.id, patch.state ?? change.state, patch.scheduleId ?? null,
          patch.body == null ? null : JSON.stringify(patch.body), change.state, patch.cancelRequestKey ?? null])).rows;
        if (rows.length !== 1) throw new CommerceError("addon_change_review_required", 409);
        return addonChange(rows[0]);
      });
    },
    async introAvailable(): Promise<boolean> {
      return transaction(async client => {
        const result = await client.query(`/* commerce:intro-schema */ SELECT
          (SELECT count(*)=3 FROM information_schema.columns
            WHERE table_schema='sajda' AND table_name='commerce_checkouts' AND column_name IN ('offer_id','coupon_id','return_to'))
          AND EXISTS(SELECT 1 FROM sajda.schema_migrations WHERE id='0026_premium_intro_constraint.sql') AS ready`);
        if (result.rows.length !== 1 || typeof result.rows[0].ready !== "boolean") throw new CommerceError("billing_unavailable");
        return result.rows[0].ready;
      });
    },
    async appStoreSubscription(ownerId: string, lease?: CommerceLease): Promise<boolean> {
      return transaction(async (client) => {
        if (lease) {
          if (lease.ownerId !== ownerId) throw new CommerceError("provider_owner_mismatch");
          await fence(client, lease);
        }
        const rows = (await client.query(`/* commerce:app-store-guard */ SELECT EXISTS(
          SELECT 1 FROM sajda.native_commerce_subscriptions
          WHERE namespace=$1 AND owner_id=$2 AND revoked_at IS NULL
            AND status IN (1,3,4) AND (namespace='production')=(environment='Production')
        ) AS blocked`, [ns, ownerId])).rows;
        if (rows.length !== 1 || typeof rows[0].blocked !== "boolean") throw new CommerceError("billing_unavailable");
        // This is duplicate-billing prevention, NOT an entitlement grant. A
        // stale active/retry row cannot silently permit a second provider to
        // bill; Apple synchronization must first confirm expiration/revocation.
        // auto_renew=false still includes the user's remaining paid period.
        return rows[0].blocked;
      });
    },
    async read(ownerId: string): Promise<CommerceCustomer | null> {
      return transaction(async (client) => {
        const result = await client.query(
          `/* commerce:read */ SELECT c.*,a.expires_at AS access_expires_at,a.plan AS active_plan FROM sajda.commerce_customers c
        LEFT JOIN sajda.commerce_access a ON a.namespace=c.namespace AND a.owner_id=c.owner_id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
        WHERE c.namespace=$1 AND c.owner_id=$2 AND c.livemode=$3`,
          [ns, ownerId, live],
        );
        return result.rows[0] ? mapped(result.rows[0]) : null;
      });
    },
    async ownerFor(customerId: string): Promise<string | null> {
      return transaction(async (client) => {
        const result = await client.query(
          "SELECT owner_id FROM sajda.commerce_customers WHERE namespace=$1 AND customer_id=$2 AND livemode=$3",
          [ns, customerId, live],
        );
        return typeof result.rows[0]?.owner_id === "string"
          ? result.rows[0].owner_id
          : null;
      });
    },
    async acquire(ownerId: string): Promise<CommerceLease> {
      return transaction(async (client) => {
        await client.query(
          `/* commerce:customer-reserve */ INSERT INTO sajda.commerce_customers(namespace,owner_id,customer_key,livemode)
        SELECT $1,id,$3::uuid,$4 FROM public.sajda_auth_user WHERE id=$2 AND "emailVerified"=true
        ON CONFLICT(namespace,owner_id) DO NOTHING`,
          [ns, ownerId, randomUUID(), live],
        );
        const token = randomUUID();
        const result = await client.query(
          `/* commerce:lease */ UPDATE sajda.commerce_customers SET lease_token=$3::uuid,lease_until=clock_timestamp()+interval '45 seconds',fence=fence+1
        WHERE namespace=$1 AND owner_id=$2 AND livemode=$4 AND (lease_until IS NULL OR lease_until<=clock_timestamp()) RETURNING *`,
          [ns, ownerId, token, live],
        );
        if (!result.rows[0]) throw new CommerceError("billing_busy", 409);
        return {
          ...mapped(result.rows[0]),
          token,
          fence: Number(result.rows[0].fence),
        };
      });
    },
    async release(lease: CommerceLease): Promise<void> {
      await transaction(async (client) => {
        await client.query(
          "UPDATE sajda.commerce_customers SET lease_token=NULL,lease_until=NULL WHERE namespace=$1 AND owner_id=$2 AND lease_token=$3::uuid AND fence=$4",
          [ns, lease.ownerId, lease.token, lease.fence],
        );
      });
    },
    async customer(lease: CommerceLease, customerId: string): Promise<void> {
      await transaction(async (client) => {
        await fence(client, lease);
        const result = await client.query(
          `/* commerce:customer-save */ UPDATE sajda.commerce_customers SET customer_id=$3
        WHERE namespace=$1 AND owner_id=$2 AND (customer_id IS NULL OR customer_id=$3) RETURNING customer_id`,
          [ns, lease.ownerId, customerId],
        );
        if (!result.rows.length)
          throw new CommerceError("provider_owner_mismatch");
      });
    },
    async existingReservation(lease: CommerceLease, requestKey: string): Promise<CheckoutReservation | null> {
      return transaction(async client => {
        await fence(client, lease);
        const result = await client.query(`/* commerce:checkout-existing */ SELECT * FROM sajda.commerce_checkouts
          WHERE namespace=$1 AND owner_id=$2 AND (request_key=$3::uuid OR state IN ('creating','open'))
          ORDER BY (request_key=$3::uuid) DESC,created_at DESC LIMIT 1`, [ns, lease.ownerId, requestKey]);
        return result.rows[0] ? checkout(result.rows[0]) : null;
      });
    },
    async introReservations(lease: CommerceLease): Promise<AppliedIntroReservation[]> {
      return transaction(async client => {
        await fence(client, lease);
        const result = await client.query(`/* commerce:intro-history */ SELECT id,offer_id,coupon_id,price_id,state FROM sajda.commerce_checkouts
          WHERE namespace=$1 AND owner_id=$2 AND offer_id='premium-first-month-v1' AND plan='premium'
          ORDER BY created_at DESC LIMIT 101`, [ns, lease.ownerId]);
        if (result.rows.length > 100) throw new CommerceError("billing_reconciliation_required", 409);
        return result.rows.map(row => ({ id: String(row.id), offer: "premium-first-month-v1", couponId: String(row.coupon_id), priceId: String(row.price_id), completed: row.state === "complete" }));
      });
    },
    async reservation(
      lease: CommerceLease,
      requestKey: string,
      priceId: string,
      origin: string,
      plan: PaidPlanId = "trading",
      intent: { offer?: "premium-first-month-v1"; couponId?: string; returnTo?: "swipe" } = {},
    ): Promise<CheckoutReservation> {
      return transaction(async (client) => {
        await fence(client, lease);
        const existing = await client.query(
          `/* commerce:checkout-existing */ SELECT * FROM sajda.commerce_checkouts WHERE namespace=$1 AND owner_id=$2
        AND (request_key=$3::uuid OR state IN ('creating','open')) ORDER BY (request_key=$3::uuid) DESC,created_at DESC LIMIT 1`,
          [ns, lease.ownerId, requestKey],
        );
        if (existing.rows[0]) return checkout(existing.rows[0]);
        const count = await client.query(
          "SELECT count(*)::int AS n FROM sajda.commerce_checkouts WHERE namespace=$1 AND owner_id=$2 AND created_at>clock_timestamp()-interval '24 hours'",
          [ns, lease.ownerId],
        );
        if (Number(count.rows[0]?.n) >= 5)
          throw new CommerceError("checkout_limit", 429);
        // Keep ordinary billing compatible with the previous schema until the
        // additive migration is installed. Intro/context writes fail closed if
        // their columns are absent; no discounted intent is silently lost.
        const extended = intent.offer !== undefined || intent.returnTo !== undefined;
        const created = await client.query(
          extended
            ? `/* commerce:checkout-reserve */ INSERT INTO sajda.commerce_checkouts(id,namespace,owner_id,request_key,price_id,origin,plan,offer_id,coupon_id,return_to)
               VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10) RETURNING *`
            : `/* commerce:checkout-reserve */ INSERT INTO sajda.commerce_checkouts(id,namespace,owner_id,request_key,price_id,origin,plan)
               VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7) RETURNING *`,
          extended
            ? [randomUUID(), ns, lease.ownerId, requestKey, priceId, origin, plan, intent.offer ?? null, intent.couponId ?? null, intent.returnTo ?? null]
            : [randomUUID(), ns, lease.ownerId, requestKey, priceId, origin, plan],
        );
        return checkout(created.rows[0]);
      });
    },
    async saveCheckout(
      lease: CommerceLease,
      id: string,
      state: CheckoutState,
    ): Promise<void> {
      await transaction(async (client) => {
        await fence(client, lease);
        await client.query(
          `/* commerce:checkout-save */ UPDATE sajda.commerce_checkouts SET session_id=$4,state=$5,expires_at=$6::timestamptz
        WHERE namespace=$1 AND owner_id=$2 AND id=$3::uuid AND (session_id IS NULL OR session_id=$4)`,
          [ns, lease.ownerId, id, state.id, state.status, state.expiresAt],
        );
      });
    },
    async abandonCheckout(lease: CommerceLease, id: string): Promise<void> {
      await transaction(async (client) => {
        await fence(client, lease);
        await client.query(
          `/* commerce:checkout-abandon */ UPDATE sajda.commerce_checkouts SET state='abandoned'
          WHERE namespace=$1 AND owner_id=$2 AND id=$3::uuid AND state='creating' AND session_id IS NULL`,
          [ns, lease.ownerId, id],
        );
      });
    },
    async sync(
      lease: CommerceLease,
      state: BillingState,
      event?: { event: BillingEvent; hash: string },
    ): Promise<void> {
      await transaction(async (client) => {
        const persistedHold = await fence(client, lease);
        const hold =
          persistedHold || lease.paymentHold || event?.event.hold === true;
        await client.query(
          `/* commerce:state */ UPDATE sajda.commerce_customers SET subscription_id=$3,subscription_status=$4,cancel_at_period_end=$5,payment_hold=$6,synced_at=clock_timestamp()
        WHERE namespace=$1 AND owner_id=$2`,
          [
            ns,
            lease.ownerId,
            state.subscriptionId,
            state.status,
            state.cancelAtPeriodEnd,
            hold,
          ],
        );
        if (state.grant && !hold) {
          const grant = state.grant;
          await client.query(
            `/* commerce:grant */ INSERT INTO sajda.commerce_access(namespace,owner_id,subscription_id,price_id,invoice_id,livemode,valid_from,expires_at,plan)
          VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9)
          ON CONFLICT(namespace,owner_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,price_id=EXCLUDED.price_id,invoice_id=EXCLUDED.invoice_id,
            livemode=EXCLUDED.livemode,valid_from=EXCLUDED.valid_from,expires_at=EXCLUDED.expires_at,plan=EXCLUDED.plan,revoked_at=NULL,verified_at=clock_timestamp()`,
            [
              ns,
              lease.ownerId,
              grant.subscriptionId,
              grant.priceId,
              grant.invoiceId,
              live,
              grant.validFrom,
              grant.expiresAt,
              grant.plan ?? "trading",
            ],
          );
        } else
          await client.query(
            "/* commerce:revoke */ UPDATE sajda.commerce_access SET revoked_at=clock_timestamp(),verified_at=clock_timestamp() WHERE namespace=$1 AND owner_id=$2",
            [ns, lease.ownerId],
          );
        if (event)
          await recordEvent(client, event.event, event.hash, "reconciled");
      });
    },
    async processed(eventId: string, hash: string): Promise<boolean> {
      return transaction(async (client) => {
        const result = await client.query(
          "SELECT payload_hash FROM sajda.commerce_events WHERE namespace=$1 AND event_id=$2",
          [ns, eventId],
        );
        if (result.rows.length && result.rows[0].payload_hash !== hash)
          throw new CommerceError("webhook_event_conflict", 400);
        return result.rows.length > 0;
      });
    },
    async ignore(event: BillingEvent, hash: string): Promise<void> {
      await transaction((client) =>
        recordEvent(client, event, hash, "ignored"),
      );
    },
  };
}
export type CommerceStore = ReturnType<typeof createCommerceStore>;

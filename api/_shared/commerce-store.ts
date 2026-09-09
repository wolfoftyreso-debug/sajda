import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { CommerceError, type CommerceConfig } from "./commerce-config.js";
import type {
  BillingState,
  BillingEvent,
  CheckoutState,
  SubscriptionStatus,
} from "./commerce-provider.js";

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
  origin: string;
  state: "creating" | "open" | "complete" | "expired" | "abandoned";
  sessionId: string | null;
  createdAt: string;
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
  syncedAt: r.synced_at ? date(r.synced_at) : null,
});
const checkout = (r: Record<string, unknown>): CheckoutReservation => ({
  id: String(r.id),
  requestKey: String(r.request_key),
  priceId: String(r.price_id),
  origin: String(r.origin),
  state: r.state as CheckoutReservation["state"],
  sessionId: typeof r.session_id === "string" ? r.session_id : null,
  createdAt: date(r.created_at),
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
    async read(ownerId: string): Promise<CommerceCustomer | null> {
      return transaction(async (client) => {
        const result = await client.query(
          `/* commerce:read */ SELECT c.*,a.expires_at AS access_expires_at FROM sajda.commerce_customers c
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
    async reservation(
      lease: CommerceLease,
      requestKey: string,
      priceId: string,
      origin: string,
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
        const created = await client.query(
          `/* commerce:checkout-reserve */ INSERT INTO sajda.commerce_checkouts(id,namespace,owner_id,request_key,price_id,origin)
        VALUES($1::uuid,$2,$3,$4::uuid,$5,$6) RETURNING *`,
          [randomUUID(), ns, lease.ownerId, requestKey, priceId, origin],
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
            `/* commerce:grant */ INSERT INTO sajda.commerce_access(namespace,owner_id,subscription_id,price_id,invoice_id,livemode,valid_from,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
          ON CONFLICT(namespace,owner_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,price_id=EXCLUDED.price_id,invoice_id=EXCLUDED.invoice_id,
            livemode=EXCLUDED.livemode,valid_from=EXCLUDED.valid_from,expires_at=EXCLUDED.expires_at,revoked_at=NULL,verified_at=clock_timestamp()`,
            [
              ns,
              lease.ownerId,
              grant.subscriptionId,
              grant.priceId,
              grant.invoiceId,
              live,
              grant.validFrom,
              grant.expiresAt,
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

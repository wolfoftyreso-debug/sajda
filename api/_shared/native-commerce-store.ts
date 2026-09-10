import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { nativeCommerceError, type NativeCommerceConfig } from "./native-commerce-config.js";
import type { NativeSubscription } from "./native-commerce-provider.js";

export interface NativeCommerceIdentity { ownerId: string; accountToken: string; originalIds: string[]; checkedAt: number | null }
export interface NativeCommerceLease extends NativeCommerceIdentity { leaseToken: string; fence: number }
export interface NativeCommerceEvent { id: string; type: string; hash: string }
export interface NativeCommerceStore {
  identity(ownerId: string, create?: boolean): Promise<NativeCommerceIdentity | null>;
  ownerForToken(token: string): Promise<string | null>;
  lease(ownerId: string): Promise<NativeCommerceLease>;
  save(lease: NativeCommerceLease, subscriptions: NativeSubscription[], event?: NativeCommerceEvent): Promise<void>;
  release(lease: NativeCommerceLease): Promise<void>;
  event(event: NativeCommerceEvent): Promise<boolean>;
  ignore(event: NativeCommerceEvent): Promise<void>;
  staleOwners(): Promise<string[]>;
  externalBilling(ownerId: string): Promise<boolean>;
  pruneEvents(): Promise<void>;
  active(ownerId: string): Promise<boolean>;
}
let pool: Pool | undefined;
function connection() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw nativeCommerceError();
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.delete("options");
    pool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
      query_timeout: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    pool.on("error", () => console.error(JSON.stringify({ event: "native_commerce_database_failed" })));
  }
  return pool;
}
export function createNativeCommerceStore(config: NativeCommerceConfig): NativeCommerceStore {
  const ns = config.namespace;
  const identity = async (ownerId: string, create = false): Promise<NativeCommerceIdentity | null> => {
    const db = connection();
    if (create) await db.query(`INSERT INTO sajda.native_commerce_accounts(namespace,owner_id,app_account_token,environment)
      SELECT $1,id,$3::uuid,$4 FROM public.sajda_auth_user WHERE id=$2 AND "emailVerified"=true
      ON CONFLICT(namespace,owner_id) DO NOTHING`, [ns,ownerId,randomUUID(),config.environment]);
    const rows = (await db.query(`SELECT a.app_account_token,a.checked_at,
      ARRAY(SELECT s.original_transaction_id FROM sajda.native_commerce_subscriptions s
        WHERE s.namespace=a.namespace AND s.owner_id=a.owner_id ORDER BY s.verified_at DESC LIMIT 6) original_ids
      FROM sajda.native_commerce_accounts a JOIN public.sajda_auth_user u ON u.id=a.owner_id
      WHERE a.namespace=$1 AND a.owner_id=$2 AND a.environment=$3 AND u."emailVerified"=true`,[ns,ownerId,config.environment])).rows;
    return rows.length === 1 ? { ownerId, accountToken: rows[0].app_account_token,
      originalIds: rows[0].original_ids, checkedAt: rows[0].checked_at ? new Date(rows[0].checked_at).getTime() : null } : null;
  };
  const eventExists = async (event: NativeCommerceEvent) => {
    const rows = (await connection().query("SELECT payload_hash FROM sajda.native_commerce_events WHERE namespace=$1 AND notification_id=$2::uuid",[ns,event.id])).rows;
    if (rows.length && rows[0].payload_hash !== event.hash) throw nativeCommerceError("apple_event_conflict",409);
    return rows.length > 0;
  };
  return {
    identity,
    async ownerForToken(token) {
      const rows = (await connection().query("SELECT owner_id FROM sajda.native_commerce_accounts WHERE namespace=$1 AND app_account_token=$2::uuid AND environment=$3",[ns,token,config.environment])).rows;
      return rows[0]?.owner_id ?? null;
    },
    async lease(ownerId) {
      const current = await identity(ownerId);
      if (!current) throw nativeCommerceError("apple_account_missing",409);
      const token = randomUUID();
      const rows = (await connection().query(`UPDATE sajda.native_commerce_accounts
        SET lease_token=$3::uuid,lease_until=now()+interval '50 seconds',fence=fence+1
        WHERE namespace=$1 AND owner_id=$2 AND (lease_until IS NULL OR lease_until<now())
        RETURNING fence`,[ns,ownerId,token])).rows;
      if (!rows.length) throw nativeCommerceError("apple_sync_busy",409);
      return { ...current, leaseToken: token, fence: rows[0].fence };
    },
    async save(lease, subscriptions, event) {
      const client = await connection().connect();
      try {
        await client.query("BEGIN");
        const owned = (await client.query(`SELECT 1 FROM sajda.native_commerce_accounts
          WHERE namespace=$1 AND owner_id=$2 AND app_account_token=$3::uuid
            AND lease_token=$4::uuid AND fence=$5 AND lease_until>now() FOR UPDATE`,
        [ns,lease.ownerId,lease.accountToken,lease.leaseToken,lease.fence])).rows;
        if (owned.length !== 1) throw nativeCommerceError("apple_sync_stale",409);
        for (const item of subscriptions) {
          const updated = (await client.query(`INSERT INTO sajda.native_commerce_subscriptions
            (namespace,owner_id,original_transaction_id,transaction_id,product_id,plan,environment,status,
              valid_from,expires_at,revoked_at,signed_at,auto_renew,verified_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
            ON CONFLICT(namespace,original_transaction_id) DO UPDATE SET
              transaction_id=EXCLUDED.transaction_id,product_id=EXCLUDED.product_id,plan=EXCLUDED.plan,
              status=EXCLUDED.status,valid_from=EXCLUDED.valid_from,expires_at=EXCLUDED.expires_at,
              revoked_at=EXCLUDED.revoked_at,signed_at=EXCLUDED.signed_at,auto_renew=EXCLUDED.auto_renew,verified_at=now()
            WHERE sajda.native_commerce_subscriptions.owner_id=EXCLUDED.owner_id
              AND sajda.native_commerce_subscriptions.environment=EXCLUDED.environment
              AND sajda.native_commerce_subscriptions.signed_at<=EXCLUDED.signed_at
            RETURNING original_transaction_id`,[ns,lease.ownerId,item.originalId,item.transactionId,item.productId,item.plan,
            config.environment,item.status,new Date(item.validFrom),new Date(item.expiresAt),
            item.revokedAt === null ? null : new Date(item.revokedAt),new Date(item.signedAt),item.autoRenew])).rows;
          if (updated.length !== 1) throw nativeCommerceError("apple_sync_stale",409);
        }
        if (event) {
          // Duplicate notifications are allowed only with the same payload.
          const inserted = (await client.query(`INSERT INTO sajda.native_commerce_events(namespace,notification_id,event_type,payload_hash,outcome)
            VALUES($1,$2::uuid,$3,$4,'reconciled') ON CONFLICT(namespace,notification_id) DO UPDATE
            SET payload_hash=sajda.native_commerce_events.payload_hash
            WHERE sajda.native_commerce_events.payload_hash=EXCLUDED.payload_hash RETURNING notification_id`,[ns,event.id,event.type,event.hash])).rows;
          if (!inserted.length) throw nativeCommerceError("apple_event_conflict",409);
        }
        await client.query(`UPDATE sajda.native_commerce_accounts SET checked_at=now(),lease_token=NULL,lease_until=NULL
          WHERE namespace=$1 AND owner_id=$2 AND lease_token=$3::uuid AND fence=$4`,[ns,lease.ownerId,lease.leaseToken,lease.fence]);
        await client.query("COMMIT");
      } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
      finally { client.release(); }
    },
    async release(lease) {
      // On failure this marks the last ATTEMPT, not a verified grant. It backs
      // membership retries off for five minutes without extending access.
      await connection().query(`UPDATE sajda.native_commerce_accounts SET checked_at=now(),lease_token=NULL,lease_until=NULL
        WHERE namespace=$1 AND owner_id=$2 AND lease_token=$3::uuid AND fence=$4`,[ns,lease.ownerId,lease.leaseToken,lease.fence]);
    },
    event: eventExists,
    async ignore(event) {
      if (await eventExists(event)) return;
      await connection().query(`INSERT INTO sajda.native_commerce_events(namespace,notification_id,event_type,payload_hash,outcome)
        VALUES($1,$2::uuid,$3,$4,'ignored') ON CONFLICT(namespace,notification_id) DO NOTHING`,[ns,event.id,event.type,event.hash]);
    },
    async staleOwners() {
      return (await connection().query(`SELECT a.owner_id FROM sajda.native_commerce_accounts a
        WHERE EXISTS(SELECT 1 FROM sajda.native_commerce_subscriptions s WHERE s.namespace=a.namespace AND s.owner_id=a.owner_id)
        AND a.namespace=$1 AND (a.checked_at IS NULL OR a.checked_at<now()-interval '1 hour')
        ORDER BY a.checked_at NULLS FIRST LIMIT 20`,[ns])).rows.map(row=>row.owner_id);
    },
    async externalBilling(ownerId) {
      const rows = (await connection().query(`SELECT 1 FROM sajda.commerce_customers
        WHERE namespace=$1 AND owner_id=$2 AND subscription_status NOT IN ('none','canceled','incomplete_expired')
        UNION ALL SELECT 1 FROM sajda.commerce_checkouts WHERE namespace=$1 AND owner_id=$2 AND state IN ('creating','open') LIMIT 1`,[ns,ownerId])).rows;
      return rows.length>0;
    },
    async pruneEvents() {
      await connection().query(`DELETE FROM sajda.native_commerce_events
        WHERE (namespace,notification_id) IN (
          SELECT namespace,notification_id FROM sajda.native_commerce_events
          WHERE namespace=$1 AND processed_at<now()-interval '90 days' ORDER BY processed_at LIMIT 1000
        )`,[ns]);
    },
    async active(ownerId) {
      return (await connection().query(`SELECT 1 FROM sajda.native_commerce_subscriptions
        WHERE namespace=$1 AND owner_id=$2 AND status IN (1,4) AND revoked_at IS NULL
          AND valid_from<=now() AND expires_at>now() AND verified_at>now()-interval '24 hours' LIMIT 1`,[ns,ownerId])).rows.length>0;
    },
  };
}

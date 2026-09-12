import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { AccountAccessError } from "./account-error.js";
import type { VerifiedAccount } from "./account-auth.js";
import { sendAccountDeletionEmail } from "./account-email.js";
import { createDeletionBilling, type DeletionCustomer } from "./account-deletion-billing.js";

const requestId = z.string().uuid().transform(value => value.toLowerCase());
export const accountDeletionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), requestId, language: z.enum(["en", "sv", "es", "fr", "zh"]).default("en") }).strict(),
  z.object({ action: z.literal("confirm"), requestId, code: z.string().regex(/^\d{8}$/u), confirmation: z.literal("DELETE") }).strict(),
]);
export type AccountDeletionInput = z.infer<typeof accountDeletionInput>;
export interface DeletionClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface DeletionPool { connect(): Promise<DeletionClient> }
export type AccountDeletionResult = { status: "confirmation_required"; deletionRequestId: string; expiresAt: string }
  | { status: "deleted"; deletionRequestId: string; billing: "none" | "canceled" };

const unavailable = () => new AccountAccessError("deletion_unavailable", 503,
  "Account deletion could not finish. Billing may already have stopped. Retry to confirm and finish deletion.");
const invalid = () => new AccountAccessError("deletion_code_invalid", 400, "The deletion code is incorrect, expired or already used. Request a new code if needed.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let runtimePool: Pool | undefined;
function pool(): DeletionPool {
  if (!runtimePool) {
    if (!process.env.DATABASE_URL) throw unavailable();
    const url = new URL(process.env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw unavailable();
    url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
    runtimePool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000,
      query_timeout: 8000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
    runtimePool.on("error", () => console.error(JSON.stringify({ event: "account_deletion_database_failed" })));
  }
  return runtimePool;
}

/** Stable only for one owner + random request UUID, never reversible from DB.
 * Eight digits are protected by the durable five-attempt challenge budget. */
export function deriveDeletionCode(secret: string, owner: string, id: string): string {
  if (secret.length < 32) throw unavailable();
  const bytes = createHmac("sha256", secret).update(`sajda-account-delete-v1\0${owner}\0${id}`).digest();
  return (bytes.readUInt32BE(0) % 100_000_000).toString().padStart(8, "0");
}
function codeHash(secret: string, owner: string, id: string, code: string): string {
  return createHmac("sha256", secret).update(`sajda-delete-proof-v1\0${owner}\0${id}\0${code}`).digest("hex");
}
function expiry(value: unknown): string {
  const instant = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(instant.getTime())) throw unavailable();
  return instant.toISOString();
}

export function createAccountDeletionService(deps: {
  pool?: DeletionPool;
  secret?: () => string;
  sendEmail?: typeof sendAccountDeletionEmail;
  closeBilling?: (owner: string, customers: DeletionCustomer[]) => Promise<"none" | "canceled">;
} = {}) {
  async function transaction<T>(run: (client: DeletionClient) => Promise<T>): Promise<T> {
    let client: DeletionClient | undefined;
    try {
      client = await (deps.pool ?? pool()).connect();
      await client.query("BEGIN");
      // Network calls only occur while the final transaction fences owner and
      // commerce rows. Three customers at most; provider operations are 5s each.
      await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='45s'");
      const result = await run(client);
      await client.query("COMMIT"); return result;
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AccountAccessError) throw error;
      throw unavailable();
    } finally { client?.release(); }
  }
  async function lockedOwner(client: DeletionClient, owner: string) {
    const result = await client.query(`/* deletion:owner */ SELECT id,email FROM public.sajda_auth_user WHERE id=$1 FOR UPDATE`, [owner]);
    const row = result.rows[0];
    if (!row || row.id !== owner || typeof row.email !== "string") {
      throw new AccountAccessError("invalid_session", 401, "This account is no longer available. Sign in again if needed.");
    }
    return row.email;
  }
  return {
    async execute(account: VerifiedAccount, raw: AccountDeletionInput): Promise<AccountDeletionResult> {
      const parsed = accountDeletionInput.safeParse(raw);
      if (!parsed.success) throw new AccountAccessError("invalid_request", 400, "Send a valid account deletion request.");
      if (!account.id || account.id.length > 200) throw new AccountAccessError("authentication_required", 401, "Sign in to delete your account.");
      const input = parsed.data, owner = account.id;
      const secret = (deps.secret ?? (() => process.env.BETTER_AUTH_SECRET ?? ""))();
      if (secret.length < 32) throw unavailable();
      if (input.action === "request") {
        const code = deriveDeletionCode(secret, owner, input.requestId);
        const requested = await transaction(async client => {
          const email = await lockedOwner(client, owner);
          const result = await client.query(`/* deletion:request */
            INSERT INTO sajda.account_deletion_challenges(owner_id,request_id,code_hash,language,expires_at,window_started_at,request_count)
            VALUES($1,$2::uuid,$3,$4,clock_timestamp()+interval '15 minutes',clock_timestamp(),1)
            ON CONFLICT(owner_id) DO UPDATE SET
              request_id=EXCLUDED.request_id,code_hash=EXCLUDED.code_hash,language=EXCLUDED.language,
              expires_at=CASE WHEN sajda.account_deletion_challenges.request_id=EXCLUDED.request_id
                THEN sajda.account_deletion_challenges.expires_at ELSE EXCLUDED.expires_at END,
              attempts=CASE WHEN sajda.account_deletion_challenges.request_id=EXCLUDED.request_id
                THEN sajda.account_deletion_challenges.attempts ELSE 0 END,
              window_started_at=CASE WHEN sajda.account_deletion_challenges.window_started_at<clock_timestamp()-interval '1 hour'
                THEN clock_timestamp() ELSE sajda.account_deletion_challenges.window_started_at END,
              request_count=CASE WHEN sajda.account_deletion_challenges.window_started_at<clock_timestamp()-interval '1 hour'
                THEN 1 ELSE sajda.account_deletion_challenges.request_count+1 END
            WHERE sajda.account_deletion_challenges.request_count<3
              OR sajda.account_deletion_challenges.window_started_at<clock_timestamp()-interval '1 hour'
            RETURNING expires_at,expires_at>clock_timestamp() AS valid,attempts`,
          [owner, input.requestId, codeHash(secret, owner, input.requestId, code), input.language]);
          if (!result.rows[0]) throw new AccountAccessError("deletion_rate_limited", 429, "Too many deletion codes requested. Wait one hour before requesting another.");
          if (result.rows[0].valid !== true || Number(result.rows[0].attempts) >= 5) throw invalid();
          return { email, expiresAt: expiry(result.rows[0].expires_at) };
        });
        try {
          await (deps.sendEmail ?? sendAccountDeletionEmail)({ to: requested.email, code, requestId: input.requestId, language: input.language });
        } catch {
          throw new AccountAccessError("deletion_email_unavailable", 503, "The deletion code could not be sent. Your account has not been deleted. Retry with the same request.");
        }
        return { status: "confirmation_required", deletionRequestId: input.requestId, expiresAt: requested.expiresAt };
      }
      const proof = codeHash(secret, owner, input.requestId, input.code);
      // Consume attempts in their own committed transaction, including invalid
      // guesses. Rolling back a failed proof must never refund its guess budget.
      const accepted = await transaction(async client => {
        await lockedOwner(client, owner);
        const result = await client.query(`/* deletion:attempt */ UPDATE sajda.account_deletion_challenges
          SET attempts=attempts+1 WHERE owner_id=$1 AND request_id=$2::uuid AND attempts<5
          AND expires_at>clock_timestamp() RETURNING code_hash`, [owner, input.requestId]);
        const stored = result.rows[0]?.code_hash;
        return typeof stored === "string" && /^[a-f0-9]{64}$/u.test(stored)
          && timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(proof, "hex"));
      });
      if (!accepted) throw invalid();
      return transaction(async client => {
        const email = await lockedOwner(client, owner);
        const guard = await client.query(`/* deletion:recheck */ SELECT owner_id FROM sajda.account_deletion_challenges
          WHERE owner_id=$1 AND request_id=$2::uuid AND code_hash=$3 AND expires_at>clock_timestamp() FOR UPDATE`, [owner, input.requestId, proof]);
        if (!guard.rows.length) throw invalid();
        const billingRows = await client.query(`/* deletion:billing */ SELECT namespace,customer_id,livemode,
          (lease_until IS NOT NULL AND lease_until>clock_timestamp()) AS busy
          FROM sajda.commerce_customers WHERE owner_id=$1 ORDER BY namespace FOR UPDATE`, [owner]);
        if (billingRows.rows.some(row => row.busy === true)) {
          throw new AccountAccessError("deletion_billing_busy", 409, "A billing operation is finishing. Wait a moment and retry deletion.");
        }
        const customers = billingRows.rows.filter(row => row.customer_id !== null).map(row => ({
          namespace: String(row.namespace), customerId: String(row.customer_id), live: row.livemode === true,
        }));
        const billing = await (deps.closeBilling ?? createDeletionBilling())(owner, customers);
        // No copied invoice/payment archive is invented. Stripe keeps its own
        // financial history; local owner-linked billing snapshots are removed.
        await client.query(`/* deletion:billing-events */ DELETE FROM sajda.commerce_events
          WHERE customer_id IN (SELECT customer_id FROM sajda.commerce_customers WHERE owner_id=$1)`, [owner]);
        await client.query("/* deletion:saved */ DELETE FROM sajda.saved_domains WHERE user_id=$1", [owner]);
        await client.query(`/* deletion:verification */ DELETE FROM public.sajda_auth_verification
          WHERE value=$1 OR identifier=$1 OR identifier=$2`, [owner, email]);
        await client.query(`/* deletion:quotas */ DELETE FROM sajda.developer_api_quotas WHERE subject_hash=ANY($1::text[])`,
          [[hash(`account:${owner}`), hash(`app-session-management:${owner}`)]]);
        await client.query(`/* deletion:rates */ DELETE FROM sajda.function_rate_limits WHERE subject_hash=ANY($1::text[])`,
          [[hash(`lost-domains:${owner}`), hash(`saved-domains:${owner}`), hash(`commerce:${owner}`), ...["development", "preview", "production"].flatMap(namespace => [
            hash(`native:${namespace}:${owner}`), hash(`account-membership:${namespace}:${owner}`), hash(`trading-scenarios:${namespace}:${owner}`),
          ])]]);
        // Auth sessions, passwords, API keys, native sessions, entitlements,
        // Trading campaigns/runs/work/evidence and commerce rows cascade here.
        // New account-owned tables must also FK to this user ON DELETE CASCADE.
        const deleted = await client.query("/* deletion:delete-user */ DELETE FROM public.sajda_auth_user WHERE id=$1 RETURNING id", [owner]);
        if (deleted.rows.length !== 1 || deleted.rows[0].id !== owner) throw unavailable();
        return { status: "deleted", deletionRequestId: input.requestId, billing };
      });
    },
  };
}

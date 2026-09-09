import { isLocalTestMode } from "@/lib/localTestMode";

/**
 * Transitional account boundary.
 *
 * The directory name is retained so existing feature modules can be migrated
 * one vertical slice at a time without a broad, unsafe rename. It no longer
 * imports, configures, or contacts Supabase. Public deployments are
 * deliberately anonymous until Neon Auth and same-origin Vercel APIs replace
 * these historical browser calls.
 */

export interface AccountUser {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface AccountSession {
  user: AccountUser;
  access_token: string;
  expires_at?: number | null;
}

export const hasSupabaseBrowserConfig = false;
export type SupabaseAuthUnavailableReason = "local_test" | "not_configured";
export const supabaseAuthUnavailableReason: SupabaseAuthUnavailableReason = isLocalTestMode()
  ? "local_test"
  : "not_configured";
export const isSupabaseAuthDisabled = true;

const accountMigrationError = () => new Error(
  "Persistent account features are being migrated to Neon and are not available in this deployment.",
);

const unavailableSubscription = { unsubscribe: () => undefined };

// Legacy call sites have many generated query shapes. Keep the compatibility
// shim untyped rather than re-creating a provider API that must never run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unavailableChannel: any = {
  on: (..._args: unknown[]) => unavailableChannel,
  subscribe: (..._args: unknown[]) => unavailableChannel,
  unsubscribe: (..._args: unknown[]) => undefined,
};

/**
 * Legacy query modules are still present while each feature moves behind a
 * Vercel API. Make an accidental call fail as a normal provider response,
 * never as a browser network request or an invented local account.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unavailableQuery(): any {
  const result = { data: null, error: accountMigrationError() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = new Proxy({}, {
    get(_target, property) {
      if (property === "then") {
        return (fulfilled: (value: typeof result) => unknown, rejected?: (reason: unknown) => unknown) => (
          Promise.resolve(result).then(fulfilled, rejected)
        );
      }
      if (property === "catch") return (rejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(rejected);
      if (property === "finally") return (callback?: () => void) => Promise.resolve(result).finally(callback);
      return () => query;
    },
  });
  return query;
}

export const supabase = {
  auth: {
    onAuthStateChange: (..._args: unknown[]) => ({ data: { subscription: unavailableSubscription } }),
    getSession: async (..._args: unknown[]) => ({ data: { session: null as AccountSession | null }, error: accountMigrationError() }),
    getUser: async (..._args: unknown[]) => ({ data: { user: null as AccountUser | null }, error: accountMigrationError() }),
    signInWithPassword: async (..._args: unknown[]) => ({ data: { user: null, session: null }, error: accountMigrationError() }),
    signUp: async (..._args: unknown[]) => ({ data: { user: null, session: null }, error: accountMigrationError() }),
    resetPasswordForEmail: async (..._args: unknown[]) => ({ data: {}, error: accountMigrationError() }),
    updateUser: async (..._args: unknown[]) => ({ data: { user: null }, error: accountMigrationError() }),
    signOut: async (..._args: unknown[]) => ({ error: accountMigrationError() }),
  },
  from: (..._args: unknown[]) => unavailableQuery(),
  rpc: (..._args: unknown[]) => unavailableQuery(),
  functions: {
    invoke: async (..._args: unknown[]) => ({ data: null, error: accountMigrationError() }),
  },
  channel: (..._args: unknown[]) => unavailableChannel,
  removeChannel: (..._args: unknown[]) => undefined,
};

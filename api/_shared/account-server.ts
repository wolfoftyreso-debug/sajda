import { betterAuth } from "better-auth";
import { Pool, types as pgTypes } from "pg";
import { AccountAccessError } from "./account-error.js";
import { sendAccountEmail } from "./account-email.js";

type AccountEmail = { kind: "verify" | "reset"; to: string; url: string };

/** pg returns int8 as text by default, but the SDK limiter performs date arithmetic. */
export function createAccountPool(connectionString: string): Pool {
  const databaseUrl = new URL(connectionString);
  databaseUrl.searchParams.set("sslmode", "verify-full");
  return new Pool({ connectionString: databaseUrl.toString(), max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000,
    query_timeout: 10_000, allowExitOnIdle: true,
    types: { getTypeParser: (oid, format) => oid === 20 && format !== "binary" ? (value: string) => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) throw new Error("Account database integer out of range");
      return parsed;
    } : pgTypes.getTypeParser(oid, format) },
  });
}

/** This factory also permits isolated integration tests, never a public test bypass. */
export function createAccountAuth(options: {
  origin: string;
  secret: string;
  pool: Pool;
  sendEmail?: (message: AccountEmail) => Promise<void>;
}) {
  const sendEmail = options.sendEmail ?? sendAccountEmail;
  return betterAuth({
    appName: "Sajda", baseURL: options.origin, basePath: "/api/auth", secret: options.secret,
    database: options.pool, trustedOrigins: [options.origin],
    user: { modelName: "sajda_auth_user" },
    account: { modelName: "sajda_auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "sajda_auth_verification" },
    session: {
      modelName: "sajda_auth_session", expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true,
      autoSignIn: false, resetPasswordTokenExpiresIn: 30 * 60, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendEmail({ kind: "reset", to: user.email, url }),
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => sendEmail({ kind: "verify", to: user.email, url }),
    },
    rateLimit: {
      enabled: true, storage: "database", modelName: "sajda_auth_rate_limit", window: 60, max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 600, max: 5 },
        "/request-password-reset": { window: 600, max: 3 },
        "/send-verification-email": { window: 600, max: 3 },
      },
    },
    advanced: {
      cookiePrefix: "sajda", useSecureCookies: new URL(options.origin).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
    },
    // Never forward library payloads (which may contain credentials) into logs.
    logger: { log: (level) => {
      if (level === "error" || level === "warn") console.error(JSON.stringify({ event: "account_auth_library", level }));
    } },
  });
}

export type AccountAuth = ReturnType<typeof createAccountAuth>;
let pool: Pool | undefined;
const instances = new Map<string, AccountAuth>();

export function getAccountAuth(origin: string): AccountAuth {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!secret || secret.length < 32 || !connectionString) {
    throw new AccountAccessError("auth_not_configured", 503, "Account access is not configured in this environment.");
  }
  if (!pool) {
    // Neon transaction pooling does not accept a search_path startup option.
    // Application-owned tables use its verified default public schema.
    pool = createAccountPool(connectionString);
    pool.on("error", () => console.error(JSON.stringify({ event: "account_database_connection_failed" })));
  }
  if (!instances.has(origin)) instances.set(origin, createAccountAuth({ origin, secret, pool }));
  return instances.get(origin)!;
}

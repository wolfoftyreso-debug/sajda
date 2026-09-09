-- Same-origin Better Auth 1.7.3, hosted by Sajda's Vercel Functions.
-- PostgreSQL remains the Vercel-managed Neon database. These application-owned
-- identity tables are separate from any existing managed-provider auth schema.
-- Core modelName values are bare sajda_auth_* names; the pg pool uses public
-- search_path. Camel-case field names deliberately match Better Auth defaults.
-- The SDK generates text IDs and hashes passwords before persistence.
-- No existing identity, saved domain, or prior migration is rewritten here.

CREATE TABLE public.sajda_auth_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sajda_auth_session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES public.sajda_auth_user (id) ON DELETE CASCADE
);

CREATE INDEX sajda_auth_session_user_id_idx
  ON public.sajda_auth_session ("userId");
CREATE INDEX sajda_auth_session_expires_at_idx
  ON public.sajda_auth_session ("expiresAt");

CREATE TABLE public.sajda_auth_account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public.sajda_auth_user (id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sajda_auth_account_provider_account_unique UNIQUE ("providerId", "accountId")
);

CREATE INDEX sajda_auth_account_user_id_idx
  ON public.sajda_auth_account ("userId");

CREATE TABLE public.sajda_auth_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sajda_auth_verification_identifier_idx
  ON public.sajda_auth_verification (identifier);
CREATE INDEX sajda_auth_verification_expires_at_idx
  ON public.sajda_auth_verification ("expiresAt");

-- Better Auth's database limiter uses atomic, conditional counter updates.
-- lastRequest is epoch milliseconds, not a PostgreSQL date/timestamp.
CREATE TABLE public.sajda_auth_rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL CHECK (count >= 0),
  "lastRequest" bigint NOT NULL CHECK ("lastRequest" >= 0)
);

CREATE INDEX sajda_auth_rate_limit_last_request_idx
  ON public.sajda_auth_rate_limit ("lastRequest");

-- Identity tables are server-only, never a browser Data API surface. The
-- Vercel runtime must use the table owner or an explicitly privileged server
-- role. RLS without public policies fails closed for incidental role grants.
ALTER TABLE public.sajda_auth_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sajda_auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sajda_auth_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sajda_auth_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sajda_auth_rate_limit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sajda_auth_user, public.sajda_auth_session,
  public.sajda_auth_account, public.sajda_auth_verification,
  public.sajda_auth_rate_limit FROM PUBLIC;

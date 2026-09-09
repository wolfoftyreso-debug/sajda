-- Self-service developer API keys.
--
-- Raw bearer tokens are never persisted. The Vercel server mints a 256-bit
-- opaque secret, returns it once over the authenticated same-origin endpoint,
-- and stores only its SHA-256 digest plus safe display metadata here.
--
-- This table intentionally lives in `public` only so the existing Supabase
-- service-role client can access it without a custom schema client. RLS is
-- enabled with NO browser policies and `anon`/`authenticated` grants are
-- revoked, so PostgREST/browser code cannot read a hash or even key metadata.
-- User ownership is enforced server-side after validating the Supabase JWT.

CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key_id text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  secret_hash text NOT NULL,
  last_four text NOT NULL,
  environment text NOT NULL,
  name text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['names:search']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT developer_api_keys_public_key_id_format
    CHECK (public_key_id ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT developer_api_keys_prefix_format
    CHECK (key_prefix ~ '^sj_(test|live)_[A-Za-z0-9_-]{16}_$'),
  CONSTRAINT developer_api_keys_secret_hash_format
    CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT developer_api_keys_last_four_format
    CHECK (last_four ~ '^[A-Za-z0-9_-]{4}$'),
  CONSTRAINT developer_api_keys_environment_check
    CHECK (environment IN ('test', 'live')),
  CONSTRAINT developer_api_keys_name_check
    CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)),
  CONSTRAINT developer_api_keys_scope_check
    CHECK (scopes = ARRAY['names:search']::text[]),
  CONSTRAINT developer_api_keys_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_owner_created
  ON public.developer_api_keys(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_lookup
  ON public.developer_api_keys(public_key_id);

ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.developer_api_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.developer_api_keys TO service_role;

-- The request endpoint performs a friendly pre-check, but that cannot make a
-- hard per-user limit safe under concurrent clicks/requests. Serialize active
-- key creation per owner in the database as the final authority.
CREATE OR REPLACE FUNCTION public.enforce_developer_api_key_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  active_key_count integer;
BEGIN
  IF NEW.revoked_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text, 726413));
    SELECT count(*)
      INTO active_key_count
      FROM public.developer_api_keys
     WHERE owner_id = NEW.owner_id
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now());
    IF active_key_count >= 10 THEN
      RAISE EXCEPTION 'developer_api_key_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_developer_api_key_limit_before_write ON public.developer_api_keys;
CREATE TRIGGER enforce_developer_api_key_limit_before_write
  BEFORE INSERT OR UPDATE OF owner_id, revoked_at, expires_at ON public.developer_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_developer_api_key_limit();

COMMENT ON TABLE public.developer_api_keys IS
  'Server-only API key verifier rows. Raw tokens must never be stored or exposed through PostgREST.';
COMMENT ON COLUMN public.developer_api_keys.secret_hash IS
  'SHA-256 digest of the complete opaque API key. Never select this in browser code or return it from an API endpoint.';
COMMENT ON COLUMN public.developer_api_keys.key_prefix IS
  'Safe one-way display prefix, for example sj_live_AbCdEfGhIjKlMnOp_.';

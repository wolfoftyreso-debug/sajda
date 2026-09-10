-- Server-only account keys. Plaintext credentials are never persisted.
-- Scope is a permission ceiling; existing entitlement checks still authorize
-- Premium/Trading work. Cloned databases cannot share keys across environments.
CREATE TABLE sajda.developer_api_keys (
  id uuid PRIMARY KEY,
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  lookup_id text NOT NULL CHECK (lookup_id ~ '^[A-Za-z0-9_-]{16}$'),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^sj_(test|live)_[A-Za-z0-9_-]{16}_$'),
  last_four text NOT NULL CHECK (last_four ~ '^[A-Za-z0-9_-]{4}$'),
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 7 AND array_position(scopes, NULL) IS NULL
    AND scopes <@ ARRAY['domains:search', 'account:read', 'saved:read', 'saved:write', 'trading:read', 'trading:run', 'trading:quote']::text[]),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE(namespace, lookup_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '365 days'),
  CHECK ((namespace = 'production' AND key_prefix LIKE 'sj_live_%') OR (namespace <> 'production' AND key_prefix LIKE 'sj_test_%'))
);
CREATE INDEX developer_api_keys_owner_idx ON sajda.developer_api_keys(namespace, owner_id, created_at DESC);

-- A saturating counter per account/environment/bucket, not per minute or key.
-- Rotating keys cannot reset quota, nor grow unbounded per-window history.
CREATE TABLE sajda.developer_api_quotas (
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  bucket text NOT NULL CHECK (bucket IN ('requests', 'domains', 'management')),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 121),
  PRIMARY KEY(namespace, subject_hash, bucket)
);
ALTER TABLE sajda.developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.developer_api_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.developer_api_keys, sajda.developer_api_quotas FROM PUBLIC;

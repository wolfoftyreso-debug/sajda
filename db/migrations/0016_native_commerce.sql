-- StoreKit configuration/products are deliberately not activated by migration.
-- Account UUIDs are server-created and immutable; signed Apple data cannot
-- create a Sajda account or associate a purchase with a different user.
CREATE TABLE sajda.native_commerce_accounts (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  app_account_token uuid NOT NULL UNIQUE,
  environment text NOT NULL CHECK (environment IN ('Sandbox','Production')),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  fence integer NOT NULL DEFAULT 0 CHECK (fence >= 0),
  PRIMARY KEY(namespace,owner_id),
  CHECK ((namespace='production')=(environment='Production')),
  CHECK ((lease_token IS NULL)=(lease_until IS NULL))
);
CREATE TABLE sajda.native_commerce_subscriptions (
  namespace text NOT NULL,
  original_transaction_id text NOT NULL CHECK (original_transaction_id ~ '^[0-9]{1,40}$'),
  transaction_id text NOT NULL CHECK (transaction_id ~ '^[0-9]{1,40}$'),
  owner_id text NOT NULL,
  product_id text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('basic','premium','trading')),
  environment text NOT NULL CHECK (environment IN ('Sandbox','Production')),
  status integer NOT NULL CHECK (status BETWEEN 1 AND 5),
  valid_from timestamptz NOT NULL CHECK (isfinite(valid_from)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz,
  auto_renew boolean NOT NULL,
  signed_at timestamptz NOT NULL CHECK (isfinite(signed_at)),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(namespace,original_transaction_id),
  FOREIGN KEY(namespace,owner_id) REFERENCES sajda.native_commerce_accounts(namespace,owner_id) ON DELETE CASCADE,
  CHECK (expires_at > valid_from),
  CHECK ((namespace='production')=(environment='Production'))
);
CREATE INDEX native_commerce_owner_idx ON sajda.native_commerce_subscriptions(namespace,owner_id,expires_at DESC);
CREATE TABLE sajda.native_commerce_events (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  notification_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('reconciled','ignored')),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(namespace,notification_id)
);
CREATE INDEX native_commerce_events_retention_idx ON sajda.native_commerce_events(processed_at);
ALTER TABLE sajda.native_commerce_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.native_commerce_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.native_commerce_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.native_commerce_accounts,sajda.native_commerce_subscriptions,sajda.native_commerce_events FROM PUBLIC;

-- No copied operator grant: every Trading authorization uses this same view.
-- A missed Apple event never creates unbounded access: reconcile within 24 h.
CREATE OR REPLACE VIEW sajda.lost_domain_effective_access AS
  SELECT namespaces.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.lost_domain_access a
    CROSS JOIN (VALUES ('development'::text),('preview'::text),('production'::text)) namespaces(namespace)
    WHERE a.grant_source='operator'
  UNION ALL
  SELECT a.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.commerce_access a WHERE (a.namespace='production')=a.livemode
  UNION ALL
  SELECT a.namespace,a.owner_id,a.valid_from,LEAST(a.expires_at,a.verified_at+interval '24 hours'),a.revoked_at,false
    FROM sajda.native_commerce_subscriptions a
    WHERE a.plan='trading' AND a.status IN (1,4) AND (a.namespace='production')=(a.environment='Production');
REVOKE ALL ON sajda.lost_domain_effective_access FROM PUBLIC;

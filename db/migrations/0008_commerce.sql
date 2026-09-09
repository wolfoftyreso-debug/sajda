-- Stripe configuration/resources are intentionally NOT created by this migration.
-- Billing grants are namespaced: a sandbox payment can never unlock production.
CREATE TABLE sajda.commerce_customers (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  customer_key uuid NOT NULL UNIQUE,
  customer_id text UNIQUE CHECK (customer_id IS NULL OR customer_id ~ '^cus_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz, fence integer NOT NULL DEFAULT 0 CHECK (fence >= 0),
  subscription_id text CHECK (subscription_id IS NULL OR subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  subscription_status text NOT NULL DEFAULT 'none' CHECK (subscription_status IN
    ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused','conflict')),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  payment_hold boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  PRIMARY KEY(namespace,owner_id),
  CHECK (namespace <> 'production' OR livemode),
  CHECK (namespace = 'production' OR NOT livemode),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (lease_until IS NULL OR isfinite(lease_until))
);
CREATE TABLE sajda.commerce_checkouts (
  id uuid PRIMARY KEY,
  namespace text NOT NULL, owner_id text NOT NULL,
  request_key uuid NOT NULL,
  price_id text NOT NULL CHECK (price_id ~ '^price_[A-Za-z0-9]+$'),
  origin text NOT NULL CHECK (length(origin) BETWEEN 8 AND 2048),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','open','complete','expired','abandoned')),
  session_id text UNIQUE CHECK (session_id IS NULL OR session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  FOREIGN KEY(namespace,owner_id) REFERENCES sajda.commerce_customers(namespace,owner_id) ON DELETE CASCADE,
  UNIQUE(namespace,owner_id,request_key),
  CHECK ((state IN ('creating','abandoned')) OR session_id IS NOT NULL),
  CHECK (expires_at IS NULL OR isfinite(expires_at))
);
CREATE UNIQUE INDEX commerce_checkouts_one_pending_idx ON sajda.commerce_checkouts(namespace,owner_id)
  WHERE state IN ('creating','open');
CREATE TABLE sajda.commerce_access (
  namespace text NOT NULL, owner_id text NOT NULL,
  subscription_id text NOT NULL CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  price_id text NOT NULL CHECK (price_id ~ '^price_[A-Za-z0-9]+$'),
  invoice_id text NOT NULL CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz NOT NULL CHECK (isfinite(valid_from)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz CHECK (revoked_at IS NULL OR isfinite(revoked_at)),
  daily_refresh boolean NOT NULL DEFAULT false,
  PRIMARY KEY(namespace,owner_id),
  FOREIGN KEY(namespace,owner_id) REFERENCES sajda.commerce_customers(namespace,owner_id) ON DELETE CASCADE,
  CHECK (expires_at>valid_from AND expires_at<=valid_from+interval '45 days'),
  CHECK ((namespace='production')=livemode)
);
CREATE TABLE sajda.commerce_events (
  namespace text NOT NULL CHECK (namespace IN ('development','preview','production')),
  event_id text NOT NULL CHECK (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  customer_id text CHECK (customer_id IS NULL OR customer_id ~ '^cus_[A-Za-z0-9]+$'),
  event_created_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('reconciled','ignored')),
  PRIMARY KEY(namespace,event_id)
);
CREATE INDEX commerce_customers_reconcile_idx ON sajda.commerce_customers(namespace,synced_at) WHERE customer_id IS NOT NULL;
CREATE INDEX commerce_events_customer_idx ON sajda.commerce_events(namespace,customer_id,processed_at DESC);
ALTER TABLE sajda.commerce_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.commerce_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.commerce_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE sajda.commerce_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.commerce_customers,sajda.commerce_checkouts,sajda.commerce_access,sajda.commerce_events FROM PUBLIC;

-- Central read model. Legacy operator grants retain their intentionally manual
-- semantics; billing grants are accepted ONLY from the matching environment.
-- Production uses a separate database, never the preview pilot database.
CREATE VIEW sajda.lost_domain_effective_access AS
  SELECT namespaces.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.lost_domain_access a
    CROSS JOIN (VALUES ('development'::text),('preview'::text),('production'::text)) namespaces(namespace)
    WHERE a.grant_source='operator'
  UNION ALL
  SELECT a.namespace,a.owner_id,a.valid_from,a.expires_at,a.revoked_at,a.daily_refresh
    FROM sajda.commerce_access a WHERE (a.namespace='production')=a.livemode;
REVOKE ALL ON sajda.lost_domain_effective_access FROM PUBLIC;

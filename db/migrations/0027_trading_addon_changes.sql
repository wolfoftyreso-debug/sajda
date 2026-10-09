-- Additive retry/audit ledger. The legacy Trading Price is Pro + Trading,
-- still one subscription. This table never grants product access.
CREATE TABLE sajda.commerce_addon_changes (
  id uuid PRIMARY KEY,
  namespace text NOT NULL,
  owner_id text NOT NULL,
  request_key uuid NOT NULL,
  cancel_request_key uuid,
  subscription_id text NOT NULL CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  from_plan text NOT NULL CHECK (from_plan IN ('premium','trading')),
  target_plan text NOT NULL CHECK (target_plan IN ('premium','trading') AND target_plan<>from_plan),
  from_price_id text NOT NULL CHECK (from_price_id ~ '^price_[A-Za-z0-9]+$'),
  target_price_id text NOT NULL CHECK (target_price_id ~ '^price_[A-Za-z0-9]+$' AND target_price_id<>from_price_id),
  period_start timestamptz NOT NULL CHECK (isfinite(period_start)),
  effective_at timestamptz NOT NULL CHECK (isfinite(effective_at) AND effective_at>period_start AND effective_at<=period_start+interval '45 days'),
  schedule_id text UNIQUE CHECK (schedule_id IS NULL OR schedule_id ~ '^sub_sched_[A-Za-z0-9]+$'),
  request_body jsonb CHECK (request_body IS NULL OR jsonb_typeof(request_body)='object' AND octet_length(request_body::text)<=32768),
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','scheduled','canceling','canceled','applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(namespace,owner_id) REFERENCES sajda.commerce_customers(namespace,owner_id) ON DELETE CASCADE,
  UNIQUE(namespace,owner_id,request_key),
  UNIQUE(namespace,owner_id,cancel_request_key),
  CHECK (state NOT IN ('scheduled','applied') OR schedule_id IS NOT NULL AND request_body IS NOT NULL),
  CHECK (state<>'canceling' OR schedule_id IS NOT NULL),
  CHECK (request_body IS NULL OR schedule_id IS NOT NULL)
);
CREATE UNIQUE INDEX commerce_addon_changes_one_pending_idx ON sajda.commerce_addon_changes(namespace,owner_id)
  WHERE state IN ('creating','scheduled','canceling');
ALTER TABLE sajda.commerce_addon_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.commerce_addon_changes FROM PUBLIC;

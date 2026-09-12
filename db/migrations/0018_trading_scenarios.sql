-- Account-owned hypotheses and simulation inputs, never market evidence or orders.
-- No operator grants or data changes. Namespace prevents preview/production drift.
CREATE TABLE sajda.trading_scenarios (
  namespace text NOT NULL CHECK (namespace IN ('development', 'preview', 'production')),
  owner_id text NOT NULL REFERENCES public.sajda_auth_user(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483646),
  last_input_hash text NOT NULL CHECK (last_input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (namespace, owner_id, id),
  CHECK (updated_at >= created_at)
);
CREATE INDEX trading_scenarios_owner_updated_idx ON sajda.trading_scenarios(namespace, owner_id, updated_at DESC, id DESC);
ALTER TABLE sajda.trading_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sajda.trading_scenarios FROM PUBLIC;

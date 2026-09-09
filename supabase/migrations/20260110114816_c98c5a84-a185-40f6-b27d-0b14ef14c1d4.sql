-- The former external registrar scheduler was retired. Keep this migration
-- harmless for new installations: production jobs are configured explicitly
-- with local secrets, never a hard-coded external endpoint or token.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

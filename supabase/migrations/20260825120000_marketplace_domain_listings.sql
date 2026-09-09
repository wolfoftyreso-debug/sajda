-- Persistent domain-marketplace foundation.
--
-- This migration intentionally covers only domain listings and non-binding
-- offers. It does not store registrar credentials, auth codes, payment data,
-- or transfer instructions.
--
-- A listing is not public until a server-side verifier has confirmed the
-- seller's DNS-TXT control proof. The verifier must use a service-role server
-- environment and call record_marketplace_domain_control_result only after it
-- has observed the expected DNS record. Browser clients cannot self-verify.

DO $$
BEGIN
  CREATE TYPE public.marketplace_listing_status AS ENUM (
    'seller_declared',
    'proof_pending',
    'under_review',
    'active',
    'paused',
    'withdrawn',
    'sold',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.marketplace_ownership_verification_status AS ENUM (
    'not_requested',
    'challenge_issued',
    'pending_review',
    'verified',
    'rejected',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.marketplace_domain_control_proof_status AS ENUM (
    'challenge_issued',
    'submitted',
    'verified',
    'expired',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.marketplace_offer_status AS ENUM (
    'submitted',
    'withdrawn',
    'accepted',
    'declined',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketplace_seller_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  default_currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_seller_profiles_display_name_check
    CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
  CONSTRAINT marketplace_seller_profiles_currency_check
    CHECK (default_currency IN ('USD', 'SEK', 'EUR'))
);

CREATE TABLE IF NOT EXISTS public.marketplace_domain_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_display_name text NOT NULL,
  source_user_domain_id uuid REFERENCES public.user_domains(id) ON DELETE SET NULL,
  domain text NOT NULL,
  description text NOT NULL,
  asking_price numeric(14,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  status public.marketplace_listing_status NOT NULL DEFAULT 'seller_declared',
  ownership_verification_status public.marketplace_ownership_verification_status NOT NULL DEFAULT 'not_requested',
  ownership_verified_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_domain_listings_seller_display_name_check
    CHECK (char_length(btrim(seller_display_name)) BETWEEN 2 AND 80),
  CONSTRAINT marketplace_domain_listings_domain_normalized_check
    CHECK (
      domain = lower(btrim(domain))
      AND domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    ),
  CONSTRAINT marketplace_domain_listings_description_check
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 1400),
  CONSTRAINT marketplace_domain_listings_price_check
    CHECK (asking_price > 0 AND asking_price <= 1000000000),
  CONSTRAINT marketplace_domain_listings_currency_check
    CHECK (currency IN ('USD', 'SEK', 'EUR')),
  CONSTRAINT marketplace_domain_listings_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT marketplace_domain_listings_active_requires_verified_control
    CHECK (
      status <> 'active'
      OR (
        ownership_verification_status = 'verified'
        AND ownership_verified_at IS NOT NULL
        AND published_at IS NOT NULL
      )
    )
);

-- Preserve historic records while preventing two current advertisements for
-- the same domain. A withdrawn, sold, or rejected record may remain as audit
-- history and does not block a new draft.
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_domain_listings_open_domain_key
  ON public.marketplace_domain_listings (lower(domain))
  WHERE status NOT IN ('withdrawn', 'sold', 'rejected');
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_listings_seller_created
  ON public.marketplace_domain_listings (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_listings_public_active
  ON public.marketplace_domain_listings (published_at DESC)
  WHERE status = 'active' AND ownership_verification_status = 'verified';

CREATE TABLE IF NOT EXISTS public.marketplace_domain_control_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_domain_listings(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  challenge_record text NOT NULL,
  challenge_token text NOT NULL UNIQUE,
  status public.marketplace_domain_control_proof_status NOT NULL DEFAULT 'challenge_issued',
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  checked_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  verifier_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_domain_control_proofs_challenge_record_check
    CHECK (challenge_record ~ '^_sajda\.[a-z0-9.-]+$'),
  CONSTRAINT marketplace_domain_control_proofs_token_check
    CHECK (challenge_token ~ '^[a-f0-9]{32}$'),
  CONSTRAINT marketplace_domain_control_proofs_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT marketplace_domain_control_proofs_note_check
    CHECK (verifier_note IS NULL OR char_length(verifier_note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_domain_control_proofs_open_listing_key
  ON public.marketplace_domain_control_proofs (listing_id)
  WHERE status IN ('challenge_issued', 'submitted');
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_control_proofs_seller_created
  ON public.marketplace_domain_control_proofs (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_domain_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_domain_listings(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  currency char(3) NOT NULL,
  message text,
  status public.marketplace_offer_status NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_domain_offers_amount_check
    CHECK (amount > 0 AND amount <= 1000000000),
  CONSTRAINT marketplace_domain_offers_currency_check
    CHECK (currency IN ('USD', 'SEK', 'EUR')),
  CONSTRAINT marketplace_domain_offers_message_check
    CHECK (message IS NULL OR char_length(message) <= 1000),
  CONSTRAINT marketplace_domain_offers_buyer_not_seller_check
    CHECK (buyer_id <> seller_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_domain_offers_open_buyer_listing_key
  ON public.marketplace_domain_offers (listing_id, buyer_id)
  WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_offers_seller_created
  ON public.marketplace_domain_offers (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_offers_buyer_created
  ON public.marketplace_domain_offers (buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.marketplace_domain_listings(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES public.marketplace_domain_offers(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_audit_events_type_check
    CHECK (event_type IN (
      'listing.created',
      'listing.updated',
      'listing.status_changed',
      'proof.issued',
      'proof.submitted',
      'proof.verified',
      'proof.rejected',
      'proof.expired',
      'offer.submitted',
      'offer.status_changed'
    )),
  CONSTRAINT marketplace_audit_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_marketplace_audit_events_listing_created
  ON public.marketplace_audit_events (listing_id, created_at DESC);

ALTER TABLE public.marketplace_seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_domain_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_domain_control_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_domain_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_audit_events ENABLE ROW LEVEL SECURITY;

-- Tables are browser-accessible only to an authenticated owner through RLS.
-- Anonymous/public reading uses the deliberately narrow active-listing view
-- below; it does not expose seller ids, control-proof tokens, or audit data.
REVOKE ALL ON TABLE public.marketplace_seller_profiles FROM anon;
REVOKE ALL ON TABLE public.marketplace_domain_listings FROM anon;
REVOKE ALL ON TABLE public.marketplace_domain_control_proofs FROM anon;
REVOKE ALL ON TABLE public.marketplace_domain_offers FROM anon;
REVOKE ALL ON TABLE public.marketplace_audit_events FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_seller_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_domain_listings TO authenticated;
GRANT SELECT ON TABLE public.marketplace_domain_control_proofs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_domain_offers TO authenticated;
GRANT SELECT ON TABLE public.marketplace_audit_events TO authenticated;

DROP POLICY IF EXISTS "Marketplace sellers can view their profile" ON public.marketplace_seller_profiles;
DROP POLICY IF EXISTS "Marketplace sellers can create their profile" ON public.marketplace_seller_profiles;
DROP POLICY IF EXISTS "Marketplace sellers can update their profile" ON public.marketplace_seller_profiles;
CREATE POLICY "Marketplace sellers can view their profile"
  ON public.marketplace_seller_profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Marketplace sellers can create their profile"
  ON public.marketplace_seller_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Marketplace sellers can update their profile"
  ON public.marketplace_seller_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Marketplace sellers can view their listings" ON public.marketplace_domain_listings;
DROP POLICY IF EXISTS "Marketplace sellers can create their listings" ON public.marketplace_domain_listings;
DROP POLICY IF EXISTS "Marketplace sellers can update their listings" ON public.marketplace_domain_listings;
DROP POLICY IF EXISTS "Marketplace sellers can remove inactive listings" ON public.marketplace_domain_listings;
CREATE POLICY "Marketplace sellers can view their listings"
  ON public.marketplace_domain_listings FOR SELECT
  USING (auth.uid() = seller_id);
CREATE POLICY "Marketplace sellers can create their listings"
  ON public.marketplace_domain_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Marketplace sellers can update their listings"
  ON public.marketplace_domain_listings FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Marketplace sellers can remove inactive listings"
  ON public.marketplace_domain_listings FOR DELETE
  USING (auth.uid() = seller_id AND status IN ('seller_declared', 'withdrawn'));

DROP POLICY IF EXISTS "Marketplace sellers can view their control proofs" ON public.marketplace_domain_control_proofs;
CREATE POLICY "Marketplace sellers can view their control proofs"
  ON public.marketplace_domain_control_proofs FOR SELECT
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Marketplace participants can view their offers" ON public.marketplace_domain_offers;
DROP POLICY IF EXISTS "Marketplace buyers can submit offers" ON public.marketplace_domain_offers;
DROP POLICY IF EXISTS "Marketplace participants can update their offers" ON public.marketplace_domain_offers;
CREATE POLICY "Marketplace participants can view their offers"
  ON public.marketplace_domain_offers FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Marketplace buyers can submit offers"
  ON public.marketplace_domain_offers FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Marketplace participants can update their offers"
  ON public.marketplace_domain_offers FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Marketplace sellers can view listing audit events" ON public.marketplace_audit_events;
CREATE POLICY "Marketplace sellers can view listing audit events"
  ON public.marketplace_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.marketplace_domain_listings listing
      WHERE listing.id = marketplace_audit_events.listing_id
        AND listing.seller_id = auth.uid()
    )
  );

-- A narrow public projection is the only anonymous read route. Views run with
-- the view owner in Postgres, so this projects only safe publication fields
-- and applies the active/verified/expiry gate in SQL rather than relying on
-- clients to remember it.
CREATE OR REPLACE VIEW public.marketplace_active_domain_listings
WITH (security_barrier = true)
AS
SELECT
  id,
  domain,
  description,
  asking_price,
  currency,
  seller_display_name,
  published_at,
  expires_at,
  created_at,
  updated_at
FROM public.marketplace_domain_listings
WHERE status = 'active'
  AND ownership_verification_status = 'verified'
  AND (expires_at IS NULL OR expires_at > now());

GRANT SELECT ON TABLE public.marketplace_active_domain_listings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_expire_open_control_proofs(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketplace_domain_control_proofs
  SET status = 'expired',
      updated_at = now()
  WHERE listing_id = p_listing_id
    AND status IN ('challenge_issued', 'submitted');
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_expire_open_control_proofs(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_guard_listing_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_internal_write boolean :=
    COALESCE(current_setting('app.marketplace_internal_write', true), '') = 'true'
    OR auth.role() = 'service_role';
BEGIN
  -- Linking a private portfolio record is optional, but it can never be used
  -- to claim another seller's domain or a different domain string.
  IF NEW.source_user_domain_id IS NOT NULL THEN
    PERFORM 1
    FROM public.user_domains
    WHERE id = NEW.source_user_domain_id
      AND user_id = NEW.seller_id
      AND lower(domain) = NEW.domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The linked portfolio domain must belong to this seller and match the listing domain';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT is_internal_write THEN
      IF auth.uid() IS NULL OR NEW.seller_id <> auth.uid() THEN
        RAISE EXCEPTION 'A marketplace listing must belong to the authenticated seller';
      END IF;
      IF NEW.status <> 'seller_declared'
        OR NEW.ownership_verification_status <> 'not_requested'
        OR NEW.ownership_verified_at IS NOT NULL
        OR NEW.reviewed_at IS NOT NULL
        OR NEW.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'New listings must begin as seller-declared and unverified';
      END IF;
    END IF;
  ELSE
    IF NOT is_internal_write THEN
      IF NEW.seller_id <> OLD.seller_id THEN
        RAISE EXCEPTION 'A listing seller cannot be changed';
      END IF;
      IF NEW.ownership_verification_status IS DISTINCT FROM OLD.ownership_verification_status
        OR NEW.ownership_verified_at IS DISTINCT FROM OLD.ownership_verified_at
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'Verification and publication fields are server-managed';
      END IF;
      IF NEW.domain IS DISTINCT FROM OLD.domain THEN
        PERFORM public.marketplace_expire_open_control_proofs(OLD.id);
        NEW.status := 'seller_declared';
        NEW.ownership_verification_status := 'not_requested';
        NEW.ownership_verified_at := NULL;
        NEW.reviewed_at := NULL;
        NEW.published_at := NULL;
      ELSIF NEW.status NOT IN ('seller_declared', 'paused', 'withdrawn') THEN
        RAISE EXCEPTION 'Sellers may only pause or withdraw a listing after creation';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'active' THEN
    IF NEW.ownership_verification_status <> 'verified' OR NEW.ownership_verified_at IS NULL THEN
      RAISE EXCEPTION 'An active marketplace listing requires a verified domain-control proof';
    END IF;
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_prepare_domain_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_record public.marketplace_domain_listings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated buyer is required';
  END IF;
  IF NEW.buyer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Offers must belong to the authenticated buyer';
  END IF;

  SELECT * INTO listing_record
  FROM public.marketplace_domain_listings
  WHERE id = NEW.listing_id;

  IF NOT FOUND
    OR listing_record.status <> 'active'
    OR listing_record.ownership_verification_status <> 'verified'
    OR (listing_record.expires_at IS NOT NULL AND listing_record.expires_at <= now()) THEN
    RAISE EXCEPTION 'This listing is not open for offers';
  END IF;
  IF listing_record.seller_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'A seller cannot make an offer on their own listing';
  END IF;

  NEW.seller_id := listing_record.seller_id;
  NEW.currency := listing_record.currency;
  NEW.status := 'submitted';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_guard_offer_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  is_service_write boolean := auth.role() = 'service_role';
BEGIN
  IF is_service_write THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id <> OLD.listing_id
    OR NEW.buyer_id <> OLD.buyer_id
    OR NEW.seller_id <> OLD.seller_id
    OR NEW.amount <> OLD.amount
    OR NEW.currency <> OLD.currency
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Offers are immutable except for their status';
  END IF;

  IF auth.uid() = OLD.buyer_id THEN
    IF OLD.status <> 'submitted' OR NEW.status <> 'withdrawn' THEN
      RAISE EXCEPTION 'A buyer may only withdraw a submitted offer';
    END IF;
  ELSIF auth.uid() = OLD.seller_id THEN
    IF OLD.status <> 'submitted' OR NEW.status NOT IN ('accepted', 'declined') THEN
      RAISE EXCEPTION 'A seller may only accept or decline a submitted offer';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only the offer buyer or seller may update this offer';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_audit_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audit_event := 'listing.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    audit_event := 'listing.status_changed';
  ELSE
    audit_event := 'listing.updated';
  END IF;

  INSERT INTO public.marketplace_audit_events (
    listing_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    NEW.id,
    auth.uid(),
    audit_event,
    jsonb_build_object(
      'domain', NEW.domain,
      'status', NEW.status,
      'verification_status', NEW.ownership_verification_status,
      'currency', NEW.currency,
      'asking_price', NEW.asking_price
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_audit_proof_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audit_event := 'proof.issued';
  ELSIF NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    audit_event := 'proof.submitted';
  ELSIF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM NEW.status THEN
    audit_event := 'proof.verified';
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
    audit_event := 'proof.rejected';
  ELSIF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM NEW.status THEN
    audit_event := 'proof.expired';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.marketplace_audit_events (
    listing_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    NEW.listing_id,
    auth.uid(),
    audit_event,
    jsonb_build_object('proof_id', NEW.id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_audit_offer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audit_event := 'offer.submitted';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    audit_event := 'offer.status_changed';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.marketplace_audit_events (
    listing_id,
    offer_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    NEW.listing_id,
    NEW.id,
    auth.uid(),
    audit_event,
    jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'currency', NEW.currency)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_marketplace_guard_listing_write ON public.marketplace_domain_listings;
CREATE TRIGGER a_marketplace_guard_listing_write
  BEFORE INSERT OR UPDATE ON public.marketplace_domain_listings
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_guard_listing_write();

DROP TRIGGER IF EXISTS a_marketplace_prepare_domain_offer ON public.marketplace_domain_offers;
CREATE TRIGGER a_marketplace_prepare_domain_offer
  BEFORE INSERT ON public.marketplace_domain_offers
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_prepare_domain_offer();

DROP TRIGGER IF EXISTS a_marketplace_guard_offer_update ON public.marketplace_domain_offers;
CREATE TRIGGER a_marketplace_guard_offer_update
  BEFORE UPDATE ON public.marketplace_domain_offers
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_guard_offer_update();

DROP TRIGGER IF EXISTS b_marketplace_audit_listing_change ON public.marketplace_domain_listings;
CREATE TRIGGER b_marketplace_audit_listing_change
  AFTER INSERT OR UPDATE ON public.marketplace_domain_listings
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_audit_listing_change();

DROP TRIGGER IF EXISTS b_marketplace_audit_proof_change ON public.marketplace_domain_control_proofs;
CREATE TRIGGER b_marketplace_audit_proof_change
  AFTER INSERT OR UPDATE ON public.marketplace_domain_control_proofs
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_audit_proof_change();

DROP TRIGGER IF EXISTS b_marketplace_audit_offer_change ON public.marketplace_domain_offers;
CREATE TRIGGER b_marketplace_audit_offer_change
  AFTER INSERT OR UPDATE ON public.marketplace_domain_offers
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_audit_offer_change();

DROP TRIGGER IF EXISTS z_marketplace_seller_profiles_updated_at ON public.marketplace_seller_profiles;
CREATE TRIGGER z_marketplace_seller_profiles_updated_at
  BEFORE UPDATE ON public.marketplace_seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS z_marketplace_domain_listings_updated_at ON public.marketplace_domain_listings;
CREATE TRIGGER z_marketplace_domain_listings_updated_at
  BEFORE UPDATE ON public.marketplace_domain_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS z_marketplace_domain_control_proofs_updated_at ON public.marketplace_domain_control_proofs;
CREATE TRIGGER z_marketplace_domain_control_proofs_updated_at
  BEFORE UPDATE ON public.marketplace_domain_control_proofs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS z_marketplace_domain_offers_updated_at ON public.marketplace_domain_offers;
CREATE TRIGGER z_marketplace_domain_offers_updated_at
  BEFORE UPDATE ON public.marketplace_domain_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A seller obtains an expiring DNS-TXT challenge through this RPC. The token
-- is never readable through the public listing view and never acts as a
-- registrar password or transfer authorization code.
CREATE OR REPLACE FUNCTION public.begin_marketplace_domain_control_proof(p_listing_id uuid)
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  challenge_record text,
  challenge_token text,
  status public.marketplace_domain_control_proof_status,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_record public.marketplace_domain_listings%ROWTYPE;
  proof_record public.marketplace_domain_control_proofs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated seller is required';
  END IF;

  SELECT * INTO listing_record
  FROM public.marketplace_domain_listings
  WHERE marketplace_domain_listings.id = p_listing_id;

  IF NOT FOUND OR listing_record.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'Listing not found for the authenticated seller';
  END IF;
  IF listing_record.status IN ('withdrawn', 'sold', 'rejected') THEN
    RAISE EXCEPTION 'A withdrawn, sold, or rejected listing cannot request a control proof';
  END IF;

  PERFORM set_config('app.marketplace_internal_write', 'true', true);
  PERFORM public.marketplace_expire_open_control_proofs(p_listing_id);

  INSERT INTO public.marketplace_domain_control_proofs (
    listing_id,
    seller_id,
    challenge_record,
    challenge_token,
    status,
    expires_at
  ) VALUES (
    listing_record.id,
    listing_record.seller_id,
    '_sajda.' || listing_record.domain,
    replace(gen_random_uuid()::text, '-', ''),
    'challenge_issued',
    now() + interval '24 hours'
  )
  RETURNING * INTO proof_record;

  UPDATE public.marketplace_domain_listings
  SET status = 'proof_pending',
      ownership_verification_status = 'challenge_issued',
      ownership_verified_at = NULL,
      reviewed_at = NULL,
      published_at = NULL
  WHERE id = listing_record.id;

  RETURN QUERY
  SELECT
    proof_record.id,
    proof_record.listing_id,
    proof_record.challenge_record,
    proof_record.challenge_token,
    proof_record.status,
    proof_record.expires_at,
    proof_record.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_marketplace_domain_control_proof(p_proof_id uuid)
RETURNS public.marketplace_domain_control_proof_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proof_record public.marketplace_domain_control_proofs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated seller is required';
  END IF;

  SELECT * INTO proof_record
  FROM public.marketplace_domain_control_proofs
  WHERE id = p_proof_id;
  IF NOT FOUND OR proof_record.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'Control proof not found for the authenticated seller';
  END IF;
  IF proof_record.status <> 'challenge_issued' THEN
    RAISE EXCEPTION 'Only an issued challenge can be submitted';
  END IF;
  IF proof_record.expires_at <= now() THEN
    UPDATE public.marketplace_domain_control_proofs
    SET status = 'expired',
        updated_at = now()
    WHERE id = proof_record.id;
    RETURN 'expired';
  END IF;

  PERFORM set_config('app.marketplace_internal_write', 'true', true);
  UPDATE public.marketplace_domain_control_proofs
  SET status = 'submitted',
      submitted_at = now()
  WHERE id = proof_record.id;
  UPDATE public.marketplace_domain_listings
  SET status = 'under_review',
      ownership_verification_status = 'pending_review'
  WHERE id = proof_record.listing_id;

  RETURN 'submitted';
END;
$$;

-- Server-only completion hook. A verifier must check the expected TXT record
-- before calling this RPC. `p_publish = false` leaves the verified listing in
-- under_review; set it true only after the operator's publication decision.
CREATE OR REPLACE FUNCTION public.record_marketplace_domain_control_result(
  p_proof_id uuid,
  p_verified boolean,
  p_publish boolean DEFAULT false,
  p_verifier_note text DEFAULT NULL
)
RETURNS public.marketplace_listing_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proof_record public.marketplace_domain_control_proofs%ROWTYPE;
  next_status public.marketplace_listing_status;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the server-side marketplace verifier may record a proof result';
  END IF;
  IF p_verifier_note IS NOT NULL AND char_length(p_verifier_note) > 500 THEN
    RAISE EXCEPTION 'Verifier note is too long';
  END IF;

  SELECT * INTO proof_record
  FROM public.marketplace_domain_control_proofs
  WHERE id = p_proof_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Control proof not found';
  END IF;
  IF proof_record.status NOT IN ('challenge_issued', 'submitted') THEN
    RAISE EXCEPTION 'Control proof is not awaiting verification';
  END IF;

  PERFORM set_config('app.marketplace_internal_write', 'true', true);
  IF proof_record.expires_at <= now() THEN
    UPDATE public.marketplace_domain_control_proofs
    SET status = 'expired',
        checked_at = now(),
        verifier_note = COALESCE(p_verifier_note, 'Control challenge expired')
    WHERE id = proof_record.id;
    UPDATE public.marketplace_domain_listings
    SET status = 'seller_declared',
        ownership_verification_status = 'expired',
        ownership_verified_at = NULL,
        reviewed_at = now(),
        published_at = NULL
    WHERE id = proof_record.listing_id;
    RETURN 'seller_declared';
  END IF;

  IF p_verified THEN
    next_status := CASE WHEN p_publish THEN 'active' ELSE 'under_review' END;
    UPDATE public.marketplace_domain_control_proofs
    SET status = 'verified',
        checked_at = now(),
        verified_at = now(),
        verifier_note = p_verifier_note
    WHERE id = proof_record.id;
    UPDATE public.marketplace_domain_listings
    SET status = next_status,
        ownership_verification_status = 'verified',
        ownership_verified_at = now(),
        reviewed_at = now(),
        published_at = CASE WHEN p_publish THEN now() ELSE NULL END
    WHERE id = proof_record.listing_id;
    RETURN next_status;
  END IF;

  UPDATE public.marketplace_domain_control_proofs
  SET status = 'rejected',
      checked_at = now(),
      rejected_at = now(),
      verifier_note = p_verifier_note
  WHERE id = proof_record.id;
  UPDATE public.marketplace_domain_listings
  SET status = 'seller_declared',
      ownership_verification_status = 'rejected',
      ownership_verified_at = NULL,
      reviewed_at = now(),
      published_at = NULL
  WHERE id = proof_record.listing_id;
  RETURN 'seller_declared';
END;
$$;

REVOKE ALL ON FUNCTION public.begin_marketplace_domain_control_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_marketplace_domain_control_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_marketplace_domain_control_result(uuid, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marketplace_guard_listing_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_prepare_domain_offer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_guard_offer_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_audit_listing_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_audit_proof_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_audit_offer_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_marketplace_domain_control_proof(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_domain_control_proof(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_domain_control_result(uuid, boolean, boolean, text) TO service_role;

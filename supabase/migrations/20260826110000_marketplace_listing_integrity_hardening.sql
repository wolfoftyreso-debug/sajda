-- Marketplace listing integrity hardening.
--
-- A DNS record can prove control of a hostname delegated below a domain, but
-- that does not make the hostname a transferable registration asset. Sajda
-- marketplace listings therefore accept only an apex registrable domain under
-- a supported public suffix. The browser validates early; these database
-- guards remain the authority for every write and publication path.
--
-- Seller-declared drafts intentionally do not reserve a name. The exclusive
-- reservation starts only when a verified listing is active (or a verified
-- listing is paused), which keeps an unverified draft from squatting a domain.

CREATE TABLE IF NOT EXISTS public.marketplace_registrable_suffixes (
  suffix text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_registrable_suffixes_normalized_check
    CHECK (
      suffix = lower(btrim(suffix))
      AND suffix ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$'
    )
);

ALTER TABLE public.marketplace_registrable_suffixes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_registrable_suffixes FROM anon, authenticated;

-- Keep this seed aligned with src/lib/marketplaceDomain.ts. Operators can add
-- an approved public suffix through a reviewed migration before exposing it
-- in the seller interface.
INSERT INTO public.marketplace_registrable_suffixes (suffix)
VALUES
  ('ac.nz'), ('ac.uk'), ('ac.jp'), ('ac.za'), ('ae'), ('ai'), ('app'), ('ar'), ('art'), ('asia'), ('at'), ('au'),
  ('be'), ('biz'), ('blog'), ('br'), ('ca'), ('ch'), ('chat'), ('city'), ('click'), ('cl'), ('club'), ('cloud'), ('cn'),
  ('co'), ('co.in'), ('co.jp'), ('co.ke'), ('co.nz'), ('co.uk'), ('co.za'), ('com'), ('com.ar'), ('com.au'), ('com.br'),
  ('com.cn'), ('com.co'), ('com.es'), ('com.hk'), ('com.mx'), ('com.my'), ('com.ng'), ('com.pe'), ('com.ph'), ('com.pk'),
  ('com.sa'), ('com.sg'), ('com.tr'), ('com.tw'), ('com.ua'), ('com.uy'), ('com.ve'), ('company'), ('consulting'), ('de'),
  ('design'), ('dev'), ('digital'), ('dk'), ('domains'), ('edu.au'), ('edu.cn'), ('edu.es'), ('edu.in'), ('email'), ('es'),
  ('eu'), ('events'), ('finance'), ('firm.in'), ('fi'), ('fr'), ('fun'), ('games'), ('gen.in'), ('global'), ('gov.au'), ('gov.cn'),
  ('govt.nz'), ('gr'), ('group'), ('hk'), ('id'), ('id.au'), ('ie'), ('in'), ('info'), ('io'), ('is'), ('it'), ('jp'), ('ke'),
  ('kr'), ('link'), ('live'), ('lt'), ('lu'), ('lv'), ('market'), ('media'), ('me'), ('mobi'), ('mx'), ('my'), ('name'), ('net'),
  ('net.au'), ('net.br'), ('net.cn'), ('net.in'), ('net.nz'), ('net.za'), ('network'), ('news'), ('ng'), ('nl'), ('no'), ('nu'),
  ('nz'), ('online'), ('org'), ('org.au'), ('org.br'), ('org.cn'), ('org.es'), ('org.in'), ('org.nz'), ('org.uk'), ('org.za'),
  ('pe'), ('ph'), ('pk'), ('pl'), ('pro'), ('pt'), ('qa'), ('ro'), ('ru'), ('sa'), ('se'), ('sg'), ('shop'), ('site'), ('sk'),
  ('software'), ('space'), ('store'), ('studio'), ('systems'), ('tech'), ('tel'), ('th'), ('today'), ('tools'), ('top'), ('tr'),
  ('travel'), ('tw'), ('ua'), ('uk'), ('us'), ('ve'), ('vip'), ('vn'), ('website'), ('works'), ('world'), ('xyz'), ('za')
ON CONFLICT (suffix) DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketplace_is_registrable_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_domain text := lower(btrim(COALESCE(p_domain, '')));
  matched_suffix text;
  label_count integer;
  suffix_label_count integer;
BEGIN
  IF normalized_domain !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' THEN
    RETURN false;
  END IF;

  SELECT suffix
  INTO matched_suffix
  FROM public.marketplace_registrable_suffixes
  WHERE normalized_domain LIKE '%.' || suffix
  ORDER BY char_length(suffix) DESC
  LIMIT 1;

  IF matched_suffix IS NULL THEN
    RETURN false;
  END IF;

  label_count := array_length(string_to_array(normalized_domain, '.'), 1);
  suffix_label_count := array_length(string_to_array(matched_suffix, '.'), 1);
  RETURN label_count = suffix_label_count + 1;
END;
$$;

-- The predicate is deliberately public: it reveals only whether a supplied
-- string is a supported apex domain; it does not expose marketplace rows.
REVOKE ALL ON FUNCTION public.marketplace_is_registrable_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_is_registrable_domain(text) TO anon, authenticated, service_role;

-- Only live verified assets reserve a domain. This replaces the former broad
-- open-listing index, under which a seller-declared or pending proof could
-- block another seller indefinitely without ever establishing control.
DROP INDEX IF EXISTS public.marketplace_domain_listings_open_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_domain_listings_verified_asset_key
  ON public.marketplace_domain_listings (lower(domain))
  WHERE status = 'active'
    OR (status = 'paused' AND ownership_verification_status = 'verified');

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
  -- Do not turn hostnames into an advertised transferable asset. Existing
  -- invalid rows may still be withdrawn or corrected, but cannot be drafted,
  -- verified, or published again.
  IF NOT public.marketplace_is_registrable_domain(NEW.domain)
    AND (TG_OP = 'INSERT' OR NEW.status NOT IN ('withdrawn', 'sold', 'rejected')) THEN
    RAISE EXCEPTION 'Marketplace listings must use a supported registrable apex domain, not a hostname or subdomain';
  END IF;

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
  AND public.marketplace_is_registrable_domain(domain)
  AND (expires_at IS NULL OR expires_at > now());

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
    OR NOT public.marketplace_is_registrable_domain(listing_record.domain)
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
  IF NOT public.marketplace_is_registrable_domain(listing_record.domain) THEN
    RAISE EXCEPTION 'Only a supported registrable apex domain can request a control proof';
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
  listing_record public.marketplace_domain_listings%ROWTYPE;
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

  SELECT * INTO listing_record
  FROM public.marketplace_domain_listings
  WHERE id = proof_record.listing_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.marketplace_is_registrable_domain(listing_record.domain) THEN
    RAISE EXCEPTION 'Only a supported registrable apex domain can be verified or published';
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

REVOKE ALL ON FUNCTION public.marketplace_guard_listing_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_prepare_domain_offer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_marketplace_domain_control_proof(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_marketplace_domain_control_result(uuid, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_marketplace_domain_control_proof(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_domain_control_result(uuid, boolean, boolean, text) TO service_role;

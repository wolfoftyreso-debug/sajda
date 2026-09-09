-- Add valuation columns to user_domains
ALTER TABLE public.user_domains 
ADD COLUMN estimated_value numeric,
ADD COLUMN confidence_score integer,
ADD COLUMN valuation_rationale text,
ADD COLUMN valued_at timestamp with time zone;
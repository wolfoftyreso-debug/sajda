-- Create table for domain search history
CREATE TABLE public.domain_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  tld VARCHAR(20) NOT NULL,
  registrar_price NUMERIC(10, 2) NOT NULL,
  estimated_value NUMERIC(10, 2) NOT NULL,
  confidence_score INTEGER NOT NULL,
  rationale TEXT,
  registrar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.domain_history ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert (no auth required for domain search)
CREATE POLICY "Anyone can view domain history" 
ON public.domain_history 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert domain history" 
ON public.domain_history 
FOR INSERT 
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_domain_history_created_at ON public.domain_history(created_at DESC);
CREATE INDEX idx_domain_history_domain ON public.domain_history(domain);
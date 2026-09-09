-- Create table for daily top 10 domains
CREATE TABLE public.daily_top_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  estimated_value NUMERIC NOT NULL,
  confidence_score INTEGER NOT NULL,
  rationale TEXT,
  registrar_price NUMERIC NOT NULL,
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 10)
);

-- Enable Row Level Security
ALTER TABLE public.daily_top_domains ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (everyone can see top 10)
CREATE POLICY "Anyone can view daily top domains" 
ON public.daily_top_domains 
FOR SELECT 
USING (true);

-- Create index for efficient date lookups
CREATE INDEX idx_daily_top_domains_scan_date ON public.daily_top_domains(scan_date);

-- Create unique constraint to prevent duplicate ranks per day
CREATE UNIQUE INDEX idx_daily_top_domains_unique_rank ON public.daily_top_domains(scan_date, rank);
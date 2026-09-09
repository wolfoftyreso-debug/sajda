-- Create the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table to track ongoing scans
CREATE TABLE public.user_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  scan_mode TEXT NOT NULL DEFAULT 'medium',
  selected_tlds TEXT[] NOT NULL DEFAULT '{}',
  search_keyword TEXT,
  total_domains_scanned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create table for scan results
CREATE TABLE public.scan_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.user_scans(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  tld TEXT NOT NULL,
  registrar_price NUMERIC NOT NULL,
  estimated_value NUMERIC NOT NULL DEFAULT 0,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  registrar_url TEXT,
  check_method TEXT,
  model_count INTEGER DEFAULT 0,
  is_valuated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_scans
CREATE POLICY "Users can view their own scans" 
ON public.user_scans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scans" 
ON public.user_scans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scans" 
ON public.user_scans FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scans" 
ON public.user_scans FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for scan_results
CREATE POLICY "Users can view their scan results" 
ON public.scan_results FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.user_scans WHERE user_scans.id = scan_results.scan_id AND user_scans.user_id = auth.uid()));

CREATE POLICY "Users can insert scan results" 
ON public.scan_results FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.user_scans WHERE user_scans.id = scan_results.scan_id AND user_scans.user_id = auth.uid()));

-- Create indexes
CREATE INDEX idx_user_scans_user_id ON public.user_scans(user_id);
CREATE INDEX idx_user_scans_status ON public.user_scans(status);
CREATE INDEX idx_scan_results_scan_id ON public.scan_results(scan_id);
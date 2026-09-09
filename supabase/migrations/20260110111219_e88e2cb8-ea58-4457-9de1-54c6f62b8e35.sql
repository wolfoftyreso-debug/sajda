-- Create registrar_settings table for domain provider configurations
CREATE TABLE public.registrar_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registrar_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Scraping settings
  scrape_interval_minutes INTEGER DEFAULT 60,
  rate_limit_per_minute INTEGER DEFAULT 30,
  max_concurrent_requests INTEGER DEFAULT 5,
  
  -- Price filters
  min_price NUMERIC DEFAULT 0,
  max_price NUMERIC DEFAULT 50,
  
  -- Value thresholds
  min_estimated_value NUMERIC DEFAULT 100,
  value_to_price_ratio NUMERIC DEFAULT 5.0,
  
  -- Algorithm tuning
  priority_weight NUMERIC DEFAULT 1.0,
  confidence_threshold INTEGER DEFAULT 60,
  
  -- TLD preferences (JSON array of preferred TLDs)
  preferred_tlds JSONB DEFAULT '["com", "net", "org"]'::jsonb,
  excluded_patterns JSONB DEFAULT '[]'::jsonb,
  
  -- Status tracking
  last_scrape_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  total_domains_found INTEGER DEFAULT 0,
  total_gems_found INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registrar_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can manage
CREATE POLICY "Admins can view registrar settings"
ON public.registrar_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert registrar settings"
ON public.registrar_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update registrar settings"
ON public.registrar_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete registrar settings"
ON public.registrar_settings
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_registrar_settings_updated_at
BEFORE UPDATE ON public.registrar_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some common registrars as defaults
INSERT INTO public.registrar_settings (registrar_name, display_name, notes) VALUES
  ('namecheap', 'Namecheap', 'Populär för billiga .com-domäner'),
  ('godaddy', 'GoDaddy', 'Stor marknadsandel, många auktioner'),
  ('porkbun', 'Porkbun', 'Bra priser, utvecklarvänlig'),
  ('cloudflare', 'Cloudflare Registrar', 'At-cost pricing'),
  ('dynadot', 'Dynadot', 'Bra för bulk-registreringar'),
  ('google_domains', 'Google Domains', 'Enkelt interface, nu del av Squarespace');
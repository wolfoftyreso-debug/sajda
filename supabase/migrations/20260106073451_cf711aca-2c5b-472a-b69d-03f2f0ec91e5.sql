-- Create table for user-owned domains
CREATE TABLE public.user_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  purchase_price NUMERIC,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);

-- Enable RLS
ALTER TABLE public.user_domains ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_domains
CREATE POLICY "Users can view own domains"
ON public.user_domains FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domains"
ON public.user_domains FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domains"
ON public.user_domains FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own domains"
ON public.user_domains FOR DELETE
USING (auth.uid() = user_id);
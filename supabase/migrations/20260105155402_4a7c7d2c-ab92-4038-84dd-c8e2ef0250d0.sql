-- Create watchlist table for saved domains
CREATE TABLE public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  registrar_price INTEGER NOT NULL,
  estimated_value INTEGER NOT NULL,
  confidence_score INTEGER NOT NULL,
  rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate domains per user
  UNIQUE(user_id, domain)
);

-- Enable Row Level Security
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- Users can only view their own watchlist
CREATE POLICY "Users can view their own watchlist"
ON public.watchlist
FOR SELECT
USING (auth.uid() = user_id);

-- Users can add to their own watchlist
CREATE POLICY "Users can add to their own watchlist"
ON public.watchlist
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can remove from their own watchlist
CREATE POLICY "Users can delete from their own watchlist"
ON public.watchlist
FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_watchlist_user_id ON public.watchlist(user_id);
CREATE INDEX idx_watchlist_domain ON public.watchlist(domain);
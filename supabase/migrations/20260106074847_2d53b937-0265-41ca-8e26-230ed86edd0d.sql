-- Add hosting and is_live columns to user_domains
ALTER TABLE public.user_domains 
ADD COLUMN hosting text,
ADD COLUMN is_live boolean DEFAULT false;
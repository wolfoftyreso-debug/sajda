-- Add category/purpose column to user_domains
ALTER TABLE public.user_domains 
ADD COLUMN category text DEFAULT NULL;
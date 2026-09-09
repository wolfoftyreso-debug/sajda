-- Add columns to track if a website is published on the domain
ALTER TABLE public.user_domains 
ADD COLUMN has_website boolean DEFAULT NULL,
ADD COLUMN website_checked_at timestamp with time zone DEFAULT NULL;
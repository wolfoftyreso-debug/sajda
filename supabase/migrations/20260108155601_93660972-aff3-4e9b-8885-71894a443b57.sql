-- Enable realtime for scan tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_results;
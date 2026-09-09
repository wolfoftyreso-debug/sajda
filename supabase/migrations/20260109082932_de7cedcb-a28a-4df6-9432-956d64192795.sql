-- Allow authenticated users to delete from daily_top_domains
CREATE POLICY "Authenticated users can delete daily top domains"
ON public.daily_top_domains
FOR DELETE
TO authenticated
USING (true);

-- Allow authenticated users to delete their own scan results
CREATE POLICY "Users can delete their scan results"
ON public.scan_results
FOR DELETE
USING (EXISTS (
  SELECT 1
  FROM user_scans
  WHERE user_scans.id = scan_results.scan_id
  AND user_scans.user_id = auth.uid()
));
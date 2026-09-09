import { supabase } from "@/integrations/supabase/client";

export interface RegistrarSettings {
  id: string;
  registrar_name: string;
  display_name: string;
  is_enabled: boolean;
  
  // Scraping settings
  scrape_interval_minutes: number;
  rate_limit_per_minute: number;
  max_concurrent_requests: number;
  
  // Price filters
  min_price: number;
  max_price: number;
  
  // Value thresholds
  min_estimated_value: number;
  value_to_price_ratio: number;
  
  // Algorithm tuning
  priority_weight: number;
  confidence_threshold: number;
  
  // TLD preferences
  preferred_tlds: string[];
  excluded_patterns: string[];
  
  // Status tracking
  last_scrape_at: string | null;
  last_success_at: string | null;
  total_domains_found: number;
  total_gems_found: number;
  success_rate: number;
  
  // Notes
  notes: string | null;
  
  created_at: string;
  updated_at: string;
}

export async function getRegistrarSettings(): Promise<RegistrarSettings[]> {
  const { data, error } = await supabase
    .from('registrar_settings')
    .select('*')
    .order('priority_weight', { ascending: false });

  if (error) {
    console.error('Error fetching registrar settings:', error);
    throw error;
  }

  return (data || []).map(item => ({
    ...item,
    preferred_tlds: item.preferred_tlds || [],
    excluded_patterns: item.excluded_patterns || []
  })) as RegistrarSettings[];
}

export async function updateRegistrarSettings(
  id: string, 
  updates: Partial<RegistrarSettings>
): Promise<void> {
  const { error } = await supabase
    .from('registrar_settings')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating registrar settings:', error);
    throw error;
  }
}

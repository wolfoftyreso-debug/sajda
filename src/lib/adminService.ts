import { supabase } from "@/integrations/supabase/client";

export interface ModelAdapter {
  id: string;
  model_name: string;
  display_name: string;
  weight: number;
  is_enabled: boolean;
  calibration_offset: number;
  confidence_multiplier: number;
  historical_accuracy: number | null;
  total_evaluations: number;
  drift_threshold: number;
  last_drift_check: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionSetting {
  id: string;
  setting_key: string;
  setting_value: { value: DecisionSettingValue };
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

export type DecisionSettingValue = boolean | number | string | null;

export async function checkIsAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (error) {
    console.error('Error checking admin status:', error);
    return false;
  }

  return !!data;
}

export async function getModelAdapters(): Promise<ModelAdapter[]> {
  const { data, error } = await supabase
    .from('model_adapters')
    .select('*')
    .order('weight', { ascending: false });

  if (error) {
    console.error('Error fetching model adapters:', error);
    throw error;
  }

  return (data || []) as ModelAdapter[];
}

export async function updateModelAdapter(id: string, updates: Partial<ModelAdapter>): Promise<void> {
  const { error } = await supabase
    .from('model_adapters')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating model adapter:', error);
    throw error;
  }
}

export async function getDecisionSettings(): Promise<DecisionSetting[]> {
  const { data, error } = await supabase
    .from('decision_settings')
    .select('*')
    .order('category', { ascending: true });

  if (error) {
    console.error('Error fetching decision settings:', error);
    throw error;
  }

  return (data || []) as DecisionSetting[];
}

export async function updateDecisionSetting(id: string, value: DecisionSettingValue): Promise<void> {
  const { error } = await supabase
    .from('decision_settings')
    .update({ setting_value: { value } })
    .eq('id', id);

  if (error) {
    console.error('Error updating decision setting:', error);
    throw error;
  }
}

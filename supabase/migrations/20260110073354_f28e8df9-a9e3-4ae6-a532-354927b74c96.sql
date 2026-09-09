-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Model adapters table for AI model configuration
CREATE TABLE public.model_adapters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name text NOT NULL UNIQUE,
    display_name text NOT NULL,
    weight numeric NOT NULL DEFAULT 1.0,
    is_enabled boolean NOT NULL DEFAULT true,
    calibration_offset numeric DEFAULT 0,
    confidence_multiplier numeric DEFAULT 1.0,
    historical_accuracy numeric DEFAULT NULL,
    total_evaluations integer DEFAULT 0,
    drift_threshold numeric DEFAULT 0.15,
    last_drift_check timestamp with time zone DEFAULT NULL,
    notes text DEFAULT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on model_adapters
ALTER TABLE public.model_adapters ENABLE ROW LEVEL SECURITY;

-- Anyone can view model adapters (needed for edge functions)
CREATE POLICY "Anyone can view model adapters"
ON public.model_adapters FOR SELECT
USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert model adapters"
ON public.model_adapters FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update model adapters"
ON public.model_adapters FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete model adapters"
ON public.model_adapters FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Decision settings table
CREATE TABLE public.decision_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key text NOT NULL UNIQUE,
    setting_value jsonb NOT NULL DEFAULT '{}',
    description text DEFAULT NULL,
    category text DEFAULT 'general',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.decision_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can view settings (needed for edge functions)
CREATE POLICY "Anyone can view decision settings"
ON public.decision_settings FOR SELECT
USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert decision settings"
ON public.decision_settings FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update decision settings"
ON public.decision_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete decision settings"
ON public.decision_settings FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Model evaluation history for drift detection
CREATE TABLE public.model_evaluation_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name text NOT NULL,
    domain text NOT NULL,
    predicted_value numeric NOT NULL,
    confidence_score integer NOT NULL,
    actual_outcome numeric DEFAULT NULL,
    evaluation_date timestamp with time zone NOT NULL DEFAULT now(),
    signals_used jsonb DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.model_evaluation_history ENABLE ROW LEVEL SECURITY;

-- Admins can view history
CREATE POLICY "Admins can view evaluation history"
ON public.model_evaluation_history FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (from edge functions)
CREATE POLICY "Anyone can insert evaluation history"
ON public.model_evaluation_history FOR INSERT
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_model_adapters_updated_at
BEFORE UPDATE ON public.model_adapters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_decision_settings_updated_at
BEFORE UPDATE ON public.decision_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default model adapters
INSERT INTO public.model_adapters (model_name, display_name, weight, is_enabled) VALUES
('openai/gpt-5', 'OpenAI GPT-5', 1.5, true),
('openai/gpt-5-mini', 'OpenAI GPT-5 Mini', 1.2, true),
('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 1.5, true),
('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 1.0, true),
('google/gemini-3-flash-preview', 'Gemini 3 Flash', 1.3, true);

-- Insert default decision settings
INSERT INTO public.decision_settings (setting_key, setting_value, description, category) VALUES
('min_confidence_threshold', '{"value": 60}', 'Minimum confidence score to consider a valuation reliable', 'valuation'),
('drift_detection_enabled', '{"value": true}', 'Enable automatic drift detection for model adapters', 'system'),
('max_models_per_scan', '{"value": 3}', 'Maximum number of models to use per valuation scan', 'valuation'),
('anomaly_sensitivity', '{"value": 0.2}', 'Sensitivity threshold for anomaly detection (0-1)', 'system'),
('value_aggregation_method', '{"value": "weighted_average"}', 'Method for aggregating multi-model valuations', 'valuation');
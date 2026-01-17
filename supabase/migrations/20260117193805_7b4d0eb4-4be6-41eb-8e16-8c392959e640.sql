-- Create enum for feature status
CREATE TYPE public.feature_status AS ENUM ('disabled', 'staging', 'deployed');

-- Create feature flags table
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status feature_status NOT NULL DEFAULT 'disabled',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read feature flags (needed to check access)
CREATE POLICY "Anyone can read feature flags"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (true);

-- Only admins can manage feature flags
CREATE POLICY "Admins can insert feature flags"
ON public.feature_flags
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update feature flags"
ON public.feature_flags
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete feature flags"
ON public.feature_flags
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default feature flags
INSERT INTO public.feature_flags (name, description, status) VALUES
  ('ai_assistant', 'AI-powered deal assistant', 'deployed'),
  ('workflow_automation', 'Automated workflow triggers', 'deployed'),
  ('advanced_analytics', 'Advanced analytics dashboard', 'staging'),
  ('flex_integration', 'Flex platform integration', 'deployed');
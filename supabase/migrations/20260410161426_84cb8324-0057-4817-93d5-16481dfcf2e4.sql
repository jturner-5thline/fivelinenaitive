
-- Create a platform-wide settings table for global configuration
CREATE TABLE public.platform_settings (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read platform settings
CREATE POLICY "All authenticated users can read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admins and company admins can update platform settings
CREATE POLICY "Admins can manage platform settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (
  public.is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  public.is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Seed the default visible tabs (all tabs visible)
INSERT INTO public.platform_settings (key, value)
VALUES (
  'analysis_visible_tabs',
  '["dashboard","income-statement","balance-sheet","data-mapping","sensitivity","debt-servicing","credit-analysis","monte-carlo","export"]'::jsonb
);

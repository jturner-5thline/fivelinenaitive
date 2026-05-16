
CREATE TABLE IF NOT EXISTS public.ai_copilot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  system_prompt_override text NOT NULL DEFAULT '',
  tone_override text,
  default_report_template text NOT NULL DEFAULT '',
  tools_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_copilot_config ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a 5th Line internal admin?
CREATE OR REPLACE FUNCTION public.is_fifth_line_internal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE u.id = auth.uid()
      AND (
        lower(u.email) LIKE '%@5thline.co'
        OR lower(u.email) LIKE '%@naitive.co'
      )
  );
$$;

-- Read: any member of the company can read their workspace's row.
CREATE POLICY "Members can read their workspace copilot config"
ON public.ai_copilot_config
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = ai_copilot_config.company_id
      AND cm.user_id = auth.uid()
  )
);

-- Write: 5th Line internal admins only.
CREATE POLICY "Internal admins can insert copilot config"
ON public.ai_copilot_config
FOR INSERT
TO authenticated
WITH CHECK (public.is_fifth_line_internal_admin());

CREATE POLICY "Internal admins can update copilot config"
ON public.ai_copilot_config
FOR UPDATE
TO authenticated
USING (public.is_fifth_line_internal_admin())
WITH CHECK (public.is_fifth_line_internal_admin());

CREATE POLICY "Internal admins can delete copilot config"
ON public.ai_copilot_config
FOR DELETE
TO authenticated
USING (public.is_fifth_line_internal_admin());

-- Auto-bump updated_at
CREATE TRIGGER ai_copilot_config_set_updated_at
BEFORE UPDATE ON public.ai_copilot_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

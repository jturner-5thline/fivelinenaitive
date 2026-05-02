CREATE TABLE IF NOT EXISTS public.copilot_deal_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cleared_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_deal_messages_deal_created
  ON public.copilot_deal_messages (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_deal_messages_user
  ON public.copilot_deal_messages (user_id);

ALTER TABLE public.copilot_deal_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_deal_access(_user_id UUID, _deal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = _deal_id
      AND (
        d.user_id = _user_id
        OR public.has_role(_user_id, 'admin'::public.app_role)
        OR (
          d.company_id IS NOT NULL
          AND d.company_id IN (
            SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = _user_id
          )
        )
      )
  );
$$;

CREATE POLICY "View deal AI messages on accessible deals"
ON public.copilot_deal_messages
FOR SELECT
TO authenticated
USING (
  cleared_at IS NULL
  AND public.user_has_deal_access(auth.uid(), deal_id)
);

CREATE POLICY "Insert own deal AI messages on accessible deals"
ON public.copilot_deal_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.user_has_deal_access(auth.uid(), deal_id)
);

CREATE POLICY "Update own deal AI messages"
ON public.copilot_deal_messages
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own deal AI messages"
ON public.copilot_deal_messages
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.deal_ai_settings (
  deal_id UUID NOT NULL PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  data_room_context_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View deal AI settings on accessible deals"
ON public.deal_ai_settings
FOR SELECT
TO authenticated
USING (public.user_has_deal_access(auth.uid(), deal_id));

CREATE POLICY "Insert deal AI settings (admins or deal owner)"
ON public.deal_ai_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_ai_settings.deal_id AND d.user_id = auth.uid())
);

CREATE POLICY "Update deal AI settings (admins or deal owner)"
ON public.deal_ai_settings
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_ai_settings.deal_id AND d.user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_ai_settings.deal_id AND d.user_id = auth.uid())
);

CREATE POLICY "Delete deal AI settings (admins or deal owner)"
ON public.deal_ai_settings
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_ai_settings.deal_id AND d.user_id = auth.uid())
);

CREATE TRIGGER trg_deal_ai_settings_updated_at
BEFORE UPDATE ON public.deal_ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
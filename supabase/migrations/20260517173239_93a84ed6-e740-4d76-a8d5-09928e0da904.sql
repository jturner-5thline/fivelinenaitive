
CREATE TABLE IF NOT EXISTS public.naitive_pipeline_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  field TEXT,
  old_value JSONB,
  new_value JSONB,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npa_entity ON public.naitive_pipeline_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_npa_created_at ON public.naitive_pipeline_audit(created_at DESC);

ALTER TABLE public.naitive_pipeline_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert audit entries"
  ON public.naitive_pipeline_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);

CREATE POLICY "Admins can view audit entries"
  ON public.naitive_pipeline_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

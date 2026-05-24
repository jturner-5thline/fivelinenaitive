CREATE TYPE public.settings_audit_action AS ENUM ('dry_run','apply','undo','deny');

CREATE TABLE public.settings_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  actor_user_id   uuid NOT NULL,
  tool_key        text NOT NULL,
  target_table    text,
  target_column   text,
  diff_id         uuid,
  old_value       jsonb,
  new_value       jsonb,
  action          public.settings_audit_action NOT NULL,
  reason          text,
  source_prompt   text,
  confidence      numeric(4,3),
  undo_token      text,
  applied_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sal_company_created ON public.settings_audit_log (company_id, created_at DESC);
CREATE INDEX idx_sal_diff            ON public.settings_audit_log (diff_id);
CREATE INDEX idx_sal_actor           ON public.settings_audit_log (actor_user_id, created_at DESC);

ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sal_select_company_admins"
  ON public.settings_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "sal_insert_service_only"
  ON public.settings_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);
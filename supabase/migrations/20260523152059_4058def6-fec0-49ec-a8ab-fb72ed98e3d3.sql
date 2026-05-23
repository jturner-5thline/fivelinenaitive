-- Templates for stage-driven meeting / calendar invite titles.
-- One row per (org, stage). stage_id = NULL stores the workspace Default.
CREATE TABLE public.meeting_title_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage_id text,
  template text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One template per (org, stage). NULLs aren't unique by default in postgres,
-- so use a partial unique index to enforce uniqueness for the Default row.
CREATE UNIQUE INDEX uq_meeting_title_templates_org_stage
  ON public.meeting_title_templates (org_company_id, stage_id)
  WHERE stage_id IS NOT NULL;

CREATE UNIQUE INDEX uq_meeting_title_templates_org_default
  ON public.meeting_title_templates (org_company_id)
  WHERE stage_id IS NULL;

ALTER TABLE public.meeting_title_templates ENABLE ROW LEVEL SECURITY;

-- All workspace members can read the templates (so the renderer running in the
-- client can substitute tokens at compose time).
CREATE POLICY "members_read_meeting_title_templates"
  ON public.meeting_title_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = meeting_title_templates.org_company_id
    )
  );

-- Only admins of the workspace can edit/insert/delete.
CREATE POLICY "admins_insert_meeting_title_templates"
  ON public.meeting_title_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = meeting_title_templates.org_company_id
        AND cm.role IN ('owner','admin')
    )
  );

CREATE POLICY "admins_update_meeting_title_templates"
  ON public.meeting_title_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = meeting_title_templates.org_company_id
        AND cm.role IN ('owner','admin')
    )
  );

CREATE POLICY "admins_delete_meeting_title_templates"
  ON public.meeting_title_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = meeting_title_templates.org_company_id
        AND cm.role IN ('owner','admin')
    )
  );

CREATE TRIGGER trg_meeting_title_templates_updated_at
  BEFORE UPDATE ON public.meeting_title_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
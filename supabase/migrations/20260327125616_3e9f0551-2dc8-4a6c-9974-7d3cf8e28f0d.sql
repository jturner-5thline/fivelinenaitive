
CREATE TABLE public.partner_stage_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_stage uuid REFERENCES public.partner_pipeline_stages(id) ON DELETE SET NULL,
  to_stage uuid REFERENCES public.partner_pipeline_stages(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_stage_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage stage notes"
  ON public.partner_stage_notes
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_partner_stage_notes_partner ON public.partner_stage_notes(partner_id, created_at DESC);

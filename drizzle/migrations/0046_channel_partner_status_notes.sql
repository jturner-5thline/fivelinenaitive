CREATE TABLE public.channel_partner_status_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id uuid NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  note text NOT NULL CHECK (length(trim(note)) > 0 AND length(note) <= 5000),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_partner_status_notes_partner_idx ON public.channel_partner_status_notes(channel_partner_id, created_at DESC);
GRANT SELECT, INSERT ON public.channel_partner_status_notes TO authenticated;
GRANT ALL ON public.channel_partner_status_notes TO service_role;
ALTER TABLE public.channel_partner_status_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read partner status notes" ON public.channel_partner_status_notes FOR SELECT TO authenticated
USING (company_id = ANY (public.get_user_company_ids(auth.uid())));
CREATE POLICY "Members add partner status notes" ON public.channel_partner_status_notes FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid()))
  AND created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.channel_partners p WHERE p.id = channel_partner_id AND p.company_id = channel_partner_status_notes.company_id));
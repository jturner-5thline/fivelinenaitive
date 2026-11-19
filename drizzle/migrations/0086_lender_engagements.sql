CREATE TABLE public.lender_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  lender_id uuid NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  crm_company_id uuid,
  deal_id uuid,
  activity_type text NOT NULL,
  subject text,
  body text,
  direction text,
  occurred_at timestamptz NOT NULL,
  source text NOT NULL,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  logged_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.lender_engagements.activity_type IS 'Free text. Expected: email, call, meeting, intro, key_item, submission, pass_feedback, announcement';
COMMENT ON COLUMN public.lender_engagements.source IS 'gmail | claap | gcal | manual';
COMMENT ON COLUMN public.lender_engagements.external_ref IS 'gmail:<message_id> | claap:<recording_id> | gcal:<event_id>';
COMMENT ON COLUMN public.lender_engagements.company_id IS 'Workspace scope; defaults from master_lenders.company_id';

CREATE UNIQUE INDEX lender_engagements_ext_ref_uq ON public.lender_engagements(source, external_ref, lender_id) WHERE external_ref IS NOT NULL;
CREATE INDEX lender_engagements_lender_idx ON public.lender_engagements(lender_id);
CREATE INDEX lender_engagements_contact_idx ON public.lender_engagements(contact_id);
CREATE INDEX lender_engagements_crm_company_idx ON public.lender_engagements(crm_company_id);
CREATE INDEX lender_engagements_occurred_idx ON public.lender_engagements(occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_engagements TO authenticated;
GRANT ALL ON public.lender_engagements TO service_role;
ALTER TABLE public.lender_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view lender engagements" ON public.lender_engagements FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members can create lender engagements" ON public.lender_engagements FOR INSERT TO authenticated
  WITH CHECK (logged_by = auth.uid() AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Authors can update own lender engagements" ON public.lender_engagements FOR UPDATE TO authenticated
  USING (logged_by = auth.uid());
CREATE POLICY "Authors and admins can delete lender engagements" ON public.lender_engagements FOR DELETE TO authenticated
  USING (logged_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.lender_engagements_fill_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.crm_company_id IS NULL OR NEW.company_id IS NULL THEN
    SELECT COALESCE(NEW.crm_company_id, ml.crm_company_id), COALESCE(NEW.company_id, ml.company_id)
      INTO NEW.crm_company_id, NEW.company_id
      FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lender_engagements_fill_links() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lender_engagements_fill_links BEFORE INSERT ON public.lender_engagements
  FOR EACH ROW EXECUTE FUNCTION public.lender_engagements_fill_links();

CREATE VIEW public.lender_met_status WITH (security_invoker = true) AS
WITH eng AS (
  SELECT lender_id,
    min(occurred_at) FILTER (WHERE activity_type IN ('call','meeting')) AS first_met_at,
    max(occurred_at) FILTER (WHERE activity_type IN ('call','meeting')) AS last_met_at,
    count(*) FILTER (WHERE activity_type IN ('call','meeting')) AS call_meeting_count,
    max(occurred_at) AS last_engagement_at,
    bool_or(source = 'claap') AS has_claap,
    bool_or(source = 'gcal') AS has_gcal
  FROM public.lender_engagements GROUP BY lender_id
), eng_threads AS (
  SELECT lender_id, metadata->>'thread_id' AS thread_id, max(occurred_at) AS at
  FROM public.lender_engagements
  WHERE activity_type = 'email' AND metadata ? 'thread_id'
  GROUP BY 1,2 HAVING count(DISTINCT direction) FILTER (WHERE direction IN ('inbound','outbound')) = 2
), imported AS (
  SELECT DISTINCT ON (ca.contact_id, ca.occurred_at, ca.subject)
    lc.lender_id, ca.occurred_at, ca.metadata->>'thread_id' AS thread_id,
    (lower(coalesce(ca.metadata->>'from','')) = lower(coalesce(c.email,''))) AS from_lender
  FROM public.lender_contacts lc
  JOIN public.contact_activities ca ON ca.contact_id = lc.contact_id AND ca.activity_type = 'email'
  JOIN public.contacts c ON c.id = lc.contact_id
  WHERE lc.contact_id IS NOT NULL
  ORDER BY ca.contact_id, ca.occurred_at, ca.subject, ca.id
), imp_threads AS (
  SELECT lender_id, thread_id, max(occurred_at) AS at FROM imported
  WHERE thread_id IS NOT NULL GROUP BY 1,2 HAVING bool_or(from_lender) AND bool_or(NOT from_lender)
), two_way AS (
  SELECT lender_id, max(at) AS last_two_way_email_at FROM (SELECT * FROM eng_threads UNION ALL SELECT * FROM imp_threads) t GROUP BY 1
), on_deal AS (
  SELECT master_lender_id AS lender_id FROM public.deal_lenders
  WHERE master_lender_id IS NOT NULL AND lower(coalesce(stage,'')) IN
    ('sent drl','reviewing-drl','reviewing','in review','management-call-set','management-call-completed','draft-terms','term-sheet','term-sheets','terms issued','approved','funded')
  GROUP BY 1
), ids AS (
  SELECT lender_id FROM eng UNION SELECT lender_id FROM two_way UNION SELECT lender_id FROM on_deal
)
SELECT ids.lender_id, eng.first_met_at, eng.last_met_at, coalesce(eng.call_meeting_count,0) AS call_meeting_count,
  tw.last_two_way_email_at, eng.last_engagement_at,
  (od.lender_id IS NOT NULL) AS on_deal_sent_drl_or_later,
  array_remove(ARRAY[
    CASE WHEN coalesce(eng.has_claap,false) THEN 'claap_call' END,
    CASE WHEN tw.lender_id IS NOT NULL THEN 'two_way_email' END,
    CASE WHEN od.lender_id IS NOT NULL THEN 'on_deal' END,
    CASE WHEN coalesce(eng.has_gcal,false) THEN 'calendar_event' END], NULL) AS signals,
  (coalesce(eng.call_meeting_count,0) > 0 OR tw.lender_id IS NOT NULL OR od.lender_id IS NOT NULL) AS is_met
FROM ids
LEFT JOIN eng ON eng.lender_id = ids.lender_id
LEFT JOIN two_way tw ON tw.lender_id = ids.lender_id
LEFT JOIN on_deal od ON od.lender_id = ids.lender_id;

GRANT SELECT ON public.lender_met_status TO authenticated;
GRANT SELECT ON public.lender_met_status TO service_role;
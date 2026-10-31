CREATE TABLE public.channel_partner_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('added', 'stage_changed')),
  from_stage TEXT CHECK (from_stage IN ('prospect','nurturing','trial','engaged')),
  to_stage TEXT CHECK (to_stage IN ('prospect','nurturing','trial','engaged')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  CHECK (event_type = 'added' OR (from_stage IS NOT NULL AND to_stage IS NOT NULL AND from_stage <> to_stage))
);
GRANT SELECT ON public.channel_partner_history TO authenticated;
GRANT ALL ON public.channel_partner_history TO service_role;
ALTER TABLE public.channel_partner_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read channel partner history" ON public.channel_partner_history
FOR SELECT TO authenticated USING (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.channel_partners p WHERE p.id = channel_partner_id AND p.company_id = channel_partner_history.company_id)
);
CREATE INDEX channel_partner_history_partner_time_idx ON public.channel_partner_history(channel_partner_id, occurred_at DESC);
CREATE UNIQUE INDEX channel_partner_history_added_idx ON public.channel_partner_history(channel_partner_id) WHERE event_type = 'added';
CREATE FUNCTION public.record_channel_partner_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.channel_partner_history(channel_partner_id, company_id, event_type, to_stage, occurred_at, actor_user_id)
    VALUES (NEW.id, NEW.company_id, 'added', NEW.stage, NEW.created_at, auth.uid());
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.channel_partner_history(channel_partner_id, company_id, event_type, from_stage, to_stage, occurred_at, actor_user_id)
    VALUES (NEW.id, NEW.company_id, 'stage_changed', OLD.stage, NEW.stage, clock_timestamp(), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_channel_partner_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER channel_partner_history_record AFTER INSERT OR UPDATE OF stage ON public.channel_partners
FOR EACH ROW EXECUTE FUNCTION public.record_channel_partner_history();
INSERT INTO public.channel_partner_history(channel_partner_id, company_id, event_type, occurred_at, actor_user_id)
SELECT id, company_id, 'added', created_at, created_by FROM public.channel_partners;
COMMENT ON TABLE public.channel_partner_history IS 'Append-only pipeline additions and stage moves. Existing partners have their known creation date backfilled; earlier stage moves are unavailable.';
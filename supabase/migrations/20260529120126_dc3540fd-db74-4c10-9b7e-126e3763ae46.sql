-- FinServ Projects: per-deal project records; deal one_time_revenue auto-syncs from sum(value)
CREATE TABLE public.finserv_deal_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'PROJECT',
  start_date DATE,
  completion_date DATE,
  description TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finserv_deal_projects_deal_id ON public.finserv_deal_projects(deal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finserv_deal_projects TO authenticated;
GRANT ALL ON public.finserv_deal_projects TO service_role;

ALTER TABLE public.finserv_deal_projects ENABLE ROW LEVEL SECURITY;

-- Access is gated by the parent deal's RLS via EXISTS subquery.
CREATE POLICY "View finserv projects for accessible deals"
  ON public.finserv_deal_projects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Insert finserv projects for accessible deals"
  ON public.finserv_deal_projects FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Update finserv projects for accessible deals"
  ON public.finserv_deal_projects FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Delete finserv projects for accessible deals"
  ON public.finserv_deal_projects FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

-- Keep updated_at fresh
CREATE TRIGGER trg_finserv_deal_projects_updated_at
  BEFORE UPDATE ON public.finserv_deal_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sync deals.one_time_revenue to SUM(value) of projects for that deal
CREATE OR REPLACE FUNCTION public.sync_finserv_deal_one_time_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deal UUID;
  _total NUMERIC;
BEGIN
  _deal := COALESCE(NEW.deal_id, OLD.deal_id);
  SELECT COALESCE(SUM(value), 0) INTO _total
    FROM public.finserv_deal_projects WHERE deal_id = _deal;
  UPDATE public.deals
    SET one_time_revenue = _total,
        updated_at = now()
    WHERE id = _deal;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_finserv_projects_sync_otr
  AFTER INSERT OR UPDATE OR DELETE ON public.finserv_deal_projects
  FOR EACH ROW EXECUTE FUNCTION public.sync_finserv_deal_one_time_revenue();

-- Idempotent backfill: for every FinServ deal that already has a one_time_revenue
-- value but no projects yet, create a placeholder "PROJECT" row matching that amount.
INSERT INTO public.finserv_deal_projects (deal_id, name, value, created_by)
SELECT d.id, 'PROJECT', d.one_time_revenue, d.user_id
  FROM public.deals d
 WHERE d.deal_class = 'finserv'
   AND d.one_time_revenue IS NOT NULL
   AND d.one_time_revenue > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.finserv_deal_projects p WHERE p.deal_id = d.id
   );

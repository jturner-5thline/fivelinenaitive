-- Mode flag on deals — defaults to existing manual behavior
ALTER TABLE public.deals
  ADD COLUMN mrr_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (mrr_mode IN ('manual', 'calculated'));

-- Per-deal MRR component rows (FinServ hourly-rate builder)
CREATE TABLE public.finserv_mrr_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  label TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  estimated_hours NUMERIC NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finserv_mrr_components_deal_id ON public.finserv_mrr_components(deal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finserv_mrr_components TO authenticated;
GRANT ALL ON public.finserv_mrr_components TO service_role;

ALTER TABLE public.finserv_mrr_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View mrr components for accessible deals"
  ON public.finserv_mrr_components FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Insert mrr components for accessible deals"
  ON public.finserv_mrr_components FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Update mrr components for accessible deals"
  ON public.finserv_mrr_components FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE POLICY "Delete mrr components for accessible deals"
  ON public.finserv_mrr_components FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

CREATE TRIGGER trg_finserv_mrr_components_updated_at
  BEFORE UPDATE ON public.finserv_mrr_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recompute deals.mrr from component rows, but only when the deal is in 'calculated' mode.
-- Manual mode leaves the existing mrr value alone.
CREATE OR REPLACE FUNCTION public.sync_finserv_deal_mrr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deal UUID;
  _mode TEXT;
  _total NUMERIC;
BEGIN
  _deal := COALESCE(NEW.deal_id, OLD.deal_id);
  SELECT mrr_mode INTO _mode FROM public.deals WHERE id = _deal;
  IF _mode IS DISTINCT FROM 'calculated' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(hourly_rate * estimated_hours), 0) INTO _total
    FROM public.finserv_mrr_components WHERE deal_id = _deal;
  UPDATE public.deals
     SET mrr = _total,
         updated_at = now()
   WHERE id = _deal;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_finserv_mrr_components_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.finserv_mrr_components
  FOR EACH ROW EXECUTE FUNCTION public.sync_finserv_deal_mrr();

-- When a deal flips into 'calculated' mode, immediately recompute mrr from its components.
CREATE OR REPLACE FUNCTION public.sync_finserv_deal_mrr_on_mode_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total NUMERIC;
BEGIN
  IF NEW.mrr_mode = 'calculated'
     AND (TG_OP = 'INSERT' OR OLD.mrr_mode IS DISTINCT FROM 'calculated') THEN
    SELECT COALESCE(SUM(hourly_rate * estimated_hours), 0) INTO _total
      FROM public.finserv_mrr_components WHERE deal_id = NEW.id;
    NEW.mrr := _total;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deals_mrr_mode_sync
  BEFORE INSERT OR UPDATE OF mrr_mode ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.sync_finserv_deal_mrr_on_mode_change();
